# Brain VPS — Contexto do Projeto

## O que é
Infraestrutura self-hosted do Second Brain na VPS Hostinger (weissmurillo.de).

## Stack
- VPS: Ubuntu 24.04
  - senha vps: [ver gerenciador de senhas — NUNCA commitar aqui]
  - vps: ssh -i ~/.ssh/brain_vps root@187.124.243.193 (somente chave, sem senha)
- Docker Compose: NestJS + AppFlowy
- Obsidian Headless: Sync contínuo do vault (systemd service)
- Nginx + SSL (Let's Encrypt)
- Domínio: weissmurillo.de

## Subdomínios
- brain.weissmurillo.de → AppFlowy
- api.weissmurillo.de → Brain API NestJS

## Sync
- Obsidian Headless (`ob sync --continuous`) sincroniza /opt/brain/vault/ com Obsidian Sync Cloud
- Obsidian local (Windows) sincroniza via Obsidian Sync
- Fluxo: MCP -> brain-api -> filesystem -> Headless -> Sync -> Obsidian Local

## Padrões
- NestJS com TypeScript, arquitetura MVC limpa
- Sempre usar async/await
- Variáveis de ambiente via .env
