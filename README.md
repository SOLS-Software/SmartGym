# SmartGym

Monorepo para o SmartGym com API em Node.js/TypeScript, web em Next.js, mobile em Expo e banco com Prisma.

## Estrutura

```txt
apps/
  api/      API Node.js com Fastify
  web/      Aplicacao web com Next.js
  mobile/   Aplicacao mobile com Expo

packages/
  db/       Prisma schema e client compartilhado
  shared/   Tipos, validacoes e contratos compartilhados
  config/   Configuracoes TypeScript reutilizaveis
```

## Primeiros passos

```bash
pnpm install
pnpm db:generate
pnpm dev
```

No Windows PowerShell, crie seu `.env` assim:

```powershell
Copy-Item .env.example .env
```

## Scripts principais

- `pnpm dev`: inicia os apps em modo desenvolvimento.
- `pnpm build`: gera builds.
- `pnpm lint`: executa lint.
- `pnpm typecheck`: valida TypeScript.
- `pnpm db:migrate`: roda migrations do Prisma.
- `pnpm db:seed`: cria dados de exemplo.
- `pnpm db:studio`: abre o Prisma Studio.

## Banco remoto

Crie um banco PostgreSQL em um provedor como Supabase, Neon ou Railway. Depois copie a connection string e substitua a variavel `DATABASE_URL` no arquivo `.env`.

Exemplo:

```env
DATABASE_URL="postgresql://usuario:senha@host:5432/smartgym?schema=public"
```

Depois rode:

```bash
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

O seed cria planos, alunos e matriculas de exemplo sem apagar dados existentes.
