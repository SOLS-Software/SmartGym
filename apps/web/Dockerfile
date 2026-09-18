# Imagem do painel web. O contexto de build e a RAIZ do repositorio:
#
#   docker build -f apps/web/Dockerfile -t solsfit-web .
#
# No Coolify: aplicacao do tipo Dockerfile, Base Directory `/`, Dockerfile
# Location `/apps/web/Dockerfile`.
#
# Nao ha build arg aqui, e isso e deliberado. O navegador nunca chama a API
# direto: `apiUrl` em src/shared/api/apiFetch.ts e a string fixa '/api/proxy', e
# quem fala com o backend e a route handler app/api/proxy/[...path]/route.ts,
# no servidor Next, usando `API_URL`. Logo:
#
#   - `API_URL` e variavel de RUNTIME. Aponte para a rede interna do Docker
#     (http://api:3333): o trafego painel->API nao sai para a internet.
#   - `NEXT_PUBLIC_API_URL` NAO e lida por nenhum codigo deste app — e entrada
#     obsoleta no .env.example. Nao a transforme em build arg "por seguranca":
#     isso so criaria a impressao de que trocar o endereco da API exige rebuild
#     do painel, quando basta reiniciar o container com outra `API_URL`.

FROM node:22-slim AS build

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @solsfit/web build


FROM node:22-slim AS runner

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=node:node /app /app
USER node

WORKDIR /app/apps/web

EXPOSE 3000

CMD ["pnpm", "start"]
