# Brain Vault — Estrutura Oficial
> Vault do Obsidian para Murilo | AusTV Server Owner | Eng. Software

---

## Estrutura de Pastas

```
Brain/
├── 00-inbox/               # Capturas rápidas, sem categorizar
├── 01-daily/               # Daily notes e check-ins
│   └── YYYY-MM-DD.md
├── 02-claude/              # Padrões de trabalho do Claude ← CRÍTICO
│   ├── CLAUDE.md           # Instruções globais para o Claude
│   ├── skills.md           # Skills a ativar por contexto
│   ├── memoria.md          # Informações persistentes
│   ├── workflows.md        # Fluxos de trabalho padrão
│   └── padrao-codigo.md    # Padrões Java/NestJS/AusTV
├── 03-projetos/            # Projetos ativos
│   ├── AusTV/              # Servidor Minecraft
│   ├── Financeiro-AusTV/   # Sistema financeiro
│   ├── TimeCapsule/        # App TimeCapsule
│   ├── HelpPet/            # Sistema adoção de animais
│   └── Horta-Hidroponica/  # Projeto IoT
├── 04-estudos/             # Material de estudo (Eng. Software)
│   ├── disciplinas/
│   └── resumos/
├── 05-conhecimento/        # Base de conhecimento geral
│   ├── minecraft/
│   ├── programacao/
│   └── devops/
├── 06-documentos/          # Docs, contratos, templates
│   └── contratos/          # Templates de contrato AusTV
├── 07-workflows/           # SOPs e processos documentados
│   ├── deploy-vps.md
│   ├── novo-projeto.md
│   └── daily-routine.md
└── 08-arquivo/             # Notas antigas / encerradas
```

---

## Nota CLAUDE.md (padrão de trabalho)

```markdown
---
tags: [claude, instrucoes, sistema]
created: 2026-03-25
---

# Instruções Globais — Claude

## Identidade do Usuário
- Nome: Murilo
- Proprietário do servidor AusTV (Minecraft 1.20.1)
- Estudante de Engenharia de Software (3° ano)
- Stack: Java (plugins Minecraft), NestJS, Angular/Next.js

## Sempre considerar
- Servidor AusTV como contexto quando relevante
- Padrões de código: Java para plugins, NestJS para APIs
- Banco: PostgreSQL + Prisma (projetos backend)
- Auth: JWT

## Skills a ativar por contexto
| Contexto | Skills |
|---|---|
| Plugin Minecraft | java, minecraft-api |
| API/Backend | nestjs, typescript |
| Frontend | angular, nextjs |
| IoT | arduino, raspberry |
| Documentos | docx, pdf |
| Brain/Notas | obsidian-brain |

## Padrão de resposta
- Português BR
- Direto ao ponto
- Código sempre com comentários relevantes
- Sempre considerar AusTV como contexto
```

---

## Nota skills.md

```markdown
---
tags: [claude, skills]
---

# Skills por Tipo de Chat

## Chat Normal (mobile/web)
- Consultar API do Brain para contexto
- Aplicar padrao-codigo.md

## Cowork/Code
- Ativar obsidian-brain
- Ler CLAUDE.md antes de iniciar
- Consultar workflows.md para tarefas recorrentes

## Projetos específicos
- AusTV → ler 03-projetos/AusTV/README.md
- Financeiro → ler 03-projetos/Financeiro-AusTV/README.md
```
