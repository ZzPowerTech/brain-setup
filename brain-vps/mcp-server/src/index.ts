#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import http from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";

// ─────────────────────────────────────────────────────────────
// Configuração
// ─────────────────────────────────────────────────────────────

const BRAIN_API_URL = process.env.BRAIN_API_URL ?? "https://api.weissmurillo.de/api";
const BRAIN_API_KEY = process.env.BRAIN_API_KEY ?? "";
const MODE = process.env.MCP_MODE ?? "stdio"; // "stdio" | "http"
const PORT = parseInt(process.env.PORT ?? "3001", 10);

if (!BRAIN_API_KEY) {
  console.error("❌ BRAIN_API_KEY não configurada");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// ─────────────────────────────────────────────────────────────
// Utilitários de requisição HTTP
// ─────────────────────────────────────────────────────────────

async function callBrainAPI(
  endpoint: string,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
  body?: unknown
): Promise<unknown> {
  const base = BRAIN_API_URL.replace(/\/$/, "");
  const url = `${base}${endpoint}`;

  const options: RequestInit = {
    method,
    headers: {
      "x-api-key": BRAIN_API_KEY,
      "Content-Type": "application/json",
    },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Brain API error (${response.status}): ${error}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

// ─────────────────────────────────────────────────────────────
// Factory — cria servidor MCP com todas as ferramentas
// ─────────────────────────────────────────────────────────────

function createMcpServer(): Server {
  const server = new Server(
    { name: "brain-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "brain-search",
        description: "Pesquisa notas no vault por título ou conteúdo",
        inputSchema: {
          type: "object" as const,
          properties: {
            query: { type: "string", description: "Termo de busca" },
            limit: { type: "number", description: "Número máximo de resultados (padrão: 10)" },
          },
          required: ["query"],
        },
      },
      {
        name: "brain-get-context",
        description: "Obtém CLAUDE.md + MEMORY.md — contexto completo do Second Brain",
        inputSchema: { type: "object" as const, properties: {}, required: [] },
      },
      {
        name: "brain-get-memory",
        description: "Obtém todas as notas do diretório memory/ (agents, preferences, user, etc)",
        inputSchema: { type: "object" as const, properties: {}, required: [] },
      },
      {
        name: "brain-get-project",
        description: "Obtém notas de um projeto específico do vault",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: { type: "string", description: "Nome do projeto (ex: AUSTV, brain-setup)" },
          },
          required: ["name"],
        },
      },
      {
        name: "brain-get-note",
        description: "Lê uma nota específica do vault",
        inputSchema: {
          type: "object" as const,
          properties: {
            path: { type: "string", description: "Caminho relativo (ex: projects/AUSTV/Note.md)" },
          },
          required: ["path"],
        },
      },
      {
        name: "brain-create-note",
        description: "Cria uma nova nota no vault. Use para 'anote no brain sobre...'",
        inputSchema: {
          type: "object" as const,
          properties: {
            path: { type: "string", description: "Onde criar (ex: projects/brain-setup/Nota.md)" },
            content: { type: "string", description: "Conteúdo em Markdown" },
            frontmatter: { type: "object", description: "Frontmatter YAML opcional (tags, etc)" },
          },
          required: ["path", "content"],
        },
      },
      {
        name: "brain-get-structure",
        description: "Obtém a estrutura de pastas do vault",
        inputSchema: { type: "object" as const, properties: {}, required: [] },
      },
      {
        name: "brain-daily",
        description: "Obtém ou cria a daily note de hoje. Se não existir, cria com template padrão",
        inputSchema: {
          type: "object" as const,
          properties: {
            date: { type: "string", description: "Data no formato YYYY-MM-DD (padrão: hoje)" },
          },
          required: [],
        },
      },
      {
        name: "brain-daily-append",
        description: "Adiciona conteúdo à daily note (cria se não existir). Equivalente ao 'obsidian daily:append'",
        inputSchema: {
          type: "object" as const,
          properties: {
            content: { type: "string", description: "Conteúdo a adicionar na daily note" },
            date: { type: "string", description: "Data no formato YYYY-MM-DD (padrão: hoje)" },
          },
          required: ["content"],
        },
      },
      {
        name: "brain-tasks",
        description: "Lista tasks (checkboxes) do vault ou da daily note",
        inputSchema: {
          type: "object" as const,
          properties: {
            daily: { type: "boolean", description: "Filtrar apenas tasks da daily note de hoje" },
            done: { type: "boolean", description: "Incluir tasks concluídas" },
            todo: { type: "boolean", description: "Incluir apenas tasks pendentes" },
            path: { type: "string", description: "Caminho de uma nota específica para filtrar tasks" },
            limit: { type: "number", description: "Número máximo de resultados" },
          },
          required: [],
        },
      },
      {
        name: "brain-tags",
        description: "Lista todas as tags do vault com contagem de uso",
        inputSchema: { type: "object" as const, properties: {}, required: [] },
      },
      {
        name: "brain-append-note",
        description: "Adiciona conteúdo ao final de uma nota existente",
        inputSchema: {
          type: "object" as const,
          properties: {
            path: { type: "string", description: "Caminho relativo da nota (ex: projects/brain-setup/Nota.md)" },
            content: { type: "string", description: "Conteúdo a adicionar ao final da nota" },
          },
          required: ["path", "content"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;

    try {
      let result: unknown;

      switch (name) {
        case "brain-search": {
          const query = a["query"] as string;
          const limit = (a["limit"] as number | undefined) ?? 10;
          result = await callBrainAPI(`/brain/search?q=${encodeURIComponent(query)}&limit=${limit}`);
          break;
        }
        case "brain-get-context":
          result = await callBrainAPI("/brain/claude");
          break;
        case "brain-get-memory":
          result = await callBrainAPI("/brain/memory");
          break;
        case "brain-get-project": {
          const projectName = a["name"] as string;
          result = await callBrainAPI(`/brain/project/${encodeURIComponent(projectName)}`);
          break;
        }
        case "brain-get-note": {
          const notePath = a["path"] as string;
          result = await callBrainAPI(`/brain/note?path=${encodeURIComponent(notePath)}`);
          break;
        }
        case "brain-create-note": {
          const notePath = a["path"] as string;
          const content = a["content"] as string;
          const frontmatter = (a["frontmatter"] as Record<string, unknown> | undefined) ?? {};
          result = await callBrainAPI("/brain/note", "POST", { path: notePath, content, frontmatter });
          break;
        }
        case "brain-get-structure":
          result = await callBrainAPI("/brain/structure");
          break;
        case "brain-daily": {
          const date = a["date"] as string | undefined;
          const base = BRAIN_API_URL.replace(/\/$/, "");
          const getUrl = date
            ? `${base}/brain/daily?date=${encodeURIComponent(date)}`
            : `${base}/brain/daily`;
          const getResponse = await fetch(getUrl, {
            method: "GET",
            headers: { "x-api-key": BRAIN_API_KEY, "Content-Type": "application/json" },
          });
          if (getResponse.ok) {
            result = await getResponse.json();
          } else if (getResponse.status === 404) {
            result = await callBrainAPI("/brain/daily", "POST", date ? { date } : {});
          } else {
            const error = await getResponse.text();
            throw new Error(`Brain API error (${getResponse.status}): ${error}`);
          }
          break;
        }
        case "brain-daily-append": {
          const content = a["content"] as string;
          const date = a["date"] as string | undefined;
          result = await callBrainAPI("/brain/daily/append", "PATCH", date ? { content, date } : { content });
          break;
        }
        case "brain-tasks": {
          const params = new URLSearchParams();
          if (a["daily"] !== undefined) params.set("daily", String(a["daily"]));
          if (a["done"] !== undefined) params.set("done", String(a["done"]));
          if (a["todo"] !== undefined) params.set("todo", String(a["todo"]));
          if (a["path"] !== undefined) params.set("path", a["path"] as string);
          if (a["limit"] !== undefined) params.set("limit", String(a["limit"]));
          const query = params.toString();
          result = await callBrainAPI(`/brain/tasks${query ? `?${query}` : ""}`);
          break;
        }
        case "brain-tags":
          result = await callBrainAPI("/brain/tags");
          break;
        case "brain-append-note": {
          const notePath = a["path"] as string;
          const content = a["content"] as string;
          result = await callBrainAPI("/brain/note/append", "PATCH", { path: notePath, content });
          break;
        }
        default:
          throw new Error(`Ferramenta desconhecida: ${name}`);
      }

      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `❌ Erro ao chamar Brain API: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

// ─────────────────────────────────────────────────────────────
// Modo HTTP (SSE) — para claude.ai
// ─────────────────────────────────────────────────────────────

async function startHttp() {
  // Map de sessionId → transport ativo
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, mcp-session-id");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);

    // Health check
    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", mode: "streamable-http", sessions: transports.size }));
      return;
    }

    // /mcp — ponto único de entrada para StreamableHTTP
    if (url.pathname === "/mcp") {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;

      // POST sem sessionId = inicialização de nova sessão
      if (req.method === "POST" && !sessionId) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });

        transport.onclose = () => {
          if (transport.sessionId) transports.delete(transport.sessionId);
        };

        const server = createMcpServer();
        await server.connect(transport);

        const body = await readBody(req);
        await transport.handleRequest(req, res, JSON.parse(body));

        if (transport.sessionId) {
          transports.set(transport.sessionId, transport);
          console.error(`[HTTP] Nova sessão MCP: ${transport.sessionId}`);
        }
        return;
      }

      // DELETE sem sessionId = inválido
      if (!sessionId) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "mcp-session-id obrigatório" }));
        return;
      }

      // Sessão existente (GET SSE stream / POST mensagens / DELETE encerrar)
      const transport = transports.get(sessionId);
      if (!transport) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Sessão não encontrada" }));
        return;
      }

      if (req.method === "DELETE") {
        await transport.close();
        transports.delete(sessionId);
        res.writeHead(200);
        res.end();
        return;
      }

      const body = req.method === "POST" ? await readBody(req) : "";
      const parsedBody = body ? JSON.parse(body) : undefined;
      await transport.handleRequest(req, res, parsedBody);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.error(`✅ Brain MCP Server (StreamableHTTP) rodando em http://0.0.0.0:${PORT}`);
  });
}

// ─────────────────────────────────────────────────────────────
// Modo Stdio — para Claude Desktop
// ─────────────────────────────────────────────────────────────

async function startStdio() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("✅ Brain MCP Server (stdio) rodando");
}

// ─────────────────────────────────────────────────────────────
// Entrypoint
// ─────────────────────────────────────────────────────────────

if (MODE === "http") {
  startHttp().catch((err) => {
    console.error("❌ Erro fatal:", err);
    process.exit(1);
  });
} else {
  startStdio().catch((err) => {
    console.error("❌ Erro fatal:", err);
    process.exit(1);
  });
}
