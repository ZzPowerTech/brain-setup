#!/bin/bash

# ═══════════════════════════════════════════════
#  Murilo's Second Brain — Gerenciamento
#  Uso: ./brain.sh [comando]
# ═══════════════════════════════════════════════

BRAIN_DIR="/opt/brain"
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

cd $BRAIN_DIR

case "$1" in

  status)
    echo -e "${BLUE}═══ STATUS DOS SERVIÇOS ═══${NC}"
    docker compose ps
    echo ""
    echo -e "${BLUE}═══ USO DE RECURSOS ═══${NC}"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
    ;;

  logs)
    SERVICE=${2:-""}
    docker compose logs -f --tail=100 $SERVICE
    ;;

  restart)
    SERVICE=${2:-""}
    if [ -z "$SERVICE" ]; then
      echo -e "${YELLOW}Reiniciando todos os serviços...${NC}"
      docker compose restart
    else
      echo -e "${YELLOW}Reiniciando $SERVICE...${NC}"
      docker compose restart $SERVICE
    fi
    echo -e "${GREEN}✓ Pronto${NC}"
    ;;

  update)
    echo -e "${YELLOW}Atualizando imagens...${NC}"
    docker compose pull
    docker compose up -d
    docker image prune -f
    echo -e "${GREEN}✓ Atualizado${NC}"
    ;;

  backup)
    echo -e "${YELLOW}Executando backup manual...${NC}"
    /opt/brain/backup.sh
    echo -e "${GREEN}✓ Backup concluído${NC}"
    ;;

  vault-sync)
    echo -e "${BLUE}═══ STATUS DO VAULT ═══${NC}"
    echo "Total de notas:"
    find /opt/brain/vault -name "*.md" | wc -l
    echo ""
    echo "Última modificação:"
    find /opt/brain/vault -name "*.md" -newer /opt/brain/vault/CLAUDE.md | head -5
    echo ""
    echo -e "${BLUE}═══ SYNC STATUS ═══${NC}"
    systemctl is-active brain-headless-sync && echo -e "${GREEN}Headless Sync: ativo${NC}" || echo -e "${RED}Headless Sync: inativo${NC}"
    ;;

  headless-status)
    echo -e "${BLUE}═══ OBSIDIAN HEADLESS SYNC ═══${NC}"
    systemctl status brain-headless-sync --no-pager
    ;;

  headless-logs)
    journalctl -u brain-headless-sync -n 50 --no-pager
    ;;

  ssl-renew)
    echo -e "${YELLOW}Renovando certificados SSL...${NC}"
    certbot renew --quiet
    systemctl reload nginx
    echo -e "${GREEN}✓ SSL renovado${NC}"
    ;;

  *)
    echo -e "${BLUE}═══ MURILO'S BRAIN — COMANDOS ═══${NC}"
    echo ""
    echo "  ./brain.sh status           — Status de todos os serviços"
    echo "  ./brain.sh logs             — Logs de todos os containers"
    echo "  ./brain.sh logs brain-api   — Logs de um serviço específico"
    echo "  ./brain.sh restart          — Reinicia todos os serviços"
    echo "  ./brain.sh restart appflowy — Reinicia um serviço específico"
    echo "  ./brain.sh update           — Atualiza imagens Docker"
    echo "  ./brain.sh backup           — Backup manual do vault"
    echo "  ./brain.sh vault-sync       — Info sobre o vault e status do sync"
    echo "  ./brain.sh headless-status  — Status do Obsidian Headless Sync"
    echo "  ./brain.sh headless-logs    — Logs do Obsidian Headless Sync"
    echo "  ./brain.sh ssl-renew        — Renova certificados SSL"
    echo ""
    echo -e "${BLUE}═══ URLS ═══${NC}"
    echo "  Dashboard: https://brain.weissmurillo.de"
    echo "  Brain API: https://api.weissmurillo.de"
    ;;
esac
