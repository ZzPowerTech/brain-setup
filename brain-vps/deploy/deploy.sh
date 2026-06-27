#!/bin/bash
# ============================================================
# deploy.sh — Brain VPS Setup Completo
# VPS Hostinger + Domínio configurado
# Executa tudo: Docker, API NestJS, Dashboard, Git Sync, SSL
# ============================================================
# USO: ./deploy.sh [setup|update|status|logs]
# ============================================================

set -e

# ─── CONFIGURAÇÕES ──────────────────────────────────────────
DOMAIN="${BRAIN_DOMAIN:-brain.seudominio.com}"
API_DOMAIN="${BRAIN_API_DOMAIN:-api.brain.seudominio.com}"
REPO_URL="${BRAIN_REPO:-https://github.com/SEU_USUARIO/brain-vault.git}"
VAULT_PATH="/opt/brain/vault"
APP_PATH="/opt/brain/app"
LOG_PATH="/opt/brain/logs"
COMPOSE_FILE="/opt/brain/docker-compose.yml"

# Cores
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${BLUE}[BRAIN]${NC} $1"; }
ok()  { echo -e "${GREEN}[OK]${NC} $1"; }
warn(){ echo -e "${YELLOW}[WARN]${NC} $1"; }
err() { echo -e "${RED}[ERRO]${NC} $1"; exit 1; }

# ─── FUNÇÕES ────────────────────────────────────────────────

install_dependencies() {
  log "Instalando dependências base..."
  apt-get update -qq
  apt-get install -y -qq \
    curl git nginx certbot python3-certbot-nginx \
    docker.io docker-compose nodejs npm

  # Node 20 LTS via nvm
  if ! command -v node &>/dev/null || [[ $(node -v) < "v20" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi

  npm install -g pm2 @nestjs/cli
  ok "Dependências instaladas"
}

setup_folders() {
  log "Criando estrutura de pastas..."
  mkdir -p "$VAULT_PATH" "$APP_PATH" "$LOG_PATH"
  ok "Pastas criadas em /opt/brain/"
}

clone_vault() {
  log "Clonando vault do GitHub..."
  if [ -d "$VAULT_PATH/.git" ]; then
    warn "Vault já existe, fazendo pull..."
    cd "$VAULT_PATH" && git pull
  else
    git clone "$REPO_URL" "$VAULT_PATH"
  fi
  ok "Vault sincronizado"
}

setup_api() {
  log "Configurando Brain API (NestJS)..."

  # Copia os arquivos da API
  cp -r /tmp/brain-api/* "$APP_PATH/" 2>/dev/null || true

  cd "$APP_PATH"

  # Cria .env se não existir
  if [ ! -f "$APP_PATH/.env" ]; then
    cat > "$APP_PATH/.env" << EOF
PORT=3001
VAULT_PATH=$VAULT_PATH
BRAIN_API_KEY=$(openssl rand -hex 32)
ALLOWED_ORIGIN=https://$DOMAIN
NODE_ENV=production
EOF
    warn "⚠️  .env criado! Anote a BRAIN_API_KEY gerada:"
    grep BRAIN_API_KEY "$APP_PATH/.env"
  fi

  npm install --production
  npm run build

  # Inicia com PM2
  pm2 delete brain-api 2>/dev/null || true
  pm2 start dist/main.js --name brain-api --log "$LOG_PATH/api.log"
  pm2 save
  pm2 startup systemd -u root --hp /root | tail -1 | bash

  ok "Brain API rodando na porta 3001"
}

setup_nginx() {
  log "Configurando Nginx..."

  cat > /etc/nginx/sites-available/brain << EOF
# Dashboard / Obsidian Publish
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        root /opt/brain/dashboard;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
}

# Brain API
server {
    listen 80;
    server_name $API_DOMAIN;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF

  ln -sf /etc/nginx/sites-available/brain /etc/nginx/sites-enabled/brain
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx

  ok "Nginx configurado"
}

setup_ssl() {
  log "Configurando SSL (Let's Encrypt)..."
  certbot --nginx \
    -d "$DOMAIN" \
    -d "$API_DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "murilo@$DOMAIN" \
    --redirect

  ok "SSL configurado — HTTPS ativo"
}

setup_git_sync() {
  log "Configurando sincronização automática do vault..."

  # Cron: git pull a cada 5 minutos
  (crontab -l 2>/dev/null; echo "*/5 * * * * cd $VAULT_PATH && git pull --quiet >> $LOG_PATH/sync.log 2>&1") | crontab -

  # Webhook para sync instantâneo via GitHub
  cat > /opt/brain/webhook.js << 'EOF'
const http = require('http');
const { execSync } = require('child_process');
const crypto = require('crypto');

const SECRET = process.env.WEBHOOK_SECRET || '';
const VAULT = process.env.VAULT_PATH || '/opt/brain/vault';

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    return res.end();
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    // Valida assinatura GitHub
    if (SECRET) {
      const sig = req.headers['x-hub-signature-256'];
      const hash = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
      if (sig !== hash) {
        res.writeHead(401);
        return res.end('Unauthorized');
      }
    }

    try {
      execSync(`cd ${VAULT} && git pull`, { stdio: 'pipe' });
      console.log(`[${new Date().toISOString()}] Vault sincronizado via webhook`);
      res.writeHead(200);
      res.end('OK');
    } catch (e) {
      console.error('Erro no sync:', e.message);
      res.writeHead(500);
      res.end('Erro');
    }
  });
});

server.listen(3002, () => console.log('Webhook rodando na porta 3002'));
EOF

  pm2 delete brain-webhook 2>/dev/null || true
  VAULT_PATH=$VAULT_PATH pm2 start /opt/brain/webhook.js \
    --name brain-webhook \
    --log "$LOG_PATH/webhook.log"
  pm2 save

  ok "Git sync configurado (cron: 5min + webhook porta 3002)"
  warn "Configure o webhook no GitHub: https://$API_DOMAIN/webhook"
}

# ─── COMANDOS ───────────────────────────────────────────────

cmd_setup() {
  log "=== SETUP COMPLETO DO BRAIN VPS ==="
  echo ""

  install_dependencies
  setup_folders
  clone_vault
  setup_api
  setup_nginx
  setup_ssl
  setup_git_sync

  echo ""
  ok "=== BRAIN VPS CONFIGURADO COM SUCESSO ==="
  echo ""
  echo -e "${GREEN}URLs:${NC}"
  echo -e "  Dashboard: https://$DOMAIN"
  echo -e "  API:       https://$API_DOMAIN"
  echo -e "  Webhook:   https://$API_DOMAIN/webhook (configurar no GitHub)"
  echo ""
  echo -e "${YELLOW}API Key (guarde em local seguro):${NC}"
  grep BRAIN_API_KEY "$APP_PATH/.env"
}

cmd_update() {
  log "Atualizando Brain API..."
  cd "$APP_PATH"
  git pull 2>/dev/null || true
  npm install --production
  npm run build
  pm2 restart brain-api
  ok "API atualizada"

  log "Sincronizando vault..."
  cd "$VAULT_PATH" && git pull
  ok "Vault sincronizado"
}

cmd_status() {
  echo -e "${BLUE}=== STATUS DO BRAIN VPS ===${NC}"
  pm2 list
  echo ""
  echo -n "Nginx: "
  systemctl is-active nginx
  echo -n "SSL: "
  certbot certificates 2>/dev/null | grep -E "Domains|Expiry" | head -4
}

cmd_logs() {
  echo -e "${BLUE}=== LOGS (últimas 50 linhas) ===${NC}"
  echo -e "${YELLOW}--- API ---${NC}"
  tail -20 "$LOG_PATH/api.log" 2>/dev/null || echo "Sem logs"
  echo -e "${YELLOW}--- Sync ---${NC}"
  tail -10 "$LOG_PATH/sync.log" 2>/dev/null || echo "Sem logs"
}

# ─── ENTRY POINT ────────────────────────────────────────────
case "${1:-setup}" in
  setup)   cmd_setup ;;
  update)  cmd_update ;;
  status)  cmd_status ;;
  logs)    cmd_logs ;;
  *)       echo "Uso: ./deploy.sh [setup|update|status|logs]" ;;
esac
