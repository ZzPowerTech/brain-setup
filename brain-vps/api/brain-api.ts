// ============================================
// Brain API — NestJS
// Expõe o vault Obsidian via REST
// Usado pelo Claude em chats normais (web_fetch)
// ============================================

// src/main.ts
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.ALLOWED_ORIGIN || '*' });
  await app.listen(process.env.PORT || 3000);
  console.log(`Brain API rodando na porta ${process.env.PORT || 3000}`);
}
bootstrap();

// ─────────────────────────────────────────────
// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BrainModule } from './brain/brain.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    BrainModule,
  ],
})
export class AppModule {}

// ─────────────────────────────────────────────
// src/auth/api-key.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const key = request.headers['x-api-key'];
    const validKey = this.config.get('BRAIN_API_KEY');

    if (!key || key !== validKey) {
      throw new UnauthorizedException('API Key inválida');
    }
    return true;
  }
}

// ─────────────────────────────────────────────
// src/brain/brain.module.ts
import { Module } from '@nestjs/common';
import { BrainController } from './brain.controller';
import { BrainService } from './brain.service';

@Module({
  controllers: [BrainController],
  providers: [BrainService],
})
export class BrainModule {}

// ─────────────────────────────────────────────
// src/brain/brain.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as matter from 'gray-matter'; // parse frontmatter YAML

@Injectable()
export class BrainService {
  private vaultPath: string;

  constructor(private config: ConfigService) {
    this.vaultPath = this.config.get('VAULT_PATH') || '/opt/brain/vault';
  }

  // Busca notas por termo (título + conteúdo)
  search(query: string, limit = 10) {
    const results = [];
    const files = this.getAllMdFiles(this.vaultPath);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      const parsed = matter(content);
      const title = path.basename(file, '.md');
      const relativePath = path.relative(this.vaultPath, file);

      const matchesTitle = title.toLowerCase().includes(query.toLowerCase());
      const matchesContent = parsed.content.toLowerCase().includes(query.toLowerCase());

      if (matchesTitle || matchesContent) {
        results.push({
          title,
          path: relativePath,
          tags: parsed.data.tags || [],
          preview: parsed.content.substring(0, 300).trim(),
          score: matchesTitle ? 2 : 1, // prioriza match no título
        });
      }

      if (results.length >= limit * 2) break; // buffer para ordenar
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  // Lê uma nota pelo caminho relativo
  read(notePath: string) {
    const fullPath = path.join(this.vaultPath, notePath);

    // Segurança: impede path traversal
    if (!fullPath.startsWith(this.vaultPath)) {
      throw new Error('Caminho inválido');
    }

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    const content = fs.readFileSync(fullPath, 'utf-8');
    const parsed = matter(content);

    return {
      title: path.basename(notePath, '.md'),
      path: notePath,
      frontmatter: parsed.data,
      content: parsed.content,
    };
  }

  // Lê nota Claude (padrões de trabalho)
  getClaudeContext() {
    const files = ['02-claude/CLAUDE.md', '02-claude/skills.md', '02-claude/padrao-codigo.md'];
    const result = {};

    for (const file of files) {
      const note = this.read(file);
      if (note) {
        const key = path.basename(file, '.md');
        result[key] = note.content;
      }
    }

    return result;
  }

  // Lista notas de um projeto
  getProject(projectName: string) {
    const projectPath = path.join(this.vaultPath, '03-projetos', projectName);

    if (!fs.existsSync(projectPath)) return null;

    const files = fs.readdirSync(projectPath)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const content = fs.readFileSync(path.join(projectPath, f), 'utf-8');
        const parsed = matter(content);
        return {
          title: path.basename(f, '.md'),
          tags: parsed.data.tags || [],
          preview: parsed.content.substring(0, 200).trim(),
        };
      });

    return { project: projectName, files };
  }

  // Daily note de hoje
  getDailyNote(date?: string) {
    const today = date || new Date().toISOString().split('T')[0];
    return this.read(`01-daily/${today}.md`);
  }

  // Estrutura do vault (árvore de pastas)
  getStructure() {
    return this.getFolderTree(this.vaultPath, 2);
  }

  // ─── Utils ───────────────────────────────────

  private getAllMdFiles(dir: string): string[] {
    const files = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...this.getAllMdFiles(fullPath));
      } else if (entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private getFolderTree(dir: string, depth: number) {
    if (depth === 0) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    return entries
      .filter(e => !e.name.startsWith('.'))
      .map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'folder' : 'file',
        children: e.isDirectory()
          ? this.getFolderTree(path.join(dir, e.name), depth - 1)
          : undefined,
      }));
  }
}

// ─────────────────────────────────────────────
// src/brain/brain.controller.ts
import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { BrainService } from './brain.service';
import { ApiKeyGuard } from '../auth/api-key.guard';

@Controller('brain')
@UseGuards(ApiKeyGuard)
export class BrainController {
  constructor(private brain: BrainService) {}

  // GET /api/brain/search?q=austv&limit=5
  @Get('search')
  search(@Query('q') q: string, @Query('limit') limit?: string) {
    if (!q) return { results: [] };
    return { results: this.brain.search(q, limit ? parseInt(limit) : 10) };
  }

  // GET /api/brain/note?path=03-projetos/AusTV/README.md
  @Get('note')
  readNote(@Query('path') notePath: string) {
    if (!notePath) return { error: 'path obrigatório' };
    const note = this.brain.read(notePath);
    if (!note) return { error: 'Nota não encontrada' };
    return note;
  }

  // GET /api/brain/claude — contexto de trabalho do Claude
  @Get('claude')
  getClaudeContext() {
    return this.brain.getClaudeContext();
  }

  // GET /api/brain/project/AusTV
  @Get('project/:name')
  getProject(@Param('name') name: string) {
    const project = this.brain.getProject(name);
    if (!project) return { error: 'Projeto não encontrado' };
    return project;
  }

  // GET /api/brain/daily — daily note de hoje
  @Get('daily')
  getDaily(@Query('date') date?: string) {
    const note = this.brain.getDailyNote(date);
    if (!note) return { message: 'Sem daily note hoje', date: date || new Date().toISOString().split('T')[0] };
    return note;
  }

  // GET /api/brain/structure
  @Get('structure')
  getStructure() {
    return { structure: this.brain.getStructure() };
  }
}
