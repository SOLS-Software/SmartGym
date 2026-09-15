# Imagem da API. O contexto de build e a RAIZ do repositorio (workspace pnpm):
#
#   docker build -f apps/api/Dockerfile -t smartgym-api .
#
# No Coolify: aplicacao do tipo Dockerfile, com Base Directory `/` e Dockerfile
# Location `/apps/api/Dockerfile`.
#
# Por que node:22 e por que o estagio final copia o workspace inteiro:
# o `dist/` compilado importa `@smartgym/db` e `@smartgym/shared` por nome, e o
# campo `main` desses dois pacotes aponta para `src/index.ts` — TypeScript, nao
# JavaScript. Quem executa isso em producao e o type stripping nativo do Node,
# ligado por padrao a partir do 22.18. Numa imagem mais antiga, ou copiando so o
# `dist`, a API nao sobe. A correcao definitiva e compilar os dois pacotes para
# JS e apontar o `main` para o build; enquanto isso nao acontece, a imagem
# precisa das fontes.

FROM node:22-slim AS build

# Sem o pacote openssl, o Prisma nao consegue detectar a versao de libssl e cai
# no default "openssl-1.1.x" — engine errado para uma Debian com OpenSSL 3.
# Verificado no build de 15/09/2026: sem esta linha, o generate avisa e o
# runtime fica sujeito a nao achar a query engine da plataforma.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# `manage-package-manager-versions=false` no .npmrc desliga a troca automatica
# de versao, entao fixamos a mesma do campo `packageManager` do package.json.
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

# O `allowBuilds` do pnpm-workspace.yaml bloqueia o postinstall do prisma, entao
# o client nao e gerado sozinho no install. O CI faz exatamente este passo.
RUN pnpm --filter @smartgym/db db:generate

RUN pnpm --filter @smartgym/api build


FROM node:22-slim AS runner

# O engine do Prisma resolve a libssl de novo em runtime, nao so no generate.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
WORKDIR /app

# O usuario `node` ja existe na imagem oficial. Rodar como root dentro do
# container e desnecessario aqui — a API nao escreve em nada fora do /tmp.
COPY --from=build --chown=node:node /app /app
USER node

WORKDIR /app/apps/api

EXPOSE 3333

# Bate na mesma rota que o monitor externo usa. `/health` esta na lista de
# rotas publicas do plugin de auth (apps/api/src/plugins/auth.ts).
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT??3333)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
