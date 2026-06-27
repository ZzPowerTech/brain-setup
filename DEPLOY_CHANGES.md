# 🚀 Deploy — MCP Server + Novo Endpoint

## Resumo das Mudanças

### 1. API Backend (NestJS)

**Arquivo:** `brain-vps/api/src/brain/brain.service.ts`
- ✅ Adicionado import `js-yaml`
- ✅ Novo método `createNote(notePath, content, frontmatter)`
  - Valida path com `resolveSafePath()` (segurança)
  - Cria diretórios pai se necessário
  - Escreve arquivo com frontmatter YAML + conteúdo Markdown

**Arquivo:** `brain-vps/api/src/brain/brain.controller.ts`
- ✅ Adicionado import `Post` e `Body` do NestJS
- ✅ Novo endpoint `POST /api/brain/note`
  - Body: `{ path, content, frontmatter? }`
  - Resposta: `{ success: true, path }`

**Arquivo:** `brain-vps/api/package.json`
- ✅ Adicionada dependência `"js-yaml": "^4.1.0"`

### 2. MCP Server (Node.js — nova aplicação)

**Pasta:** `brain-vps/mcp-server/`

Arquivos criados:
- `src/index.ts` — Servidor MCP com 7 ferramentas
- `package.json` — Dependências (@modelcontextprotocol/sdk)
- `tsconfig.json` — Configuração TypeScript
- `.gitignore` — Ignorar node_modules, dist, .env
- `.env.example` — Template de variáveis
- `README.md` — Documentação completa
- `setup.sh` — Script de setup para Linux/macOS
- `setup.ps1` — Script de setup para Windows

### 3. Documentação

**Arquivo:** `SETUP_MCP.md` — Guia completo para o usuário
- Pré-requisitos
- Instalação (automática + manual)
- Verificação
- Troubleshooting
- Exemplos de uso

**Arquivo:** `DEPLOY_CHANGES.md` (este arquivo)

## Steps para Deploy

### Passo 1: Deploy da API na VPS

```bash
ssh root@VPS

cd /opt/brain-vps/api

# Instalar nova dependência
npm install js-yaml

# Rebuild da imagem Docker
docker compose build brain-api

# Restart
docker compose up -d brain-api

# Verificar
curl -s -H "x-api-key: KEY" https://api.weissmurillo.de/api/health
# Deve retornar: {"status":"ok"}
```

### Passo 2: Testar novo endpoint

```bash
# Criar uma nota de teste
curl -s -X POST \
  -H "x-api-key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "projects/test-mcp/Test.md",
    "content": "# Teste\nEste é um teste do MCP Server.",
    "frontmatter": {"tags": ["test", "mcp"]}
  }' \
  https://api.weissmurillo.de/api/brain/note

# Resposta esperada:
# {"success":true,"path":"projects/test-mcp/Test.md"}

# Verificar que criou
curl -s -H "x-api-key: YOUR_KEY" \
  "https://api.weissmurillo.de/api/brain/note?path=projects/test-mcp/Test.md"

# Deve retornar o conteúdo com frontmatter
```

### Passo 3: Build do MCP Server (local)

```bash
cd brain-vps/mcp-server

npm install
npm run build

# Deve criar dist/index.js
ls -la dist/index.js
```

### Passo 4: Setup do MCP Server (local)

**Windows (PowerShell):**
```powershell
cd brain-vps\mcp-server
.\setup.ps1
```

**macOS/Linux (Bash):**
```bash
cd brain-vps/mcp-server
bash setup.sh
```

O script vai:
1. Compilar novamente
2. Encontrar `claude_desktop_config.json`
3. Pedir sua chave API
4. Atualizar a configuração
5. Mostrar próximos passos

### Passo 5: Testar no Claude

1. **Fechar Claude Desktop completamente**
2. **Abrir Claude Desktop novamente**
3. **Enviar para Claude:**
   ```
   Qual é o contexto do Second Brain?
   ```
   Deve usar a ferramenta `brain-get-context` e retornar seu CLAUDE.md

4. **Testar criar nota:**
   ```
   Anote no brain sobre MCP Server em projects/brain-setup/MCP-Server.md
   ```
   Deve usar `brain-create-note`. Verificar em Obsidian.

## Arquivos Modificados / Criados

### Modificados:
- `brain-vps/api/src/brain/brain.controller.ts` — +15 linhas
- `brain-vps/api/src/brain/brain.service.ts` — +26 linhas
- `brain-vps/api/package.json` — +1 dependência

### Criados (MCP Server):
- `brain-vps/mcp-server/src/index.ts` — 180 linhas
- `brain-vps/mcp-server/package.json`
- `brain-vps/mcp-server/tsconfig.json`
- `brain-vps/mcp-server/.gitignore`
- `brain-vps/mcp-server/.env.example`
- `brain-vps/mcp-server/README.md`
- `brain-vps/mcp-server/setup.sh`
- `brain-vps/mcp-server/setup.ps1`

### Criados (Documentação):
- `SETUP_MCP.md` — Guia completo
- `DEPLOY_CHANGES.md` — Este arquivo

## Rollback (se necessário)

Se tiver problemas:

1. **API:**
   ```bash
   # Na VPS, reverter package.json e restart
   git checkout api/package.json
   docker compose build brain-api && docker compose up -d
   ```

2. **MCP Server:**
   - Remover entrada de `mcpServers.brain` em `claude_desktop_config.json`
   - Fechar e abrir Claude novamente

## Verificação Final

✅ Brain API respondendo
```bash
curl -s -H "x-api-key: KEY" https://api.weissmurillo.de/api/health
```

✅ Novo endpoint funcionando
```bash
curl -s -H "x-api-key: KEY" https://api.weissmurillo.de/api/brain/note?path=CLAUDE.md
```

✅ MCP Server compilado
```bash
ls -la brain-vps/mcp-server/dist/index.js
```

✅ Ferramentas no Claude
- Abrir Claude Desktop
- Verificar se `brain` aparece no menu de ferramentas

## Próximas Integrações

1. **Cowork:** Mesmas ferramentas funcionarão se configurar MCP lá
2. **Claude Mobile:** Via MCP Bridge (futuro)
3. **Automação:** Integrar com workflows (Zapier, n8n, etc)

## Suporte

Dúvidas? Consulte:
- `SETUP_MCP.md` — Guia de instalação
- `brain-vps/mcp-server/README.md` — Documentação técnica
- `brain-vps/api/DEPLOYMENT.md` — (criar se não existir) Documentação da API
