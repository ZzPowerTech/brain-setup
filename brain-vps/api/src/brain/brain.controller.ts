import {
  Controller,
  Get,
  Post,
  Patch,
  Query,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  BrainService,
  NoteDetail,
  NotePreview,
  ProjectDetail,
  FolderTreeNode,
  ClaudeContext,
  TasksResult,
  TagsResult,
} from './brain.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { SearchQueryDto } from './dto/search-query.dto';
import { NotePathDto } from './dto/note-path.dto';
import { ProjectNameDto } from './dto/project-name.dto';
import { CreateDailyDto } from './dto/create-daily.dto';
import { AppendDailyDto } from './dto/append-daily.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { ToggleTaskDto } from './dto/toggle-task.dto';
import { AppendNoteDto } from './dto/append-note.dto';
import { CreateNoteDto } from './dto/create-note.dto';

interface SearchResponse {
  results: NotePreview[];
}

interface StructureResponse {
  structure: FolderTreeNode[];
}

interface CreateDailyResponse {
  note: NoteDetail;
  created: boolean;
}

interface ToggleTaskResponse {
  success: boolean;
  task: { text: string; done: boolean };
}

@Controller('brain')
@UseGuards(ApiKeyGuard)
export class BrainController {
  constructor(private readonly brain: BrainService) {}

  // GET /api/brain/search?q=obsidian&limit=5
  @Get('search')
  async search(@Query() query: SearchQueryDto): Promise<SearchResponse> {
    const results = await this.brain.search(query.q, query.limit);
    return { results };
  }

  // GET /api/brain/note?path=03-projetos/AusTV/README.md
  @Get('note')
  async readNote(@Query() query: NotePathDto): Promise<NoteDetail> {
    const note = await this.brain.read(query.path);
    if (!note) {
      throw new NotFoundException('Recurso não encontrado');
    }
    return note;
  }

  // GET /api/brain/claude — contexto de trabalho do Claude
  @Get('claude')
  async getClaudeContext(): Promise<ClaudeContext> {
    return this.brain.getClaudeContext();
  }

  // GET /api/brain/memory — memória persistente (agents, preferences, etc)
  @Get('memory')
  async getMemory(): Promise<Record<string, string>> {
    return this.brain.getMemory();
  }

  // GET /api/brain/project/AusTV
  @Get('project/:name')
  async getProject(@Param() params: ProjectNameDto): Promise<ProjectDetail> {
    const project = await this.brain.getProject(params.name);
    if (!project) {
      throw new NotFoundException('Recurso não encontrado');
    }
    return project;
  }

  // GET /api/brain/daily — daily note de hoje
  // GET /api/brain/daily?date=2025-01-15
  @Get('daily')
  async getDaily(@Query('date') date?: string): Promise<NoteDetail> {
    const note = await this.brain.getDailyNote(date);
    if (!note) {
      throw new NotFoundException('Recurso não encontrado');
    }
    return note;
  }

  // GET /api/brain/structure
  @Get('structure')
  async getStructure(): Promise<StructureResponse> {
    const structure = await this.brain.getStructure();
    return { structure };
  }

  // GET /api/brain/stats
  @Get('stats')
  async getStats(): Promise<{ totalNotes: number; totalFolders: number }> {
    return this.brain.getStats();
  }

  // POST /api/brain/note
  @Post('note')
  async createNote(
    @Body() body: CreateNoteDto,
  ): Promise<{ success: boolean; path: string }> {
    await this.brain.createNote(body.path, body.content, body.frontmatter || {});
    return { success: true, path: body.path };
  }

  // POST /api/brain/daily — criar daily note de hoje (ou de data específica)
  @Post('daily')
  @HttpCode(HttpStatus.OK)
  async createDaily(@Body() body: CreateDailyDto): Promise<CreateDailyResponse> {
    return this.brain.createDailyNote(body.date);
  }

  // PATCH /api/brain/daily/append — append à daily note
  @Patch('daily/append')
  async appendDaily(@Body() body: AppendDailyDto): Promise<NoteDetail> {
    return this.brain.appendDailyNote(body.content, body.date);
  }

  // GET /api/brain/tasks — listar tasks do vault
  @Get('tasks')
  async listTasks(@Query() query: ListTasksQueryDto): Promise<TasksResult> {
    return this.brain.listTasks({
      daily: query.daily,
      done: query.done,
      todo: query.todo,
      path: query.path,
      limit: query.limit,
    });
  }

  // PATCH /api/brain/tasks/toggle — toggle status de uma task
  @Patch('tasks/toggle')
  async toggleTask(@Body() body: ToggleTaskDto): Promise<ToggleTaskResponse> {
    return this.brain.toggleTask(body.file, body.line);
  }

  // GET /api/brain/tags — listar todas as tags com contagem
  @Get('tags')
  async listTags(): Promise<TagsResult> {
    return this.brain.listTags();
  }

  // PATCH /api/brain/note/append — append a nota existente
  @Patch('note/append')
  async appendNote(@Body() body: AppendNoteDto): Promise<NoteDetail> {
    const note = await this.brain.appendNote(body.path, body.content);
    if (!note) {
      throw new NotFoundException('Recurso não encontrado');
    }
    return note;
  }
}
