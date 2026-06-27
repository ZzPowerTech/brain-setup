# Brain MCP Server

Servidor MCP que expõe a Brain API como ferramentas para Claude Chat, Cowork e outros assistentes.

## Instalação

### 1. Build do servidor

```bash
cd brain-vps/mcp-server
npm install
npm run build
```

### 2. Configurar no Claude Desktop

Editar `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "brain": {
      "command": "node",
      "args": ["/caminho/para/brain-vps/mcp-server/dist/index.js"],
      "env": {
        "BRAIN_API_URL": "https://api.weissmurillo.de/api",
        "BRAIN_API_KEY": "sua_chave_aqui"
      }
    }
  }
}
```

**Localizações do arquivo de configuração:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

### 3. Reiniciar Claude Desktop

Fechar e abrir novamente o Claude Desktop. As ferramentas do Brain devem aparecer no menu de assistentes.

## Ferramentas Disponíveis

### `brain-search`
Pesquisa notas por título ou conteúdo.

**Parâmetros:**
- `query` (string, obrigatório): Termo de busca
- `limit` (número, opcional): Máximo de resultados (padrão: 10)

**Exemplo:**
```
Busca sobre "AusTV" com limite 5
```

### `brain-get-context`
Obtém CLAUDE.md + MEMORY.md — contexto completo do Second Brain.

**Parâmetros:** Nenhum

### `brain-get-memory`
Obtém todas as notas do diretório `memory/`.

**Parâmetros:** Nenhum

### `brain-get-project`
Obtém notas de um projeto específico.

**Parâmetros:**
- `name` (string, obrigatório): Nome do projeto (ex: AUSTV, brain-setup)

**Exemplo:**
```
Carrega projeto AUSTV
```

### `brain-get-note`
Lê uma nota específica.

**Parâmetros:**
- `path` (string, obrigatório): Caminho relativo (ex: projects/AUSTV/Note.md)

### `brain-create-note`
Cria uma nova nota no vault.

**Parâmetros:**
- `path` (string, obrigatório): Onde criar (ex: projects/AUSTV/NewNote.md)
- `content` (string, obrigatório): Markdown
- `frontmatter` (objeto, opcional): YAML frontmatter

**Exemplo:**
```
Anote no brain sobre produtividade em projects/brain-setup/Produtividade.md
```

### `brain-get-structure`
Obtém estrutura de pastas do vault.

**Parâmetros:** Nenhum

## Uso no Claude Chat

```
Você: Qual é o contexto do Second Brain?
Claude: [usa brain-get-context para ler CLAUDE.md + MEMORY.md]

Você: Anote no brain sobre performance em projects/brain-setup/Performance.md
Claude: [usa brain-create-note para criar a nota]

Você: Mostre notas do projeto AUSTV
Claude: [usa brain-get-project para listar notas]
```

## Variáveis de Ambiente

- `BRAIN_API_URL`: URL base da Brain API (padrão: `https://api.weissmurillo.de/api`)
- `BRAIN_API_KEY`: Chave de autenticação (obrigatória)

## Troubleshooting

### Ferramenta não aparece
1. Verificar se `node` está no PATH
2. Verificar se o arquivo em `args` existe
3. Checar logs do Claude Desktop: `~/.claude/logs/mcp.log`

### Erro de autenticação
1. Verificar se `BRAIN_API_KEY` está correta
2. Testar manualmente:
   ```bash
   curl -s -H "x-api-key: YOUR_KEY" https://api.weissmurillo.de/api/health
   ```

### Erro de conexão
1. Verificar se VPS está online: `ping weissmurillo.de`
2. Verificar se Brain API está rodando: `ssh root@VPS "docker ps | grep brain-api"`

## Desenvolvimento

### Modo watch
```bash
npm run watch
```

### Testar manualmente
```bash
BRAIN_API_KEY=test BRAIN_API_URL=https://api.weissmurillo.de/api npm run dev
```
