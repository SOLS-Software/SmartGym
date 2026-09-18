#!/usr/bin/env bash
#
# Backup diario dos DOIS bancos do SOLSFIT para o Cloudflare R2.
#
# Por que dois: o Neon guarda o sistema; o Postgres do CompreFace guarda os
# rostos cadastrados. Perder o segundo nao perde nenhum dado de negocio, mas
# obriga a recadastrar a biometria de todos os alunos, um por um, na recepcao.
# Backup que cobre so o Neon da uma falsa sensacao de completude.
#
# Este script NAO substitui o point-in-time recovery de 7 dias do Neon. Ele
# cobre o que o PITR nao cobre: apagar o projeto por engano, perder o acesso a
# conta, ou querer o banco de tres meses atras.
#
# ---------------------------------------------------------------------------
# Instalacao no VPS
# ---------------------------------------------------------------------------
#   1. Instale o rclone e configure o remote do R2 (uma vez):
#        apt install -y rclone && rclone config
#      Tipo "s3", provider "Cloudflare", e o endpoint/credenciais do token R2.
#      Chame o remote de "r2" (ou ajuste R2_REMOTE abaixo).
#
#   2. Crie /etc/smartgym/backup.env com permissao 600 (ele tem senha dentro):
#        DATABASE_URL="postgresql://...neon.tech/...?sslmode=require"
#        CF_POSTGRES_PASSWORD="a mesma senha do compose do CompreFace"
#        R2_BUCKET="smartgym-backups"
#        HEARTBEAT_URL="https://hc-ping.com/seu-uuid"   # opcional
#      E: install -m 600 /dev/null /etc/smartgym/backup.env
#
#   3. Agende. No Coolify, um "Scheduled Task" diario chamando este arquivo, ou
#      um cron do sistema:
#        0 3 * * * /opt/solsfit/backup.sh >> /var/log/solsfit-backup.log 2>&1
#
#   4. UMA VEZ POR MES, restaure o dump mais recente num banco descartavel.
#      Backup nunca restaurado nao e backup — e um arquivo.
#
# Roda como root (precisa falar com o socket do Docker).

set -Eeuo pipefail

ENV_FILE="${ENV_FILE:-/etc/smartgym/backup.env}"

# Imagem usada para o pg_dump do Neon. A regra e: o cliente precisa ser IGUAL OU
# MAIS NOVO que o servidor. pg_dump 17 contra servidor 16 funciona; o contrario
# falha com "server version mismatch". Se o Neon subir de versao, suba aqui.
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"

R2_REMOTE="${R2_REMOTE:-r2}"

# Container do Postgres do CompreFace, como nomeado em
# deploy/compreface/docker-compose.yml.
CF_CONTAINER="${CF_CONTAINER:-compreface-postgres-db}"
CF_PG_USER="${CF_PG_USER:-postgres}"
CF_PG_DB="${CF_PG_DB:-frs}"

# --- retencao -------------------------------------------------------------
# 7 diarios + 4 semanais + 3 mensais. Cabe folgado nos 10 GB gratuitos do R2;
# 30 dumps diarios de um banco de 500 MB nao caberiam.
KEEP_DAILY="${KEEP_DAILY:-8d}"
KEEP_WEEKLY="${KEEP_WEEKLY:-29d}"
KEEP_MONTHLY="${KEEP_MONTHLY:-100d}"

# ---------------------------------------------------------------------------

log() { printf '%s  %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }

# Falha silenciosa e o unico jeito de um backup te trair. Sem este trap, um erro
# no meio deixa o script morrer sem aviso e voce so descobre no dia em que
# precisar restaurar. Com HEARTBEAT_URL configurada, o monitor externo reclama
# tanto quando o script falha quanto quando ele simplesmente para de rodar.
on_error() {
  local line=$1
  log "FALHOU na linha ${line}"
  if [[ -n "${HEARTBEAT_URL:-}" ]]; then
    curl -fsS -m 10 --retry 3 "${HEARTBEAT_URL}/fail" >/dev/null 2>&1 || true
  fi
}
trap 'on_error $LINENO' ERR

[[ -r "$ENV_FILE" ]] || { echo "Nao consigo ler $ENV_FILE"; exit 1; }
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${DATABASE_URL:?DATABASE_URL ausente em $ENV_FILE}"
: "${R2_BUCKET:?R2_BUCKET ausente em $ENV_FILE}"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

DAY="$(date -u +%F)"          # 2026-09-15
WEEK="$(date -u +%G-W%V)"     # 2026-W38  (ISO: o ano acompanha a semana)
MONTH="$(date -u +%Y-%m)"     # 2026-09
DOW="$(date -u +%u)"          # 7 = domingo
DOM="$(date -u +%d)"          # 01 = primeiro do mes

# ---------------------------------------------------------------------------
# 1. Dump do banco da aplicacao (Neon)
# ---------------------------------------------------------------------------
log "dump do banco da aplicacao"
# --env-file em vez de -e: a DATABASE_URL tem senha, e `-e` a deixaria visivel
# num `docker inspect` do container enquanto ele existe.
docker run --rm --env-file "$ENV_FILE" -v "$WORKDIR:/out" "$PG_IMAGE" \
  sh -c 'pg_dump "$DATABASE_URL" -Fc --no-owner --no-acl -f /out/app.dump'

# Um arquivo truncado tambem tem tamanho > 0. `pg_restore --list` le o indice do
# archive e falha se ele estiver corrompido: e a diferenca entre ter um backup e
# ter um arquivo com cara de backup.
log "conferindo integridade do dump da aplicacao"
docker run --rm -v "$WORKDIR:/out" "$PG_IMAGE" \
  pg_restore --list /out/app.dump >/dev/null

# ---------------------------------------------------------------------------
# 2. Dump do Postgres do CompreFace
# ---------------------------------------------------------------------------
if docker ps --format '{{.Names}}' | grep -qx "$CF_CONTAINER"; then
  log "dump do banco do CompreFace"
  # pg_dump rodado DENTRO do container: a versao do cliente bate com a do
  # servidor por construcao, sem precisar saber qual e.
  docker exec -e PGPASSWORD="${CF_POSTGRES_PASSWORD:-}" "$CF_CONTAINER" \
    pg_dump -U "$CF_PG_USER" -Fc --no-owner --no-acl "$CF_PG_DB" \
    > "$WORKDIR/compreface.dump"

  docker run --rm -v "$WORKDIR:/out" "$PG_IMAGE" \
    pg_restore --list /out/compreface.dump >/dev/null
else
  log "AVISO: container $CF_CONTAINER nao esta rodando; pulando o CompreFace"
fi

# ---------------------------------------------------------------------------
# 3. Envio e rotacao
# ---------------------------------------------------------------------------
upload_and_rotate() {
  local nome=$1 arquivo=$2
  local base="${R2_REMOTE}:${R2_BUCKET}/${nome}"

  log "enviando ${nome}/daily/${DAY}.dump"
  rclone copyto "$arquivo" "${base}/daily/${DAY}.dump"

  # Copia server-side: o R2 duplica internamente, sem subir o arquivo de novo.
  if [[ "$DOW" == "7" ]]; then
    log "promovendo a semanal ${WEEK}"
    rclone copyto "${base}/daily/${DAY}.dump" "${base}/weekly/${WEEK}.dump"
  fi
  if [[ "$DOM" == "01" ]]; then
    log "promovendo a mensal ${MONTH}"
    rclone copyto "${base}/daily/${DAY}.dump" "${base}/monthly/${MONTH}.dump"
  fi

  rclone delete "${base}/daily"   --min-age "$KEEP_DAILY"
  rclone delete "${base}/weekly"  --min-age "$KEEP_WEEKLY"
  rclone delete "${base}/monthly" --min-age "$KEEP_MONTHLY"
}

upload_and_rotate "app" "$WORKDIR/app.dump"
[[ -f "$WORKDIR/compreface.dump" ]] && upload_and_rotate "compreface" "$WORKDIR/compreface.dump"

log "concluido"
if [[ -n "${HEARTBEAT_URL:-}" ]]; then
  curl -fsS -m 10 --retry 3 "$HEARTBEAT_URL" >/dev/null 2>&1 || true
fi
