#!/usr/bin/env node

/**
 * Sincroniza documentos do CouchDB (Obsidian LiveSync) para o filesystem.
 * Reconstrói arquivos a partir dos chunks (leaf documents) e escreve em /opt/brain/vault/.
 * Roda como serviço systemd na VPS.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Config
const COUCHDB_HOST = process.env.COUCHDB_HOST || '127.0.0.1';
const COUCHDB_PORT = parseInt(process.env.COUCHDB_PORT || '5984');
const COUCHDB_USER = process.env.COUCHDB_USER || 'admin';
const COUCHDB_PASSWORD = process.env.COUCHDB_PASSWORD || '';
const COUCHDB_DB = process.env.COUCHDB_DB || 'obsidian-livesync';
const VAULT_PATH = process.env.VAULT_PATH || '/opt/brain/vault';
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL || '30000');

// Extensões de texto para sincronizar (pula binários)
const SYNC_EXTENSIONS = new Set(['.md', '.json', '.csv', '.log', '.txt', '.sh', '.py', '.ps1']);

/**
 * Request HTTP para CouchDB local (sem SSL — mais rápido e confiável)
 */
function couchdbRequest(reqPath) {
  return new Promise((resolve, reject) => {
    const auth = Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASSWORD}`).toString('base64');

    const options = {
      hostname: COUCHDB_HOST,
      port: COUCHDB_PORT,
      path: reqPath,
      method: 'GET',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Accept': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode >= 400) {
          reject(new Error(`CouchDB ${res.statusCode}: ${body.substring(0, 200)}`));
        } else {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(body);
          }
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

/**
 * Decodifica dados de um leaf chunk.
 * LiveSync usa texto puro (com \n) ou base64 (sem \n).
 */
function decodeChunkData(data) {
  if (typeof data !== 'string') return '';
  if (data.includes('\n')) return data;
  try {
    return Buffer.from(data, 'base64').toString('utf-8');
  } catch {
    return data;
  }
}

/**
 * Busca e reconstrói o conteúdo de um documento a partir dos seus chunks.
 */
async function reconstructContent(childrenIds) {
  if (!childrenIds || childrenIds.length === 0) return '';

  // Busca todos os leaves em batch via _all_docs
  const keys = JSON.stringify({ keys: childrenIds });

  const response = await new Promise((resolve, reject) => {
    const auth = Buffer.from(`${COUCHDB_USER}:${COUCHDB_PASSWORD}`).toString('base64');
    const reqPath = `/${encodeURIComponent(COUCHDB_DB)}/_all_docs?include_docs=true`;
    const postData = keys;

    const options = {
      hostname: COUCHDB_HOST,
      port: COUCHDB_PORT,
      path: reqPath,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = http.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        if (res.statusCode >= 400) {
          reject(new Error(`CouchDB ${res.statusCode}: ${body.substring(0, 200)}`));
        } else {
          try { resolve(JSON.parse(body)); } catch { reject(new Error('JSON parse error')); }
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(postData);
    req.end();
  });

  if (!response.rows) return '';

  // Monta mapa id → data para preservar a ordem do array children
  const leafMap = new Map();
  for (const row of response.rows) {
    if (row.doc && row.doc.data !== undefined) {
      leafMap.set(row.id, row.doc.data);
    }
  }

  // Concatena na ordem original dos children
  const parts = [];
  for (const id of childrenIds) {
    const data = leafMap.get(id);
    if (data !== undefined) {
      parts.push(decodeChunkData(data));
    }
  }

  return parts.join('');
}

/**
 * Verifica se o arquivo deve ser sincronizado (texto, não binário)
 */
function shouldSync(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return SYNC_EXTENSIONS.has(ext);
}

/**
 * Sincronização completa: CouchDB → Filesystem
 */
async function syncFromCouchDB() {
  const start = Date.now();
  console.log(`\n[SYNC] Iniciando em ${new Date().toISOString()}`);

  try {
    // 1. Busca todos os documentos
    const response = await couchdbRequest(
      `/${encodeURIComponent(COUCHDB_DB)}/_all_docs?include_docs=true`
    );

    if (!response.rows) {
      console.log('[INFO] Nenhum documento no CouchDB');
      return;
    }

    // 2. Filtra notas (plain e newnote com path)
    const notes = response.rows
      .filter(row => !row.id.startsWith('_') && row.doc)
      .map(row => row.doc)
      .filter(doc => (doc.type === 'plain' || doc.type === 'newnote') && doc.path);

    console.log(`[INFO] ${notes.length} notas encontradas`);

    let synced = 0;
    let skipped = 0;
    let errors = 0;

    // 3. Reconstrói e escreve cada nota
    for (const note of notes) {
      try {
        const notePath = note.path;

        if (!shouldSync(notePath)) {
          skipped++;
          continue;
        }

        // Reconstrói conteúdo dos chunks
        const content = await reconstructContent(note.children);

        if (!content) {
          console.warn(`[WARN] Sem conteúdo: ${notePath}`);
          skipped++;
          continue;
        }

        // Escreve no filesystem preservando path original
        const fullPath = path.join(VAULT_PATH, notePath);
        const dir = path.dirname(fullPath);

        // Segurança: garante que o path está dentro do vault
        const resolved = path.resolve(fullPath);
        if (!resolved.startsWith(path.resolve(VAULT_PATH))) {
          console.warn(`[WARN] Path fora do vault: ${notePath}`);
          continue;
        }

        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
        synced++;

      } catch (error) {
        console.error(`[ERROR] ${note.path}: ${error.message}`);
        errors++;
      }
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[SYNC] Concluído em ${elapsed}s: ${synced} sincronizados, ${skipped} ignorados, ${errors} erros`);

  } catch (error) {
    console.error('[ERROR] Sincronização falhou:', error.message);
  }
}

/**
 * Inicia sincronização periódica
 */
function startSync() {
  console.log('[INFO] Brain Sync iniciado');
  console.log(`[INFO] CouchDB: ${COUCHDB_HOST}:${COUCHDB_PORT}/${COUCHDB_DB}`);
  console.log(`[INFO] Vault: ${VAULT_PATH}`);
  console.log(`[INFO] Intervalo: ${SYNC_INTERVAL}ms`);

  syncFromCouchDB();
  setInterval(syncFromCouchDB, SYNC_INTERVAL);
}

process.on('SIGTERM', () => { console.log('[INFO] Encerrando...'); process.exit(0); });
process.on('SIGINT', () => { console.log('[INFO] Encerrando...'); process.exit(0); });

startSync();
