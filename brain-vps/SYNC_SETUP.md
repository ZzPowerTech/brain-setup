# Setup: Sincronizador CouchDB → Filesystem

## O que é

Script Node.js que sincroniza documentos do CouchDB (Obsidian LiveSync) para o filesystem (`/opt/brain/vault/`). Roda como serviço systemd a cada 30 segundos.

**Resultado:** o dashboard mostra dados reais do seu vault Obsidian, não testes.

## Deploy na VPS

### 1. Copiar arquivos

```bash
scp -i ~/.ssh/brain_vps sync-couchdb-to-fs.js root@187.124.243.193:/opt/brain/
scp -i ~/.ssh/brain_vps brain-sync.service root@187.124.243.193:/etc/systemd/system/
```

### 2. Dar permissão de execução

```bash
ssh -i ~/.ssh/brain_vps root@187.124.243.193 chmod +x /opt/brain/sync-couchdb-to-fs.js
```

### 3. Ativar o serviço

```bash
ssh -i ~/.ssh/brain_vps root@187.124.243.193 "systemctl daemon-reload && systemctl enable brain-sync && systemctl start brain-sync"
```

### 4. Verificar status

```bash
ssh -i ~/.ssh/brain_vps root@187.124.243.193 "systemctl status brain-sync"
```

Ver logs em tempo real:

```bash
ssh -i ~/.ssh/brain_vps root@187.124.243.193 "journalctl -u brain-sync -f"
```

## Como funciona

1. **A cada 30 segundos** o script faz request para `https://sync.weissmurillo.de/`
2. **Lê todos os documentos** do banco `obsidian` (criado pelo LiveSync)
3. **Mapeia para diretórios:**
   - `daily/` → `/opt/brain/vault/01-daily/`
   - `claude/` → `/opt/brain/vault/02-claude/`
   - `projects/` → `/opt/brain/vault/03-projetos/`
   - `research/` → `/opt/brain/vault/04-research/`
   - `archive/` → `/opt/brain/vault/05-archive/`
4. **Escreve arquivos** com conteúdo do CouchDB
5. **Brain API lê direto** do filesystem (sem mudanças no código)

## Variáveis de ambiente

Configuradas em `/opt/brain/.env`:

```
COUCHDB_PASSWORD=<sua_senha_couchdb>
```

O script adiciona:
- `COUCHDB_URL=https://sync.weissmurillo.de`
- `COUCHDB_USER=admin`
- `VAULT_PATH=/opt/brain/vault`
- `SYNC_INTERVAL=30000` (30 segundos)

## Validação

Após deploy, você deve ver no dashboard:
- ✓ Projetos reais (ex: AusTV com dados corretos)
- ✓ Daily notes sincronizadas
- ✓ Contexto Claude atualizado

Logs devem mostrar:
```
[SYNC] Iniciando sincronização em 2026-03-26T...
[INFO] Encontrados 42 documentos no CouchDB
[SYNC] daily/2026-03-26.md → /opt/brain/vault/01-daily/...
[SYNC] ✓ Sincronização concluída: 42 notas
```

## Parar/reiniciar

```bash
# Parar
systemctl stop brain-sync

# Reiniciar
systemctl restart brain-sync

# Ver logs
journalctl -u brain-sync -n 50
```

## Troubleshooting

**Script não inicia:**
```bash
node /opt/brain/sync-couchdb-to-fs.js
```

**Erro de autenticação CouchDB:**
- Verifica se `COUCHDB_PASSWORD` está correto em `/opt/brain/.env`
- Testa manualmente: `curl -u admin:senha https://sync.weissmurillo.de/`

**Arquivos não aparecem:**
- Espera 30+ segundos (intervalo de sincronização)
- Verifica se `01-daily/`, `02-claude/`, etc. existem em `/opt/brain/vault/`
- Testa: `ls -la /opt/brain/vault/`
