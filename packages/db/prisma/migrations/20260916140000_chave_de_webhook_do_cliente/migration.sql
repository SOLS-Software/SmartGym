-- Chave de roteamento do webhook de pagamento.
--
-- O PROBLEMA (mesmo da catraca, outra porta)
-- /webhooks/payments/<token> e publica e descobre a conta pelo caTokenWebhook,
-- que mora em tb_ContasRecebimento — tabela de APLICACAO. Com banco por cliente
-- vira ovo-e-galinha: para procurar o token seria preciso ja saber de quem ele e.
--
-- A SAIDA
-- O endereco passa a ter duas partes: /webhooks/payments/<chave>/<token>.
-- A CHAVE roteia (resolvida aqui, no control-plane, antes de abrir qualquer
-- banco de aplicacao) e o TOKEN continua autenticando a conta, em tempo
-- constante, como ja fazia. Zero sincronismo: a chave mora na linha do cliente,
-- que JA e control-plane.
--
-- POR QUE NAO REUSAR caChaveDispositivo
-- Sao dois paineis de terceiro diferentes: a chave do dispositivo e digitada na
-- tela do equipamento, a do webhook e colada no painel do provedor de pagamento.
-- Uma chave so faria o vazamento de um enfraquecer o outro — e a do dispositivo
-- e, neste firmware, a unica autenticacao de equipamento que sobrou (a tela de
-- push nao tem campo de token).
--
-- POR QUE NAO UM DE-PARA token->cliente
-- Seria uma segunda copia do token, em outro banco, com que manter em dia na
-- criacao, na desativacao e na exclusao da conta. Chave no cliente nao tem o que
-- derivar.

ALTER TABLE "tb_Clientes" ADD COLUMN IF NOT EXISTS "caChaveWebhook" varchar(64);

UPDATE "tb_Clientes"
SET "caChaveWebhook" = replace(gen_random_uuid()::text, '-', '')
                    || replace(gen_random_uuid()::text, '-', '')
WHERE "caChaveWebhook" IS NULL;

-- Unica: e ela que decide o tenant, entao colisao entregaria o evento de
-- pagamento de uma academia para outra.
CREATE UNIQUE INDEX IF NOT EXISTS "tb_Clientes_caChaveWebhook_key"
  ON "tb_Clientes" ("caChaveWebhook");

-- Rollback: DROP INDEX "tb_Clientes_caChaveWebhook_key";
--           ALTER TABLE "tb_Clientes" DROP COLUMN "caChaveWebhook";
