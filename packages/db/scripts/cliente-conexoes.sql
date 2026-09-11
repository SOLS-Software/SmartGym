-- Control plane do multi-tenancy de DADOS (modelo hibrido/registro).
--
-- tb_ClienteConexoes: por cliente, PARA ONDE apontam os dados dele — banco de
-- dados e storage de imagens. As credenciais ficam CIFRADAS (prefixo enc:v1:,
-- mesma chave mestre de apps/api/src/shared/secrets.ts). Buckets ficam em claro
-- (nao sao segredo; sao operacionais).
--
-- SEMANTICA (lida pelo resolver em apps/api/src/shared/tenantDataSource.ts):
--   linha AUSENTE, coluna NULA ou boAtivo=false  =>  usa o DEFAULT do .env
--   (o pool de banco / storage compartilhado de hoje). Assim, so os clientes
--   com registro proprio apontam para infra dedicada; o resto nao muda.
--
-- NAO e dado de tenant: guarda credenciais de infra e NUNCA pode ser exposta por
-- rota nem lida por role de tenant. So o resolver do backend a le. Por isso fica
-- FORA das policies de RLS de tenant (como tb_Auditoria). Idempotente.

CREATE TABLE IF NOT EXISTS "tb_ClienteConexoes" (
  "idCliente"               integer PRIMARY KEY REFERENCES "tb_Clientes"("id"),
  -- Banco de dados dedicado do tenant (string de conexao Postgres), cifrada.
  -- Nula => o tenant continua no banco padrao (pool compartilhado do .env).
  "dsDatabaseUrlEnc"        text,
  -- Storage de imagens dedicado (Supabase), cifrados. Ambos nulos => storage
  -- padrao do .env. Precisa de url E key juntos para ativar o dedicado.
  "dsStorageUrlEnc"         text,
  "dsStorageKeyEnc"         text,
  -- Buckets (em claro): nulos => herdam o bucket padrao do .env.
  "dsStorageBucket"         varchar(255),
  "dsStorageBucketClientes" varchar(255),
  -- Desliga o override sem apagar o registro (volta ao padrao).
  "boAtivo"                 boolean     NOT NULL DEFAULT true,
  "dtCadastro"              timestamptz NOT NULL DEFAULT now(),
  "dtAlteracao"             timestamptz NOT NULL DEFAULT now()
);

-- Rollback (se precisar): DROP TABLE IF EXISTS "tb_ClienteConexoes";
