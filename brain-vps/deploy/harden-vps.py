#!/usr/bin/env python3
"""
harden-vps.py — SSH Hardening Script for brain-vps
VPS: root@187.124.243.193 (Ubuntu 24.04)

AVISO CRÍTICO: Mantenha sua sessão SSH atual aberta durante todo o processo.
Se algo der errado, você precisará dela para reverter as alterações.
"""

import sys
import os
import time
import socket

# Fix Unicode output on Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# ---------------------------------------------------------------------------
# Verificar dependências antes de qualquer import
# ---------------------------------------------------------------------------
try:
    import paramiko
except ImportError:
    print("\033[91m[ERRO] paramiko não encontrado. Instale com: pip install paramiko\033[0m")
    sys.exit(1)

try:
    from scp import SCPClient
except ImportError:
    print("\033[93m[AVISO] scp não encontrado. Instale com: pip install scp\033[0m")
    print("\033[93m[AVISO] Continuando sem SCPClient — upload via SFTP.\033[0m")
    SCPClient = None

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------
HOST     = "187.124.243.193"
PORT     = 22
USER     = "root"
PASSWORD = "f1gPdNTETrx8lWzP#"
PUB_KEY_PATH = os.path.expanduser("~/.ssh/brain_vps.pub")

# ---------------------------------------------------------------------------
# Helpers de cor (ANSI)
# ---------------------------------------------------------------------------
GREEN  = "\033[92m"
YELLOW = "\033[93m"
RED    = "\033[91m"
CYAN   = "\033[96m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

def ok(msg):    print(f"{GREEN}  [OK]{RESET} {msg}")
def info(msg):  print(f"{CYAN} [INFO]{RESET} {msg}")
def warn(msg):  print(f"{YELLOW} [WARN]{RESET} {msg}")
def err(msg):   print(f"{RED}[ERRO]{RESET} {msg}")
def step(n, msg): print(f"\n{BOLD}{CYAN}── Etapa {n}: {msg}{RESET}")

# ---------------------------------------------------------------------------
# Execução remota com saída
# ---------------------------------------------------------------------------
def run(ssh: paramiko.SSHClient, cmd: str, timeout: int = 30):
    """Executa comando remoto e retorna (stdout, stderr, exit_code)."""
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", errors="replace").strip()
    err_out = stderr.read().decode("utf-8", errors="replace").strip()
    return out, err_out, exit_code

def run_sudo(ssh: paramiko.SSHClient, cmd: str, timeout: int = 30):
    """Executa comando como root (já somos root, mas mantemos compatibilidade)."""
    return run(ssh, cmd, timeout)

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
def banner():
    print(f"""
{BOLD}{CYAN}╔══════════════════════════════════════════════════════════════╗
║          brain-vps SSH Hardening Script                      ║
║          VPS: {HOST}  |  Ubuntu 24.04              ║
╚══════════════════════════════════════════════════════════════╝{RESET}

{BOLD}{YELLOW}⚠  AVISO CRÍTICO:{RESET}
   Mantenha sua sessão SSH atual aberta durante todo o processo.
   Se algo der errado antes da conclusão, você precisará dela
   para reverter alterações no sshd_config.

""")

# ---------------------------------------------------------------------------
# Etapa 1 — Conectar à VPS
# ---------------------------------------------------------------------------
def step1_connect() -> paramiko.SSHClient:
    step(1, "Conectando à VPS via senha")
    info(f"Host: {HOST}:{PORT}  |  Usuário: {USER}")

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        ssh.connect(
            hostname=HOST,
            port=PORT,
            username=USER,
            password=PASSWORD,
            timeout=15,
            banner_timeout=30,
            auth_timeout=20,
        )
        ok("Conexão estabelecida com sucesso.")
        return ssh
    except socket.timeout:
        err("Timeout ao conectar. Verifique se a VPS está acessível.")
        sys.exit(1)
    except paramiko.AuthenticationException:
        err("Falha de autenticação. Verifique usuário/senha.")
        sys.exit(1)
    except Exception as e:
        err(f"Erro inesperado na conexão: {e}")
        sys.exit(1)

# ---------------------------------------------------------------------------
# Etapa 2 — Ler chave pública local
# ---------------------------------------------------------------------------
def step2_read_pubkey() -> str:
    step(2, "Lendo chave pública local")
    info(f"Caminho: {PUB_KEY_PATH}")

    if not os.path.isfile(PUB_KEY_PATH):
        err(f"Arquivo não encontrado: {PUB_KEY_PATH}")
        err("Gere a chave com: ssh-keygen -t ed25519 -f ~/.ssh/brain_vps")
        sys.exit(1)

    with open(PUB_KEY_PATH, "r") as f:
        pubkey = f.read().strip()

    if not pubkey:
        err("Arquivo de chave pública está vazio.")
        sys.exit(1)

    ok(f"Chave lida: {pubkey[:60]}...")
    return pubkey

# ---------------------------------------------------------------------------
# Etapa 3 — Upload / adição da chave ao authorized_keys
# ---------------------------------------------------------------------------
def step3_install_key(ssh: paramiko.SSHClient, pubkey: str) -> bool:
    step(3, "Instalando chave pública no authorized_keys")

    # Garantir que ~/.ssh existe
    out, e, code = run(ssh, "mkdir -p ~/.ssh && echo OK")
    if "OK" not in out:
        err(f"Não foi possível criar ~/.ssh: {e}")
        return False
    ok("Diretório ~/.ssh verificado.")

    # Verificar se a chave já existe
    check_cmd = f'grep -qF "{pubkey}" ~/.ssh/authorized_keys 2>/dev/null && echo FOUND || echo NOT_FOUND'
    out, _, _ = run(ssh, check_cmd)

    if "FOUND" in out:
        warn("Chave já presente no authorized_keys. Pulando inserção.")
    else:
        # Adicionar chave
        add_cmd = f'echo "{pubkey}" >> ~/.ssh/authorized_keys'
        out, e, code = run(ssh, add_cmd)
        if code != 0:
            err(f"Falha ao adicionar chave: {e}")
            return False
        ok("Chave adicionada ao authorized_keys.")

    return True

# ---------------------------------------------------------------------------
# Etapa 4 — Permissões corretas
# ---------------------------------------------------------------------------
def step4_permissions(ssh: paramiko.SSHClient) -> bool:
    step(4, "Configurando permissões ~/.ssh e authorized_keys")

    cmds = [
        ("chmod 700 ~/.ssh", "chmod 700 ~/.ssh"),
        ("chmod 600 ~/.ssh/authorized_keys", "chmod 600 ~/.ssh/authorized_keys"),
        ("chown -R root:root ~/.ssh", "chown -R root:root ~/.ssh"),
    ]

    all_ok = True
    for label, cmd in cmds:
        out, e, code = run(ssh, cmd)
        if code != 0:
            err(f"Falha: {label} — {e}")
            all_ok = False
        else:
            ok(label)

    return all_ok

# ---------------------------------------------------------------------------
# Etapa 5 — Verificar que a chave foi salva
# ---------------------------------------------------------------------------
def step5_verify_key(ssh: paramiko.SSHClient, pubkey: str) -> bool:
    step(5, "Verificando integridade do authorized_keys")

    out, e, code = run(ssh, "cat ~/.ssh/authorized_keys")
    if code != 0:
        err(f"Não foi possível ler authorized_keys: {e}")
        return False

    # Comparar apenas o tipo + chave (sem comentário), normalizando whitespace
    key_parts = pubkey.strip().split()
    key_id = " ".join(key_parts[:2]) if len(key_parts) >= 2 else pubkey.strip()

    found = any(key_id in line for line in out.splitlines())
    if not found:
        err("CRITICO: Chave NAO encontrada no authorized_keys apos insercao!")
        err("Abortando hardening para nao bloquear acesso.")
        return False

    line_count, _, _ = run(ssh, "wc -l < ~/.ssh/authorized_keys")
    ok(f"Chave verificada no authorized_keys ({line_count.strip()} linha(s)).")

    # Teste extra: verificar sintaxe da chave
    out, e, code = run(ssh, "ssh-keygen -l -f ~/.ssh/authorized_keys 2>&1 | head -5")
    if code == 0:
        ok(f"Fingerprint verificado: {out.split(chr(10))[0]}")
    else:
        warn("Não foi possível verificar fingerprint (não crítico).")

    return True

# ---------------------------------------------------------------------------
# Etapa 6 — Editar /etc/ssh/sshd_config
# ---------------------------------------------------------------------------
SSHD_SETTINGS = {
    "PasswordAuthentication":          "no",
    "ChallengeResponseAuthentication": "no",
    "UsePAM":                          "no",
    "PermitRootLogin":                 "prohibit-password",
    "MaxAuthTries":                    "3",
    "PubkeyAuthentication":            "yes",
    "AuthorizedKeysFile":              ".ssh/authorized_keys",
}

def step6_sshd_config(ssh: paramiko.SSHClient) -> bool:
    step(6, "Endurecendo /etc/ssh/sshd_config")

    # Backup
    out, e, code = run(ssh, "cp /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%Y%m%d%H%M%S)")
    if code == 0:
        ok("Backup do sshd_config criado.")
    else:
        warn(f"Não foi possível criar backup: {e}")

    all_ok = True
    for key, value in SSHD_SETTINGS.items():
        # Estratégia: se a linha existe (comentada ou não), substituí-la;
        # caso contrário, anexar ao final.
        check_cmd = f"grep -E '^#?\\s*{key}' /etc/ssh/sshd_config"
        out, _, code = run(ssh, check_cmd)

        if out:
            # Substituir todas as ocorrências (comentadas ou ativas)
            sed_cmd = (
                f"sed -i 's|^#*\\s*{key}.*|{key} {value}|g' /etc/ssh/sshd_config"
            )
        else:
            # Anexar ao final
            sed_cmd = f"echo '{key} {value}' >> /etc/ssh/sshd_config"

        _, e, rc = run(ssh, sed_cmd)
        if rc != 0:
            err(f"Falha ao configurar {key}: {e}")
            all_ok = False
        else:
            ok(f"{key} = {value}")

    # Validar sintaxe antes de reiniciar
    out, e, code = run(ssh, "sshd -t 2>&1")
    if code != 0:
        err(f"ERRO DE SINTAXE no sshd_config: {e or out}")
        warn("Restaurando backup...")
        run(ssh, "cp $(ls -t /etc/ssh/sshd_config.bak.* | head -1) /etc/ssh/sshd_config")
        return False

    ok("Sintaxe do sshd_config validada com sucesso.")
    return all_ok

# ---------------------------------------------------------------------------
# Etapa 7 — Reiniciar sshd
# ---------------------------------------------------------------------------
def step7_restart_sshd(ssh: paramiko.SSHClient) -> bool:
    step(7, "Reiniciando serviço SSH")
    warn("Mantenha sua sessão atual aberta! Abrindo nova conexão para testar antes...")

    # Reiniciar via systemctl
    out, e, code = run(ssh, "systemctl restart ssh 2>&1 || systemctl restart sshd 2>&1", timeout=30)
    if code != 0:
        err(f"Falha ao reiniciar SSH: {e or out}")
        return False

    time.sleep(2)

    # Verificar status
    out, e, code = run(ssh, "systemctl is-active ssh 2>/dev/null || systemctl is-active sshd 2>/dev/null")
    if out.strip() == "active":
        ok("SSH reiniciado e ativo.")
        return True
    else:
        warn(f"Status SSH após reinício: {out.strip() or 'desconhecido'}")
        return False

# ---------------------------------------------------------------------------
# Etapa 8 — Fail2ban
# ---------------------------------------------------------------------------
def step8_fail2ban(ssh: paramiko.SSHClient) -> bool:
    step(8, "Configurando fail2ban")

    # Verificar se está instalado
    out, _, code = run(ssh, "which fail2ban-client 2>/dev/null")
    if code != 0 or not out:
        info("fail2ban não encontrado. Instalando...")
        out, e, code = run(ssh, "apt-get install -y fail2ban 2>&1 | tail -5", timeout=120)
        if code != 0:
            err(f"Falha ao instalar fail2ban: {e}")
            return False
        ok("fail2ban instalado.")

    # Criar/verificar jail local para SSH
    jail_local = (
        "[DEFAULT]\n"
        "bantime  = 3600\n"
        "findtime = 600\n"
        "maxretry = 3\n\n"
        "[sshd]\n"
        "enabled  = true\n"
        "port     = ssh\n"
        "logpath  = %(sshd_log)s\n"
        "backend  = %(sshd_backend)s\n"
    )

    # Só criar se não existir jail.local
    out, _, code = run(ssh, "test -f /etc/fail2ban/jail.local && echo EXISTS || echo MISSING")
    if "MISSING" in out:
        write_cmd = f"cat > /etc/fail2ban/jail.local << 'HEREDOC'\n{jail_local}\nHEREDOC"
        run(ssh, write_cmd)
        ok("jail.local criado com configuração SSH.")
    else:
        ok("jail.local já existe. Mantendo configuração atual.")

    # Habilitar e iniciar
    run(ssh, "systemctl enable fail2ban 2>&1")
    out, e, code = run(ssh, "systemctl restart fail2ban 2>&1", timeout=30)
    if code != 0:
        warn(f"Reinício do fail2ban retornou código {code}: {e}")

    time.sleep(2)
    out, _, _ = run(ssh, "systemctl is-active fail2ban")
    if out.strip() == "active":
        ok("fail2ban ativo e em execução.")
        return True
    else:
        warn(f"fail2ban status: {out.strip() or 'desconhecido'}")
        return False

# ---------------------------------------------------------------------------
# Etapa 9 — UFW
# ---------------------------------------------------------------------------
def step9_ufw(ssh: paramiko.SSHClient) -> bool:
    step(9, "Configurando UFW (firewall)")

    # Verificar se está instalado
    out, _, code = run(ssh, "which ufw 2>/dev/null")
    if code != 0 or not out:
        info("UFW não encontrado. Instalando...")
        out, e, code = run(ssh, "apt-get install -y ufw 2>&1 | tail -5", timeout=60)
        if code != 0:
            err(f"Falha ao instalar UFW: {e}")
            return False
        ok("UFW instalado.")

    rules = [
        ("ufw allow 22/tcp comment 'SSH'",  "Porta 22 (SSH) liberada"),
        ("ufw allow 80/tcp comment 'HTTP'",  "Porta 80 (HTTP) liberada"),
        ("ufw allow 443/tcp comment 'HTTPS'","Porta 443 (HTTPS) liberada"),
    ]

    for cmd, label in rules:
        out, e, code = run(ssh, cmd)
        if code == 0:
            ok(label)
        else:
            warn(f"Aviso em '{label}': {e}")

    # Habilitar UFW (--force para não precisar de confirmação interativa)
    out, e, code = run(ssh, "echo 'y' | ufw --force enable 2>&1")
    if code == 0:
        ok("UFW habilitado.")
    else:
        warn(f"UFW enable retornou: {e or out}")

    # Status
    out, _, _ = run(ssh, "ufw status verbose 2>&1")
    info("Status UFW:\n" + "\n".join(f"    {l}" for l in out.splitlines()[:20]))

    return True

# ---------------------------------------------------------------------------
# Etapa 10 — Status final
# ---------------------------------------------------------------------------
def step10_final_status(ssh: paramiko.SSHClient):
    step(10, "Status final dos servicos")

    services = {
        "SSH":      "systemctl is-active ssh 2>/dev/null || systemctl is-active sshd 2>/dev/null",
        "fail2ban": "systemctl is-active fail2ban 2>/dev/null",
        "UFW":      "ufw status | head -1",
    }

    print()
    for name, cmd in services.items():
        out, _, _ = run(ssh, cmd)
        status = out.strip() or "desconhecido"
        color = GREEN if "active" in status or "Status: active" in status else YELLOW
        print(f"  {color}{BOLD}{name:<12}{RESET} {status}")

    print()
    # Verificar configurações aplicadas
    info("Verificando sshd_config aplicado:")
    for key in SSHD_SETTINGS:
        out, _, _ = run(ssh, f"grep -E '^{key}' /etc/ssh/sshd_config 2>/dev/null")
        status = out.strip() or f"{YELLOW}(não encontrado){RESET}"
        print(f"    {CYAN}{key:<40}{RESET} {status}")

    print()
    info("Authorized keys instaladas:")
    out, _, _ = run(ssh, "cat ~/.ssh/authorized_keys 2>/dev/null")
    for line in out.splitlines():
        if line.strip():
            print(f"    {GREEN}{line[:80]}{RESET}")

    print(f"""
{BOLD}{GREEN}╔══════════════════════════════════════════════════════════════╗
║  Hardening concluído!                                        ║
╚══════════════════════════════════════════════════════════════╝{RESET}

{BOLD}Próximos passos:{RESET}
  1. Abra um NOVO terminal e teste:
     ssh -i ~/.ssh/brain_vps root@{HOST}
  2. Só feche esta sessão depois de confirmar o acesso por chave.
  3. Se falhar, use o console da Hostinger para reverter.

{YELLOW}Backup do sshd_config original em: /etc/ssh/sshd_config.bak.*{RESET}
""")

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main():
    banner()

    # Confirmação do usuário
    print(f"{BOLD}Pressione ENTER para continuar ou Ctrl+C para cancelar...{RESET}")
    try:
        input()
    except KeyboardInterrupt:
        print("\nCancelado pelo usuário.")
        sys.exit(0)

    ssh = step1_connect()

    try:
        pubkey = step2_read_pubkey()

        installed = step3_install_key(ssh, pubkey)
        if not installed:
            err("Falha ao instalar chave. Abortando por segurança.")
            sys.exit(1)

        step4_permissions(ssh)

        verified = step5_verify_key(ssh, pubkey)
        if not verified:
            err("Verificação da chave falhou. Abortando hardening de senha.")
            err("Resolva o problema e execute novamente.")
            sys.exit(1)

        ok("Chave verificada. Prosseguindo com hardening...")

        sshd_ok = step6_sshd_config(ssh)
        if not sshd_ok:
            warn("Algumas configurações do sshd podem não ter sido aplicadas.")

        step7_restart_sshd(ssh)
        step8_fail2ban(ssh)
        step9_ufw(ssh)
        step10_final_status(ssh)

    except KeyboardInterrupt:
        print(f"\n{YELLOW}Interrompido pelo usuário.{RESET}")
    except Exception as e:
        err(f"Erro inesperado: {e}")
        import traceback
        traceback.print_exc()
    finally:
        ssh.close()
        info("Conexão SSH encerrada.")


if __name__ == "__main__":
    main()
