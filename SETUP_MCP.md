# 🧠 Brain MCP Server — Guia de Instalação

## Objetivo

Permitir que Claude Chat, Cowork e outras aplicações tenham acesso completo ao seu Second Brain via ferramentas integradas. Você poderá:

- ✅ Pesquisar notas: "Busca sobre AusTV"
- ✅ Ler contexto: "Qual é o contexto do Second Brain?"
- ✅ Ver projetos: "Mostre notas do projeto brain-setup"
- ✅ Criar notas: "Anote no brain sobre performance em projects/brain-setup/Performance.md"

## Pré-requisitos

1. **Node.js instalado** (v18+)
   ```bash
   node --version  # Deve retornar v18.0.0+
   ```

2. **Brain API funcionando** na VPS
   ```bash
   curl -s -H "x-api-key: YOUR_KEY" https://api.weissmurillo.de/api/health
   # Deve retornar: {"status":"ok"}
   ```

3. **Claude Desktop instalado**
   - macOS: [claude.ai/download](https://claude.ai/download)
   - Windows: [claude.ai/download](https://claude.ai/download)

## Instalação

### 1️⃣ Build do MCP Server

```bash
cd brain-vps/mcp-server
npm install
npm run build
```

Saída esperada:
```
✅ Build completo em dist/
```

### 2️⃣ Setup Automático (Recomendado)

**Windows (PowerShell):**
```powershell
.\setup.ps1
```

**macOS/Linux (Bash):**
```bash
bash setup.sh
```

O script vai:
1. ✅ Compilar o servidor
2. ✅ Encontrar seu arquivo de configuração do Claude
3. ✅ Pedir sua `BRAIN_API_KEY`
4. ✅ Atualizar `claude_desktop_config.json`

### 3️⃣ Setup Manual (se script falhar)

Editar `claude_desktop_config.json`:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

Adicionar:
```json
{
  "mcpServers": {
    "brain": {
      "command": "node",
      "args": ["/caminho/completo/para/brain-vps/mcp-server/dist/index.js"],
      "env": {
        "BRAIN_API_URL": "https://api.weissmurillo.de/api",
        "BRAIN_API_KEY": "sua_chave_aqui"
      }
    }
  }
}
```

**⚠️ IMPORTANTE:**
- Use caminho **absoluto** em `args`
- Coloque sua chave API real em `BRAIN_API_KEY`

### 4️⃣ Reiniciar Claude

1. Fechar Claude Desktop completamente
2. Abrir Claude Desktop novamente
3. Verificar se ferramentas aparecem no menu

## Verificação

### ✅ Teste 1: Ferramentas aparecem?

No Claude Chat ou Cowork, clique no ícone de ferramenta (+) — deve aparecer "brain" com várias opções.

### ✅ Teste 2: Funciona?

Envie para Claude:
```
Qual é o contexto do Second Brain? Use a ferramenta brain.
```

Claude deve usar `brain-get-context` e retornar seu CLAUDE.md + MEMORY.md.

### ✅ Teste 3: Criar nota?

```
Anote no brain sobre testes em projects/brain-setup/Testes.md
```

Claude deve usar `brain-create-note`. Verificar se apareceu em Obsidian.

## Troubleshooting

### ❌ "Ferramenta não aparece"

1. Checar se o arquivo está no caminho correto:
   ```bash
   ls -la /caminho/para/mcp-server/dist/index.js
   ```

2. Verificar se `node` está no PATH:
   ```bash
   which node  # Linux/macOS
   where node  # Windows
   ```

3. Ver logs do Claude:
   - **macOS/Linux:** `~/.claude/logs/`
   - **Windows:** `%APPDATA%\.claude\logs\`

### ❌ "Erro de autenticação (401)"

1. Verificar se `BRAIN_API_KEY` está correta
2. Gerar nova chave se necessário:
   ```bash
   ssh root@VPS "grep BRAIN_API_KEY /opt/brain/.env"
   ```

### ❌ "Erro de conexão"

1. Verificar se VPS está online:
   ```bash
   ping weissmurillo.de
   ```

2. Testar Brain API diretamente:
   ```bash
   curl -s -H "x-api-key: YOUR_KEY" https://api.weissmurillo.de/api/brain/structure
   ```

## Ferramentas Disponíveis

| Ferramenta | Função |
|-----------|--------|
| `brain-search` | Pesquisar notas (query + limit) |
| `brain-get-context` | CLAUDE.md + MEMORY.md |
| `brain-get-memory` | Todos arquivos do memory/ |
| `brain-get-project` | Notas de um projeto |
| `brain-get-note` | Ler uma nota específica |
| `brain-create-note` | Criar nova nota |
| `brain-get-structure` | Estrutura de pastas |

## Exemplos de Uso

### Exemplo 1: Contexto completo
```
Você: Qual é meu contexto de trabalho atual?
Claude: [usa brain-get-context]
Resultado: Seu CLAUDE.md + MEMORY.md + preferências
```

### Exemplo 2: Criar nota estruturada
```
Você: Anote sobre otimização de performance em projects/brain-setup/Performance-2026.md com tags performance e otimização
Claude: [usa brain-create-note com frontmatter]
```

### Exemplo 3: Pesquisar + Analisar
```
Você: Busque tudo sobre AusTV e crie um resumo em projects/brain-setup/AusTV-Summary.md
Claude: [usa brain-search, depois brain-create-note]
```

## Deploy na VPS

Após configurar o MCP Server localmente, você precisará fazer deploy da Brain API com o novo endpoint de criar notas:

```bash
# Na VPS
cd brain-vps/api
npm install  # Para adicionar js-yaml
docker compose build brain-api
docker compose up -d
```

Verificar se tudo subiu:
```bash
curl -s -H "x-api-key: KEY" https://api.weissmurillo.de/api/health
```

## Próximos Passos

1. ✅ Instalar MCP Server
2. ✅ Testar ferramentas no Claude Chat
3. ⏳ Criar pipeline de notas no Obsidian via Claude
4. ⏳ Integrar com Cowork (mesmas ferramentas)

## Suporte

Se tiver problemas:

1. Verificar logs: `~/.claude/logs/`
2. Testar manualmente:
   ```bash
   BRAIN_API_KEY=your_key node brain-vps/mcp-server/dist/index.js
   ```
3. Consultar referência: `brain-vps/mcp-server/README.md`
