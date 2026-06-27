#!/bin/bash

# ═══════════════════════════════════════════════════════════════
#  Murilo's Second Brain — Deploy Script
#  VPS: Ubuntu 24.04 | Hostinger
#  Domínio: weissmurillo.de
# ═══════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

DOMAIN="weissmurillo.de"
EMAIL=""
BRAIN_API_KEY=""
APPFLOWY_JWT_SECRET=""
VAULT_DIR="/opt/brain/vault"
BRAIN_DIR="/opt/brain"

print_banner() {
  echo -e "${PURPLE}"
  echo "  ╔══════════════════════════════════════════════╗"
  echo "  ║       MURILO'S SECOND BRAIN — DEPLOY        ║"
  echo "  ║         weissmurillo.de  |  Ubuntu 24.04    ║"
  echo "  ╚══════════════════════════════════════════════╝"
  echo -e "${NC}"
}

step() { echo -e "\n${BLUE}[STEP $1]${NC} $2"; }
ok()   { echo -e "${GREEN}  ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}  ⚠ $1${NC}"; }
err()  { echo -e "${RED}  ✗ $1${NC}"; exit 1; }

collect_inputs() {
  step "0" "Coletando informações necessárias"

  read -p "  Email para Let's Encrypt (SSL): " EMAIL
  [[ -z "$EMAIL" ]] && err "Email é obrigatório para o SSL"

  read -s -p "  Brain API Key (mínimo 32 chars): " BRAIN_API_KEY
  echo
  [[ ${#BRAIN_API_KEY} -lt 32 ]] && err "Brain API Key deve ter no mínimo 32 caracteres"

  read -s -p "  AppFlowy JWT Secret (mínimo 32 chars): " APPFLOWY_JWT_SECRET
  echo
  [[ ${#APPFLOWY_JWT_SECRET} -lt 32 ]] && err "AppFlowy JWT Secret deve ter no mínimo 32 caracteres"

  ok "Inputs coletados"
}

install_dependencies() {
  step "1" "Instalando dependências do sistema"

  apt-get update -qq
  apt-get install -y -qq \
    curl wget git unzip \
    nginx certbot python3-certbot-nginx \
    ufw fail2ban \
    apt-transport-https ca-certificates gnupg lsb-release
  ok "Dependências instaladas"

  # Docker
  if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    ok "Docker instalado"
  else
    ok "Docker já instalado"
  fi

  # Docker Compose plugin
  if ! docker compose version &>/dev/null; then
    apt-get install -y -qq docker-compose-plugin
    ok "Docker Compose instalado"
  else
    ok "Docker Compose já instalado"
  fi
}

install_obsidian_headless() {
  step "2" "Instalando Obsidian Headless"

  # Node.js 22+ (requerido pelo Headless)
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
  ok "Node.js $(node --version) instalado"

  npm install -g obsidian-headless
  ok "Obsidian Headless instalado"

  echo -e "${YELLOW}  Configure o Obsidian Headless:${NC}"
  echo "  1. Execute: ob login"
  echo "  2. Execute: ob sync-setup --vault 'Brain' --path /opt/brain/vault --device-name 'VPS-Headless'"
  echo "  3. Execute: ob sync --path /opt/brain/vault"
  warn "Configure manualmente após o deploy"
}

setup_headless_sync() {
  step "3" "Configurando Obsidian Headless Sync (systemd)"

  cat > /etc/systemd/system/brain-headless-sync.service << 'SERVICE'
[Unit]
Description=Brain Vault — Obsidian Headless Continuous Sync
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/brain/vault
ExecStart=/usr/local/bin/ob sync --path /opt/brain/vault --continuous
Restart=always
RestartSec=15
StandardOutput=journal
StandardError=journal
SyslogIdentifier=brain-headless-sync
KillSignal=SIGTERM
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
SERVICE

  systemctl daemon-reload
  systemctl enable brain-headless-sync
  ok "Serviço brain-headless-sync criado e habilitado"
  warn "Inicie após configurar ob login: systemctl start brain-headless-sync"
}

configure_firewall() {
  step "4" "Configurando firewall (UFW)"

  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow ssh
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable

  ok "Firewall configurado"
}

create_directory_structure() {
  step "5" "Criando estrutura de diretórios"

  mkdir -p $BRAIN_DIR/{vault,api,nginx,certbot,appflowy-data}
  mkdir -p $VAULT_DIR/{inbox,daily,projects,research,archive,claude,templates}

  # CLAUDE.md inicial
  cat > $VAULT_DIR/CLAUDE.md << 'CLAUDEMD'
# Murilo's Brain — Contexto Claude

## Quem sou eu
- Nome: Murilo
- Stack: Java (plugins Minecraft/Spigot), JavaScript/TypeScript (NestJS APIs)
- Faculdade: Engenharia de Software, 3° ano
- Servidor: AusTV — rede Minecraft 1.20.1 (proprietário)

## Projetos Ativos
- **AusTV Server**: rede Minecraft com 2 servidores distintos (super encantamentos + vanilla PvP)
- **Financeiro AusTV**: sistema web NestJS + Angular/Next.js + Supabase + Mercado Pago
- **Second Brain VPS**: este sistema (weissmurillo.de)
- **Faculdade**: projetos e estudos de Engenharia de Software

## Padrões de Código
- Java: plugins Spigot/Paper 1.20.1, arquitetura orientada a eventos
- NestJS: arquitetura MVC limpa, Prisma + PostgreSQL, JWT auth
- JavaScript: ES2022+, async/await, sem jQuery
- Sempre usar TypeScript em projetos NestJS

## Skills a Ativar por Contexto
- Minecraft/Java → carregar austv-context.md + padrao-codigo.md
- NestJS/API → carregar padrao-codigo.md
- Faculdade → carregar projetos/faculdade/
- Daily → executar /daily

## Tom e Preferências
- Respostas diretas e técnicas
- Português brasileiro
- Prefiro código completo, não snippets incompletos
CLAUDEMD

  # memory.md inicial
  cat > $VAULT_DIR/memory.md << 'MEMORYMD'
# Memory — Murilo's Brain

## Última atualização
- Data: setup inicial

## Informações Persistentes
- Servidor AusTV: versão 1.20.1, Multiverse-Core
- VPS: weissmurillo.de (Hostinger, Ubuntu 24.04)
- Brain API: https://api.weissmurillo.de
- Dashboard: https://brain.weissmurillo.de

## Sessões Anteriores
<!-- Claude Code atualiza aqui automaticamente -->
MEMORYMD

  ok "Estrutura de diretórios criada"
}

create_docker_compose() {
  step "6" "Criando docker-compose.yml"

  cat > $BRAIN_DIR/docker-compose.yml << COMPOSE
version: '3.9'

networks:
  brain-net:
    driver: bridge

volumes:
  appflowy-data:
    driver: local

services:

  # ─────────────────────────────────
  # Brain API — NestJS (imagem pré-compilada)
  # ─────────────────────────────────
  brain-api:
    build:
      context: /opt/brain/api
      dockerfile: Dockerfile
    image: brain-api:latest
    container_name: brain-api
    restart: unless-stopped
    environment:
      VAULT_PATH: /vault
      BRAIN_API_KEY: ${BRAIN_API_KEY}
      PORT: 3000
      NODE_ENV: production
      ALLOWED_ORIGIN: https://brain.${DOMAIN}
    volumes:
      - /opt/brain/vault:/vault:ro
    networks:
      - brain-net
    ports:
      - "127.0.0.1:3000:3000"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  # ─────────────────────────────────
  # AppFlowy — Dashboard Web
  # ─────────────────────────────────
  appflowy:
    image: appflowyinc/appflowy-cloud:latest
    container_name: brain-appflowy
    restart: unless-stopped
    environment:
      APPFLOWY_ENVIRONMENT: production
      APPFLOWY_DATABASE_URL: sqlite:///data/appflowy.db
      APPFLOWY_GOTRUE_JWT_SECRET: ${APPFLOWY_JWT_SECRET}
    volumes:
      - appflowy-data:/data
    networks:
      - brain-net
    ports:
      - "127.0.0.1:8080:8080"

COMPOSE

  # .env para o docker-compose
  cat > $BRAIN_DIR/.env << ENV
BRAIN_API_KEY=${BRAIN_API_KEY}
APPFLOWY_JWT_SECRET=${APPFLOWY_JWT_SECRET}
DOMAIN=${DOMAIN}
ENV

  ok "docker-compose.yml criado"
}

configure_nginx() {
  step "7" "Configurando Nginx"

  # Remove config default
  rm -f /etc/nginx/sites-enabled/default

  cat > /etc/nginx/sites-available/brain << 'NGINX'
# ─────────────────────────────────────
# Redirect HTTP → HTTPS
# ─────────────────────────────────────
server {
    listen 80;
    server_name weissmurillo.de brain.weissmurillo.de api.weissmurillo.de;
    return 301 https://$host$request_uri;
}

# ─────────────────────────────────────
# Brain API — api.weissmurillo.de
# ─────────────────────────────────────
server {
    listen 443 ssl;
    server_name api.weissmurillo.de;

    ssl_certificate /etc/letsencrypt/live/weissmurillo.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/weissmurillo.de/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}

# ─────────────────────────────────────
# Dashboard — brain.weissmurillo.de
# ─────────────────────────────────────
server {
    listen 443 ssl;
    server_name brain.weissmurillo.de;

    ssl_certificate /etc/letsencrypt/live/weissmurillo.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/weissmurillo.de/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

NGINX

  ln -sf /etc/nginx/sites-available/brain /etc/nginx/sites-enabled/brain
  nginx -t && ok "Nginx configurado"
}

issue_ssl() {
  step "8" "Emitindo certificados SSL (Let's Encrypt)"

  # Nginx rodando apenas no 80 por enquanto
  systemctl start nginx

  certbot certonly --nginx \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    -d weissmurillo.de \
    -d brain.weissmurillo.de \
    -d api.weissmurillo.de

  # Agora recarrega com SSL
  systemctl reload nginx
  ok "Certificados SSL emitidos"

  # Auto-renovação
  (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -
  ok "Auto-renovação SSL configurada (cron)"
}

start_services() {
  step "9" "Subindo containers Docker"

  cd $BRAIN_DIR
  docker compose pull
  docker compose up -d

  ok "Containers iniciados"
}

setup_backup() {
  step "10" "Configurando backup automático"

  cat > /opt/brain/backup.sh << 'BACKUP'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/brain/backups"
mkdir -p $BACKUP_DIR

# Backup do vault
tar -czf "$BACKUP_DIR/vault_$DATE.tar.gz" /opt/brain/vault/

# Mantém apenas os últimos 7 backups
ls -t $BACKUP_DIR/vault_*.tar.gz | tail -n +8 | xargs -r rm

echo "Backup $DATE concluído"
BACKUP

  chmod +x /opt/brain/backup.sh

  # Cron: backup diário às 2h
  (crontab -l 2>/dev/null; echo "0 2 * * * /opt/brain/backup.sh >> /var/log/brain-backup.log 2>&1") | crontab -
  ok "Backup diário configurado (02:00)"
}

print_summary() {
  echo -e "\n${GREEN}"
  echo "  ╔══════════════════════════════════════════════════════════╗"
  echo "  ║             DEPLOY CONCLUIDO COM SUCESSO!               ║"
  echo "  ╠══════════════════════════════════════════════════════════╣"
  echo "  ║                                                          ║"
  echo "  ║  Dashboard:     https://brain.weissmurillo.de           ║"
  echo "  ║  Brain API:     https://api.weissmurillo.de             ║"
  echo "  ║                                                          ║"
  echo "  ║  Vault:         /opt/brain/vault                        ║"
  echo "  ║  Compose:       /opt/brain/docker-compose.yml           ║"
  echo "  ║  Logs:          docker compose -C /opt/brain logs -f    ║"
  echo "  ║  Headless Sync: systemctl status brain-headless-sync    ║"
  echo "  ║                                                          ║"
  echo "  ║  PROXIMO PASSO: Configure o Obsidian Headless Sync      ║"
  echo "  ║    1. ob login                                          ║"
  echo "  ║    2. ob sync-setup --vault 'Brain'                     ║"
  echo "  ║         --path /opt/brain/vault                         ║"
  echo "  ║         --device-name 'VPS-Headless'                    ║"
  echo "  ║    3. systemctl start brain-headless-sync               ║"
  echo "  ╚══════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

# ═══════════════════════════════
# EXECUÇÃO
# ═══════════════════════════════
print_banner
collect_inputs
install_dependencies
install_obsidian_headless
setup_headless_sync
configure_firewall
create_directory_structure
create_docker_compose
configure_nginx
issue_ssl
start_services
setup_backup
print_summary
