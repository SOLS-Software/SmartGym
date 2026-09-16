-- Chave de endereco dos dispositivos: como a catraca diz de QUAL academia ela e.
--
-- O PROBLEMA
-- As rotas de push/poll da Control iD sao publicas (o firmware nao manda JWT) e
-- descobrem a catraca pelo `caSerial`, que mora em tb_Catracas — tabela de
-- APLICACAO. Com banco por cliente isso vira ovo-e-galinha: para saber em qual
-- banco procurar o serial, seria preciso ja saber de quem e o equipamento.
--
-- A SAIDA
-- O endereco do servidor e configuravel no equipamento, e o firmware ANEXA o
-- proprio endpoint ao caminho que digitamos (e por isso que hoje existem rotas
-- para /controlid, /controlid/push e /controlid/push/push — sao tres bases
-- diferentes ja vistas em campo). Ou seja, o CAMINHO e nosso. Cada cliente
-- ganha uma chave sorteada; o equipamento passa a apontar para
-- ".../d/<chave>", e o tenant sai do proprio caminho, resolvido AQUI no
-- control-plane, antes de abrir qualquer banco de aplicacao.
--
-- POR QUE EM tb_Clientes, E NAO NUMA TABELA DE-PARA
-- A linha do cliente ja E o control-plane. Guardar a chave nela significa zero
-- sincronismo entre bancos — um de-para serial->cliente precisaria de duas
-- escritas em bancos diferentes e derivaria no primeiro erro, virando catraca
-- fantasma.
--
-- BONUS DE SEGURANCA
-- Neste firmware `caToken` e inviavel (a tela de push nao tem campo de token),
-- entao a unica autenticacao de equipamento era tb_Catracas.anIpPermitido — com
-- o aparelho em DHCP, fragil por construcao. A chave no caminho devolve parte
-- dessa autenticacao e nao depende de IP.

ALTER TABLE "tb_Clientes" ADD COLUMN IF NOT EXISTS "caChaveDispositivo" varchar(64);

-- Backfill: 32 bytes de aleatoriedade em hex para quem ja existe. gen_random_uuid
-- vem do pgcrypto/pg13+ e esta disponivel; dois uuids dao 64 hex chars.
UPDATE "tb_Clientes"
SET "caChaveDispositivo" = replace(gen_random_uuid()::text, '-', '')
                        || replace(gen_random_uuid()::text, '-', '')
WHERE "caChaveDispositivo" IS NULL;

-- Unica: e ela que resolve o tenant, entao colisao seria entregar a catraca de
-- uma academia para outra.
CREATE UNIQUE INDEX IF NOT EXISTS "tb_Clientes_caChaveDispositivo_key"
  ON "tb_Clientes" ("caChaveDispositivo");

-- Rollback: DROP INDEX "tb_Clientes_caChaveDispositivo_key";
--           ALTER TABLE "tb_Clientes" DROP COLUMN "caChaveDispositivo";
