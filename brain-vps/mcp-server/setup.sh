#!/bin/bash

# Setup script para MCP Server do Brain

set -e

echo "🧠 Brain MCP Server — Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Build
echo ""
echo "1️⃣  Construindo servidor..."
npm install
npm run build
echo "✅ Build completo"

# 2. Detectar SO e arquivo de config
echo ""
echo "2️⃣  Detectando Claude Desktop..."

if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CONFIG_DIR="$HOME/.config/Claude"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    CONFIG_DIR="$HOME/Library/Application Support/Claude"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    CONFIG_DIR="$APPDATA/Claude"
else
    echo "❌ SO não reconhecido: $OSTYPE"
    exit 1
fi

CONFIG_FILE="$CONFIG_DIR/claude_desktop_config.json"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Arquivo não encontrado: $CONFIG_FILE"
    echo "    Certifique-se de ter instalado e aberto Claude Desktop uma vez"
    exit 1
fi

echo "✅ Encontrado: $CONFIG_FILE"

# 3. Ler chave API
echo ""
echo "3️⃣  Configurando chave API..."
read -p "   Insira sua BRAIN_API_KEY: " BRAIN_API_KEY

if [ -z "$BRAIN_API_KEY" ]; then
    echo "❌ Chave não pode estar vazia"
    exit 1
fi

# 4. Caminho absoluto do servidor
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MCP_PATH="$SCRIPT_DIR/dist/index.js"

echo "✅ MCP Path: $MCP_PATH"

# 5. Criar/atualizar config
echo ""
echo "4️⃣  Atualizando configuração..."

# Usar jq se disponível, senão usar Python
if command -v jq &> /dev/null; then
    jq ".mcpServers.brain = {
      \"command\": \"node\",
      \"args\": [\"$MCP_PATH\"],
      \"env\": {
        \"BRAIN_API_URL\": \"https://api.weissmurillo.de/api\",
        \"BRAIN_API_KEY\": \"$BRAIN_API_KEY\"
      }
    }" "$CONFIG_FILE" > "$CONFIG_FILE.tmp" && mv "$CONFIG_FILE.tmp" "$CONFIG_FILE"
else
    python3 << EOF
import json

with open('$CONFIG_FILE', 'r') as f:
    config = json.load(f)

if 'mcpServers' not in config:
    config['mcpServers'] = {}

config['mcpServers']['brain'] = {
    'command': 'node',
    'args': ['$MCP_PATH'],
    'env': {
        'BRAIN_API_URL': 'https://api.weissmurillo.de/api',
        'BRAIN_API_KEY': '$BRAIN_API_KEY'
    }
}

with open('$CONFIG_FILE', 'w') as f:
    json.dump(config, f, indent=2)

print('✅ Configuração atualizada')
EOF
fi

# 6. Resumo
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup concluído!"
echo ""
echo "Próximos passos:"
echo "1. Fechar Claude Desktop completamente"
echo "2. Abrir Claude Desktop novamente"
echo "3. A ferramenta 'brain' deve aparecer no menu de assistentes"
echo ""
echo "Para testar:"
echo "   Você: Qual é o contexto do Second Brain?"
echo "   Claude: [vai usar brain-get-context]"
echo ""
