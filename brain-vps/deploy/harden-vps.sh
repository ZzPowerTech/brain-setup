#!/usr/bin/env bash
# =============================================================================
# harden-vps.sh — SSH Hardening Script para brain-vps
# VPS: root@<VPS_IP> (Ubuntu 24.04)
#
# Uso: execute este script DIRETAMENTE na VPS via console (Hostinger/painel)
# ou via: bash harden-vps.sh
#
# AVISO: Mantenha sua sessão SSH atual aberta durante todo o processo.
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Cores
# ---------------------------------------------------------------------------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

ok()   { echo -e "${GREEN}  [OK]${RESET} $*"; }
info() { echo -e "${CYAN} [INFO]${RESET} $*"; }
warn() { echo -e "${YELLOW} [WARN]${RESET} $*"; }
err()  { echo -e "${RED}[ERRO]${RESET} $*"; }
step() { echo -e "\n${BOLD}${CYAN}── Etapa $1: $2${RESET}"; }

# ---------------------------------------------------------------------------
# Verificar root
# ---------------------------------------------------------------------------
if [[ $EUID -ne 0 ]]; then
    err "Este script deve ser executado como root."
    exit 1
fi

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo -e "
${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗
║          brain-vps SSH Hardening Script (bash)               ║
║          VPS: <VPS_IP>  |  Ubuntu 24.04               ║
╚══════════════════════════════════════════════════════════════╝${RESET}

${BOLD}${YELLOW}AVISO CRÍTICO:${RESET}
   Mantenha sua sessão SSH atual aberta durante todo o processo.
   Se algo der errado, você precisará dela para reverter.
"

read -rp "Pressione ENTER para continuar ou Ctrl+C para cancelar..."

# ---------------------------------------------------------------------------
# Etapa 1 — Chave pública (cole aqui ou defina via variável de ambiente)
# ---------------------------------------------------------------------------
step 1 "Configurando chave pública SSH"

# Chave gerada para brain-vps (brain_vps.pub)
PUBKEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIP8Zz5tlN3KiY6SD1BnP8O/c7FRaFGtHtSWeUIpf/t87 brain-vps-murilo"

# Permite sobrescrever via variável de ambiente
PUBKEY="${BRAIN_VPS_PUBKEY:-$PUBKEY}"

info "Chave: ${PUBKEY:0:60}..."

# ---------------------------------------------------------------------------
# Etapa 2 — Instalar chave em authorized_keys
# ---------------------------------------------------------------------------
step 2 "Instalando chave no authorized_keys"

mkdir -p /root/.ssh
chmod 700 /root/.ssh

AUTH_FILE="/root/.ssh/authorized_keys"

if grep -qF "$PUBKEY" "$AUTH_FILE" 2>/dev/null; then
    warn "Chave já presente no authorized_keys. Pulando inserção."
else
    echo "$PUBKEY" >> "$AUTH_FILE"
    ok "Chave adicionada ao authorized_keys."
fi

# ---------------------------------------------------------------------------
# Etapa 3 — Permissões corretas
# ---------------------------------------------------------------------------
step 3 "Configurando permissões"

chmod 700 /root/.ssh
chmod 600 "$AUTH_FILE"
chown -R root:root /root/.ssh

ok "chmod 700 ~/.ssh"
ok "chmod 600 ~/.ssh/authorized_keys"
ok "chown root:root ~/.ssh"

# ---------------------------------------------------------------------------
# Etapa 4 — Verificar chave salva
# ---------------------------------------------------------------------------
step 4 "Verificando integridade do authorized_keys"

if grep -qF "$PUBKEY" "$AUTH_FILE"; then
    LINE_COUNT=$(wc -l < "$AUTH_FILE")
    ok "Chave verificada no authorized_keys (${LINE_COUNT} linha(s))."
else
    err "CRÍTICO: Chave NÃO encontrada no authorized_keys!"
    err "Abortando para não bloquear acesso."
    exit 1
fi

# ---------------------------------------------------------------------------
# Etapa 5 — Backup e hardening do sshd_config
# ---------------------------------------------------------------------------
step 5 "Endurecendo /etc/ssh/sshd_config"

SSHD_CONFIG="/etc/ssh/sshd_config"
BACKUP_FILE="/etc/ssh/sshd_config.bak.$(date +%Y%m%d%H%M%S)"

cp "$SSHD_CONFIG" "$BACKUP_FILE"
ok "Backup criado em: $BACKUP_FILE"

# Função para aplicar configuração
apply_sshd_setting() {
    local key="$1"
    local value="$2"

    if grep -qE "^#?\s*${key}" "$SSHD_CONFIG"; then
        # Substituir linha existente (comentada ou ativa)
        sed -i "s|^#*\s*${key}.*|${key} ${value}|g" "$SSHD_CONFIG"
    else
        # Adicionar ao final
        echo "${key} ${value}" >> "$SSHD_CONFIG"
    fi
    ok "${key} = ${value}"
}

apply_sshd_setting "PasswordAuthentication"          "no"
apply_sshd_setting "ChallengeResponseAuthentication" "no"
apply_sshd_setting "UsePAM"                          "no"
apply_sshd_setting "PermitRootLogin"                 "prohibit-password"
apply_sshd_setting "MaxAuthTries"                    "3"
apply_sshd_setting "PubkeyAuthentication"            "yes"
apply_sshd_setting "AuthorizedKeysFile"              ".ssh/authorized_keys"

# Validar sintaxe
info "Validando sintaxe do sshd_config..."
if ! sshd -t 2>&1; then
    err "ERRO DE SINTAXE detectado no sshd_config!"
    warn "Restaurando backup: $BACKUP_FILE"
    cp "$BACKUP_FILE" "$SSHD_CONFIG"
    err "Backup restaurado. Verifique o arquivo manualmente."
    exit 1
fi
ok "Sintaxe validada com sucesso."

# ---------------------------------------------------------------------------
# Etapa 6 — Reiniciar SSH
# ---------------------------------------------------------------------------
step 6 "Reiniciando servico SSH"

warn "Reiniciando SSH — mantenha esta sessão aberta!"

if systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null; then
    sleep 2
    if systemctl is-active --quiet ssh 2>/dev/null || systemctl is-active --quiet sshd 2>/dev/null; then
        ok "SSH reiniciado e ativo."
    else
        warn "SSH pode não estar ativo. Verifique: systemctl status ssh"
    fi
else
    err "Falha ao reiniciar SSH."
    warn "Tentando recarregar configuração..."
    kill -HUP "$(pgrep -x sshd | head -1)" 2>/dev/null && ok "SIGHUP enviado ao sshd." || err "Falha ao enviar SIGHUP."
fi

# ---------------------------------------------------------------------------
# Etapa 7 — Fail2ban
# ---------------------------------------------------------------------------
step 7 "Configurando fail2ban"

if ! command -v fail2ban-client &>/dev/null; then
    info "Instalando fail2ban..."
    apt-get update -qq
    apt-get install -y fail2ban
    ok "fail2ban instalado."
fi

# Criar jail.local se não existir
JAIL_LOCAL="/etc/fail2ban/jail.local"
if [[ ! -f "$JAIL_LOCAL" ]]; then
    cat > "$JAIL_LOCAL" << 'EOF'
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 3

[sshd]
enabled  = true
port     = ssh
logpath  = %(sshd_log)s
backend  = %(sshd_backend)s
EOF
    ok "jail.local criado."
else
    ok "jail.local já existe. Mantendo configuração atual."
fi

systemctl enable fail2ban --quiet
systemctl restart fail2ban
sleep 2

if systemctl is-active --quiet fail2ban; then
    ok "fail2ban ativo e em execução."
else
    warn "fail2ban pode não estar ativo. Verifique: systemctl status fail2ban"
fi

# ---------------------------------------------------------------------------
# Etapa 8 — UFW
# ---------------------------------------------------------------------------
step 8 "Configurando UFW (firewall)"

if ! command -v ufw &>/dev/null; then
    info "Instalando UFW..."
    apt-get install -y ufw
    ok "UFW instalado."
fi

# Garantir que SSH está liberado ANTES de habilitar
ufw allow 22/tcp  comment 'SSH'   && ok "Porta 22 (SSH) liberada"
ufw allow 80/tcp  comment 'HTTP'  && ok "Porta 80 (HTTP) liberada"
ufw allow 443/tcp comment 'HTTPS' && ok "Porta 443 (HTTPS) liberada"

# Habilitar sem prompt interativo
echo "y" | ufw --force enable
ok "UFW habilitado."

# ---------------------------------------------------------------------------
# Etapa 9 — Status final
# ---------------------------------------------------------------------------
step 9 "Status final dos servicos"

echo ""
echo -e "  ${BOLD}Servico          Status${RESET}"
echo    "  ──────────────────────────────"

SSH_STATUS=$(systemctl is-active ssh 2>/dev/null || systemctl is-active sshd 2>/dev/null || echo "desconhecido")
F2B_STATUS=$(systemctl is-active fail2ban 2>/dev/null || echo "desconhecido")
UFW_STATUS=$(ufw status | head -1 | awk '{print $NF}')

[[ "$SSH_STATUS" == "active" ]]    && C=$GREEN || C=$YELLOW
echo -e "  ${C}${BOLD}SSH              ${SSH_STATUS}${RESET}"

[[ "$F2B_STATUS" == "active" ]]    && C=$GREEN || C=$YELLOW
echo -e "  ${C}${BOLD}fail2ban         ${F2B_STATUS}${RESET}"

[[ "$UFW_STATUS" == "active" ]]    && C=$GREEN || C=$YELLOW
echo -e "  ${C}${BOLD}UFW              ${UFW_STATUS}${RESET}"

echo ""
info "Configuracoes sshd aplicadas:"
for key in PasswordAuthentication ChallengeResponseAuthentication UsePAM PermitRootLogin MaxAuthTries PubkeyAuthentication; do
    val=$(grep -E "^${key}" "$SSHD_CONFIG" 2>/dev/null || echo "(não encontrado)")
    printf "    ${CYAN}%-40s${RESET} %s\n" "$key" "$val"
done

echo ""
info "UFW status:"
ufw status verbose 2>&1 | head -20 | sed 's/^/    /'

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════════╗
║  Hardening concluído!                                        ║
╚══════════════════════════════════════════════════════════════╝${RESET}

${BOLD}Proximos passos:${RESET}
  1. Abra um NOVO terminal e teste:
     ssh -i ~/.ssh/brain_vps root@<VPS_IP>

  2. So feche esta sessao apos confirmar acesso por chave.

  3. Se falhar, use o console da Hostinger para reverter:
     cp ${BACKUP_FILE} /etc/ssh/sshd_config
     systemctl restart ssh

${YELLOW}Backup: ${BACKUP_FILE}${RESET}
"
