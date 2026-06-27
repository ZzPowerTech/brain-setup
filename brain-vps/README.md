# Murilo's Second Brain — VPS Setup

Domínio: weissmurillo.de | VPS: Hostinger Ubuntu 24.04

## Deploy em Um Comando

Após acessar a VPS via SSH pela primeira vez:

```bash
scp deploy.sh root@IP_DA_VPS:/root/
ssh root@IP_DA_VPS
chmod +x deploy.sh && ./deploy.sh
```

O script pede: Email SSL, API Key (min 32 chars), Senha CouchDB
Tempo estimado: 10–15 minutos

## DNS — Configure antes do deploy

| Tipo | Nome  | Valor      |
|------|-------|------------|
| A    | @     | IP_DA_VPS  |
| A    | brain | IP_DA_VPS  |
| A    | api   | IP_DA_VPS  |
| A    | sync  | IP_DA_VPS  |

## Gerenciamento pós-deploy

```bash
cp brain.sh /usr/local/bin/brain && chmod +x /usr/local/bin/brain
brain status   # Status dos containers
brain logs     # Logs em tempo real
brain backup   # Backup manual
brain update   # Atualiza imagens Docker
```

## URLs
- Dashboard: https://brain.weissmurillo.de
- Brain API: https://api.weissmurillo.de
- LiveSync:  https://sync.weissmurillo.de
