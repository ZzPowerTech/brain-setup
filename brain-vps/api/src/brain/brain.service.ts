import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import yaml from 'js-yaml';
import { createHash } from 'crypto';

export interface NotePreview {
  title: string;
  path: string;
  tags: string[];
  preview: string;
  score: number;
}

export interface NoteDetail {
  title: string;
  path: string;
  frontmatter: Record<string, unknown>;
  content: string;
}

export interface ProjectDetail {
  project: string;
  files: Array<{
    title: string;
    path: string;
    tags: string[];
    preview: string;
  }>;
}

export interface FolderTreeNode {
  name: string;
  type: 'folder' | 'file';
  children?: FolderTreeNode[];
}

export interface ClaudeContext {
  [key: string]: string;
}

export interface TaskItem {
  text: string;
  done: boolean;
  file: string;
  line: number;
}

export interface TasksResult {
  tasks: TaskItem[];
}

export interface TagsResult {
  tags: Record<string, number>;
}

interface IndexEntry {
  hash: string;
  title: string;
  preview: string;
  vector: number[];
}

interface EmbedIndex {
  model: string;
  dim: number;
  notes: Record<string, IndexEntry>;
}

// Caminhos internos do vault — alterar aqui reflete em todos os endpoints
const VAULT_PATHS = {
  claudeFiles: ['CLAUDE.md', 'MEMORY.md'],
  memoryDir: 'memory',
  projectsDir: 'projects',
  dailyDir: 'daily',
  // Lixeira do soft-delete. Começa com '.' → ignorada por search/structure/getAllMdFiles.
  trashDir: 'archive/.trash',
} as const;

// Busca semântica (Gemini embeddings)
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIM = 768;
const MAX_EMBED_CHARS = 8000;

@Injectable()
export class BrainService {
  private readonly vaultPath: string;

  constructor(private readonly config: ConfigService) {
    const rawPath = this.config.get<string>('VAULT_PATH') ?? '/opt/brain/vault';
    // Resolve para caminho absoluto normalizado uma única vez
    this.vaultPath = path.resolve(rawPath);
  }

  // ─── Segurança: validação de path traversal ──────────────────────────────

  private resolveSafePath(relativePath: string): string {
    // Rejeita caminhos com sequências suspeitas antes mesmo de resolver
    if (
      relativePath.includes('\0') ||
      relativePath.includes('..') ||
      path.isAbsolute(relativePath)
    ) {
      throw new BadRequestException('Caminho inválido');
    }

    const resolved = path.resolve(this.vaultPath, relativePath);

    // Garante que o caminho resolvido está dentro do vault (previne symlink bypass)
    if (!resolved.startsWith(this.vaultPath + path.sep) && resolved !== this.vaultPath) {
      throw new BadRequestException('Caminho inválido: fora do vault');
    }

    return resolved;
  }

  // ─── Busca ────────────────────────────────────────────────────────────────

  async search(query: string, limit = 10): Promise<NotePreview[]> {
    const results: NotePreview[] = [];
    const files = await this.getAllMdFiles(this.vaultPath);
    const lowerQuery = query.toLowerCase();

    for (const file of files) {
      const content = await fs.promises.readFile(file, 'utf-8');
      const parsed = matter(content);
      const title = path.basename(file, '.md');
      const relativePath = path.relative(this.vaultPath, file);

      const matchesTitle = title.toLowerCase().includes(lowerQuery);
      const matchesContent = parsed.content.toLowerCase().includes(lowerQuery);

      if (matchesTitle || matchesContent) {
        results.push({
          title,
          path: relativePath,
          tags: Array.isArray(parsed.data['tags']) ? (parsed.data['tags'] as string[]) : [],
          preview: parsed.content.substring(0, 300).trim(),
          score: matchesTitle ? 2 : 1,
        });
      }

      // Buffer para ordenação: coleta o dobro do limite e para
      if (results.length >= limit * 2) break;
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // ─── Leitura de nota ──────────────────────────────────────────────────────

  async read(notePath: string): Promise<NoteDetail | null> {
    const fullPath = this.resolveSafePath(notePath);

    try {
      await fs.promises.access(fullPath);
    } catch {
      return null;
    }

    const content = await fs.promises.readFile(fullPath, 'utf-8');
    const parsed = matter(content);

    return {
      title: path.basename(notePath, '.md'),
      path: notePath,
      frontmatter: parsed.data as Record<string, unknown>,
      content: parsed.content,
    };
  }

  // ─── Contexto Claude ──────────────────────────────────────────────────────

  async getClaudeContext(): Promise<ClaudeContext> {
    const files = VAULT_PATHS.claudeFiles;

    const result: ClaudeContext = {};

    for (const file of files) {
      const note = await this.read(file);
      if (note) {
        const key = path.basename(file, '.md');
        result[key] = note.content;
      }
    }

    return result;
  }

  // ─── Memory ──────────────────────────────────────────────────────────────

  async getMemory(): Promise<Record<string, string>> {
    const memoryPath = this.resolveSafePath(VAULT_PATHS.memoryDir);
    const result: Record<string, string> = {};

    try {
      const entries = await fs.promises.readdir(memoryPath);
      const mdFiles = entries.filter((f) => f.endsWith('.md'));

      for (const file of mdFiles) {
        const content = await fs.promises.readFile(path.join(memoryPath, file), 'utf-8');
        const parsed = matter(content);
        const key = path.basename(file, '.md');
        result[key] = parsed.content;
      }
    } catch {
      // memoryDir pode não existir ainda
    }

    return result;
  }

  // ─── Projeto ──────────────────────────────────────────────────────────────

  async getProject(projectName: string): Promise<ProjectDetail | null> {
    // Usa resolveSafePath para validação consistente de path traversal
    // Constrói um path relativo e delega a validação ao método centralizado
    const relativePath = path.join(VAULT_PATHS.projectsDir, projectName);
    const projectPath = this.resolveSafePath(relativePath);

    try {
      await fs.promises.access(projectPath);
    } catch {
      return null;
    }

    const allFiles = await this.getAllMdFiles(projectPath);

    const files = await Promise.all(
      allFiles.map(async (fullFilePath) => {
        const content = await fs.promises.readFile(fullFilePath, 'utf-8');
        const parsed = matter(content);
        const relativeFilePath = path.relative(this.vaultPath, fullFilePath).replace(/\\/g, '/');
        return {
          title: path.basename(fullFilePath, '.md'),
          path: relativeFilePath,
          tags: Array.isArray(parsed.data['tags']) ? (parsed.data['tags'] as string[]) : [],
          preview: parsed.content.substring(0, 200).trim(),
        };
      }),
    );

    return { project: projectName, files };
  }

  // ─── Daily note ───────────────────────────────────────────────────────────

  async getDailyNote(date?: string): Promise<NoteDetail | null> {
    const today = date ?? new Date().toISOString().split('T')[0];

    // Valida formato de data para evitar injeção via parâmetro de data
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
      throw new BadRequestException('Formato de data inválido. Use YYYY-MM-DD');
    }

    return this.read(`${VAULT_PATHS.dailyDir}/${today}.md`);
  }

  // ─── Estrutura do vault ───────────────────────────────────────────────────

  async getStructure(): Promise<FolderTreeNode[]> {
    return this.getFolderTree(this.vaultPath, 4);
  }

  async getStats(): Promise<{ totalNotes: number; totalFolders: number }> {
    const files = await this.getAllMdFiles(this.vaultPath);
    const tree = await this.getFolderTree(this.vaultPath, 1);
    const totalFolders = tree.filter(n => n.type === 'folder').length;
    return { totalNotes: files.length, totalFolders };
  }

  // ─── Utilitários privados ─────────────────────────────────────────────────

  private async getAllMdFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return files;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const nested = await this.getAllMdFiles(fullPath);
        files.push(...nested);
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private async getFolderTree(dir: string, depth: number): Promise<FolderTreeNode[]> {
    if (depth === 0) return [];

    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    const nodes = await Promise.all(
      entries
        .filter((e) => !e.name.startsWith('.'))
        .map(async (e): Promise<FolderTreeNode> => {
          if (e.isDirectory()) {
            return {
              name: e.name,
              type: 'folder',
              children: await this.getFolderTree(path.join(dir, e.name), depth - 1),
            };
          }
          return { name: e.name, type: 'file' };
        }),
    );

    return nodes;
  }

  // ─── Criar nota ───────────────────────────────────────────────────────────

  async createNote(notePath: string, content: string, frontmatter: Record<string, unknown>): Promise<void> {
    const fullPath = this.resolveSafePath(notePath);

    // Criar diretórios pai se necessário
    const dir = path.dirname(fullPath);
    await fs.promises.mkdir(dir, { recursive: true });

    // Compilar frontmatter YAML + conteúdo
    const yamlStr = yaml.dump(frontmatter);
    const markdown = `---\n${yamlStr}---\n\n${content}`;

    await fs.promises.writeFile(fullPath, markdown, 'utf-8');
  }

  // ─── Daily note — criar ───────────────────────────────────────────────────

  async createDailyNote(date?: string): Promise<{ note: NoteDetail; created: boolean }> {
    const today = date ?? new Date().toISOString().split('T')[0];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
      throw new BadRequestException('Formato de data inválido. Use YYYY-MM-DD');
    }

    const relativePath = `${VAULT_PATHS.dailyDir}/${today}.md`;
    const existing = await this.read(relativePath);

    if (existing) {
      return { note: existing, created: false };
    }

    const template = [
      `## Tasks`,
      ``,
      `## Notes`,
      ``,
      `## Log`,
    ].join('\n');

    const frontmatter: Record<string, unknown> = {
      date: today,
      type: 'daily',
      tags: ['daily'],
    };

    await this.createNote(relativePath, template, frontmatter);

    const note = await this.read(relativePath);
    if (!note) {
      throw new NotFoundException('Falha ao criar daily note');
    }

    return { note, created: true };
  }

  // ─── Daily note — append ──────────────────────────────────────────────────

  async appendDailyNote(content: string, date?: string): Promise<NoteDetail> {
    const today = date ?? new Date().toISOString().split('T')[0];

    if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) {
      throw new BadRequestException('Formato de data inválido. Use YYYY-MM-DD');
    }

    const relativePath = `${VAULT_PATHS.dailyDir}/${today}.md`;

    const existing = await this.read(relativePath);
    if (!existing) {
      await this.createDailyNote(today);
    }

    await this.appendToFile(relativePath, content);

    const updated = await this.read(relativePath);
    if (!updated) {
      throw new NotFoundException('Falha ao ler daily note após append');
    }

    return updated;
  }

  // ─── Append genérico ──────────────────────────────────────────────────────

  async appendNote(notePath: string, content: string): Promise<NoteDetail> {
    const existing = await this.read(notePath);

    if (!existing) {
      throw new NotFoundException('Nota não encontrada');
    }

    await this.appendToFile(notePath, content);

    const updated = await this.read(notePath);
    if (!updated) {
      throw new NotFoundException('Falha ao ler nota após append');
    }

    return updated;
  }

  // ─── Tasks — listar ───────────────────────────────────────────────────────

  async listTasks(opts: {
    daily?: boolean;
    done?: boolean;
    todo?: boolean;
    path?: string;
    limit?: number;
  }): Promise<TasksResult> {
    const limit = Math.min(opts.limit ?? 100, 1000);

    let searchRoot: string;
    if (opts.path) {
      searchRoot = this.resolveSafePath(opts.path);
    } else if (opts.daily) {
      searchRoot = this.resolveSafePath(VAULT_PATHS.dailyDir);
    } else {
      searchRoot = this.vaultPath;
    }

    const files = await this.getAllMdFiles(searchRoot);
    const tasks: TaskItem[] = [];

    for (const file of files) {
      const raw = await fs.promises.readFile(file, 'utf-8');
      const lines = raw.split('\n');
      const relativePath = path.relative(this.vaultPath, file).replace(/\\/g, '/');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const uncheckedMatch = /^- \[ \] (.+)$/.exec(line);
        const checkedMatch = /^- \[x\] (.+)$/i.exec(line);

        if (uncheckedMatch) {
          const taskItem: TaskItem = {
            text: uncheckedMatch[1],
            done: false,
            file: relativePath,
            line: i + 1,
          };

          if (opts.done === true) continue;
          tasks.push(taskItem);
        } else if (checkedMatch) {
          const taskItem: TaskItem = {
            text: checkedMatch[1],
            done: true,
            file: relativePath,
            line: i + 1,
          };

          if (opts.todo === true) continue;
          tasks.push(taskItem);
        }

        if (tasks.length >= limit) break;
      }

      if (tasks.length >= limit) break;
    }

    return { tasks };
  }

  // ─── Tasks — toggle ───────────────────────────────────────────────────────

  async toggleTask(filePath: string, lineNumber: number): Promise<{ success: boolean; task: { text: string; done: boolean } }> {
    const fullPath = this.resolveSafePath(filePath);

    let raw: string;
    try {
      raw = await fs.promises.readFile(fullPath, 'utf-8');
    } catch {
      throw new NotFoundException('Arquivo não encontrado');
    }

    const lines = raw.split('\n');
    const lineIndex = lineNumber - 1;

    if (lineIndex < 0 || lineIndex >= lines.length) {
      throw new BadRequestException(`Linha ${lineNumber} não existe no arquivo`);
    }

    const line = lines[lineIndex];
    const uncheckedMatch = /^(- \[ \] )(.+)$/.exec(line);
    const checkedMatch = /^(- \[x\] )(.+)$/i.exec(line);

    if (!uncheckedMatch && !checkedMatch) {
      throw new BadRequestException(`A linha ${lineNumber} não é uma task válida`);
    }

    let newDone: boolean;
    let taskText: string;

    if (uncheckedMatch) {
      lines[lineIndex] = `- [x] ${uncheckedMatch[2]}`;
      newDone = true;
      taskText = uncheckedMatch[2];
    } else {
      lines[lineIndex] = `- [ ] ${checkedMatch![2]}`;
      newDone = false;
      taskText = checkedMatch![2];
    }

    await fs.promises.writeFile(fullPath, lines.join('\n'), 'utf-8');

    return {
      success: true,
      task: { text: taskText, done: newDone },
    };
  }

  // ─── Tags — listar ────────────────────────────────────────────────────────

  async listTags(): Promise<TagsResult> {
    const files = await this.getAllMdFiles(this.vaultPath);
    const tagCounts: Record<string, number> = {};

    for (const file of files) {
      const raw = await fs.promises.readFile(file, 'utf-8');
      const parsed = matter(raw);

      // Tags do frontmatter YAML
      const frontmatterTags = parsed.data['tags'];
      if (Array.isArray(frontmatterTags)) {
        for (const tag of frontmatterTags as unknown[]) {
          if (typeof tag === 'string' && tag.trim()) {
            const normalized = tag.trim().toLowerCase();
            tagCounts[normalized] = (tagCounts[normalized] ?? 0) + 1;
          }
        }
      }

      // Tags inline #tag no corpo do conteúdo (exclui blocos de código)
      const contentWithoutCode = parsed.content
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`[^`]+`/g, '');
      const inlineTagRegex = /#([a-zA-Z][a-zA-Z0-9_/-]*)/g;
      let match: RegExpExecArray | null;
      while ((match = inlineTagRegex.exec(contentWithoutCode)) !== null) {
        const tag = match[1].toLowerCase();
        tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
      }
    }

    return { tags: tagCounts };
  }

  // ─── Utilitário privado: append em arquivo ────────────────────────────────

  private async appendToFile(relativePath: string, content: string): Promise<void> {
    const fullPath = this.resolveSafePath(relativePath);
    const existing = await fs.promises.readFile(fullPath, 'utf-8');
    const separator = existing.endsWith('\n') ? '' : '\n';
    await fs.promises.appendFile(fullPath, `${separator}\n${content}`, 'utf-8');
  }

  // ─── Escrita atômica ──────────────────────────────────────────────────────

  // Escreve num arquivo temporário no mesmo diretório e renomeia por cima.
  // rename() é atômico no mesmo filesystem → nunca deixa a nota meio-escrita.
  private async atomicWrite(fullPath: string, content: string): Promise<void> {
    const tmpPath = `${fullPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tmpPath, content, 'utf-8');
    try {
      await fs.promises.rename(tmpPath, fullPath);
    } catch (err) {
      await fs.promises.rm(tmpPath, { force: true });
      throw err;
    }
  }

  // ─── Update por âncora (str_replace) ──────────────────────────────────────

  async updateNote(
    notePath: string,
    oldString: string,
    newString: string,
    replaceAll = false,
  ): Promise<NoteDetail> {
    const fullPath = this.resolveSafePath(notePath);

    let raw: string;
    try {
      raw = await fs.promises.readFile(fullPath, 'utf-8');
    } catch {
      throw new NotFoundException('Nota não encontrada');
    }

    if (oldString === newString) {
      throw new BadRequestException('oldString e newString são idênticos — nada a alterar');
    }

    const occurrences = raw.split(oldString).length - 1;
    if (occurrences === 0) {
      throw new BadRequestException('Âncora (oldString) não encontrada na nota');
    }
    if (occurrences > 1 && !replaceAll) {
      throw new BadRequestException(
        `Âncora aparece ${occurrences} vezes na nota. Forneça uma âncora única ou use replaceAll.`,
      );
    }

    const updated = replaceAll
      ? raw.split(oldString).join(newString)
      : raw.replace(oldString, newString);

    await this.atomicWrite(fullPath, updated);

    const note = await this.read(notePath);
    if (!note) {
      throw new NotFoundException('Falha ao ler nota após update');
    }
    return note;
  }

  // ─── Soft delete (move para a lixeira, nunca rm real) ─────────────────────

  async deleteNote(notePath: string): Promise<{ success: boolean; trashedTo: string }> {
    const fullPath = this.resolveSafePath(notePath);

    try {
      await fs.promises.access(fullPath);
    } catch {
      throw new NotFoundException('Nota não encontrada');
    }

    // archive/.trash/<timestamp>__<caminho-achatado>.md
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const flat = notePath.replace(/[\\/]/g, '__');
    const trashRelative = `${VAULT_PATHS.trashDir}/${stamp}__${flat}`;
    const trashFull = this.resolveSafePath(trashRelative);

    await fs.promises.mkdir(path.dirname(trashFull), { recursive: true });
    await fs.promises.rename(fullPath, trashFull);

    return { success: true, trashedTo: trashRelative };
  }

  // ─── Rename / move ────────────────────────────────────────────────────────

  async renameNote(fromPath: string, toPath: string): Promise<NoteDetail> {
    const fromFull = this.resolveSafePath(fromPath);
    const toFull = this.resolveSafePath(toPath);

    try {
      await fs.promises.access(fromFull);
    } catch {
      throw new NotFoundException('Nota de origem não encontrada');
    }

    const destExists = await fs.promises
      .access(toFull)
      .then(() => true)
      .catch(() => false);
    if (destExists) {
      throw new BadRequestException('Já existe uma nota no destino — rename não sobrescreve');
    }

    await fs.promises.mkdir(path.dirname(toFull), { recursive: true });
    await fs.promises.rename(fromFull, toFull);

    const note = await this.read(toPath);
    if (!note) {
      throw new NotFoundException('Falha ao ler nota após rename');
    }
    return note;
  }

  // ─── Busca semântica (embeddings Gemini) ──────────────────────────────────

  private get indexPath(): string {
    return this.config.get<string>('INDEX_PATH') ?? '/index/embeddings.json';
  }

  // Embeda um texto via Gemini. taskType distingue documento (indexação) de query (busca).
  private async embed(
    text: string,
    taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY',
  ): Promise<number[]> {
    const key = this.config.get<string>('GOOGLE_API_KEY');
    if (!key) {
      throw new BadRequestException('GOOGLE_API_KEY não configurada — busca semântica indisponível');
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${key}`;
    const body = {
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: text.slice(0, MAX_EMBED_CHARS) }] },
      taskType,
      outputDimensionality: EMBED_DIM,
    };
    // Retry com backoff exponencial para 429 (rate limit por minuto do free tier)
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = (await res.json()) as { embedding?: { values?: number[] } };
        const vec = data.embedding?.values;
        if (!Array.isArray(vec) || vec.length === 0) {
          throw new BadRequestException('Resposta de embedding inválida');
        }
        return this.normalize(vec);
      }
      if (res.status === 429 && attempt < maxAttempts) {
        await this.sleep(Math.min(60000, 3000 * 2 ** (attempt - 1))); // 3s, 6s, 12s, 24s
        continue;
      }
      const detail = (await res.text()).slice(0, 200);
      throw new BadRequestException(`Falha no embedding (${res.status}): ${detail}`);
    }
    throw new BadRequestException('Falha no embedding após múltiplas tentativas (rate limit)');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private normalize(v: number[]): number[] {
    let norm = 0;
    for (const x of v) norm += x * x;
    norm = Math.sqrt(norm) || 1;
    return v.map((x) => x / norm);
  }

  // Vetores já normalizados → produto escalar = cosseno.
  private dot(a: number[], b: number[]): number {
    let s = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) s += a[i] * b[i];
    return s;
  }

  private async loadIndex(): Promise<EmbedIndex> {
    try {
      const raw = await fs.promises.readFile(this.indexPath, 'utf-8');
      return JSON.parse(raw) as EmbedIndex;
    } catch {
      return { model: EMBED_MODEL, dim: EMBED_DIM, notes: {} };
    }
  }

  private async saveIndex(index: EmbedIndex): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.indexPath), { recursive: true });
    const tmp = `${this.indexPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(index), 'utf-8');
    await fs.promises.rename(tmp, this.indexPath);
  }

  // Reindexa o vault: embeda apenas notas novas/alteradas (comparação por hash de conteúdo).
  async reindex(): Promise<{
    indexed: number;
    skipped: number;
    removed: number;
    total: number;
    dim: number;
    partial: boolean;
    pending: number;
  }> {
    const index = await this.loadIndex();
    // Índice incompatível (modelo/dim diferentes) → reconstruir do zero
    if (index.model !== EMBED_MODEL || index.dim !== EMBED_DIM) {
      index.model = EMBED_MODEL;
      index.dim = EMBED_DIM;
      index.notes = {};
    }

    const files = await this.getAllMdFiles(this.vaultPath);
    const livePaths = new Set<string>();
    const pending: Array<{ relativePath: string; content: string; hash: string }> = [];
    let skipped = 0;

    for (const file of files) {
      const relativePath = path.relative(this.vaultPath, file).replace(/\\/g, '/');
      livePaths.add(relativePath);
      const content = await fs.promises.readFile(file, 'utf-8');
      const hash = createHash('sha256').update(content).digest('hex');
      const existing = index.notes[relativePath];
      if (existing && existing.hash === hash) {
        skipped++;
        continue;
      }
      pending.push({ relativePath, content, hash });
    }

    // Serial + checkpoint: respeita o rate limit do free tier e é resumível.
    // Se o rate limit persistir após os retries do embed(), para e salva o progresso;
    // basta re-rodar o reindex para continuar de onde parou (comparação por hash).
    let indexed = 0;
    let partial = false;
    for (const item of pending) {
      try {
        const parsed = matter(item.content);
        const title = path.basename(item.relativePath, '.md');
        const vector = await this.embed(`${title}\n\n${parsed.content}`, 'RETRIEVAL_DOCUMENT');
        index.notes[item.relativePath] = {
          hash: item.hash,
          title,
          preview: parsed.content.substring(0, 300).trim(),
          vector,
        };
        indexed++;
        if (indexed % 10 === 0) await this.saveIndex(index); // checkpoint resumível
      } catch {
        partial = true;
        break;
      }
    }

    // Remove do índice notas que não existem mais no vault
    let removed = 0;
    for (const p of Object.keys(index.notes)) {
      if (!livePaths.has(p)) {
        delete index.notes[p];
        removed++;
      }
    }

    await this.saveIndex(index);
    return {
      indexed,
      skipped,
      removed,
      total: Object.keys(index.notes).length,
      dim: EMBED_DIM,
      partial,
      pending: pending.length - indexed,
    };
  }

  // Busca semântica: embeda a query e retorna as notas mais similares por cosseno.
  async semanticSearch(query: string, limit = 10): Promise<NotePreview[]> {
    const index = await this.loadIndex();
    const entries = Object.entries(index.notes);
    if (entries.length === 0) {
      throw new BadRequestException('Índice vazio — rode POST /api/brain/reindex primeiro');
    }
    const qVec = await this.embed(query, 'RETRIEVAL_QUERY');
    const scored: NotePreview[] = entries.map(([p, e]) => ({
      title: e.title,
      path: p,
      tags: [],
      preview: e.preview,
      score: this.dot(qVec, e.vector),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}
