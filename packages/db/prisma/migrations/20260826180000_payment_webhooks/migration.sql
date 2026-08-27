-- AlterTable
ALTER TABLE "tb_ContasRecebimento" ADD COLUMN     "caTokenWebhook" VARCHAR(64);

-- CreateTable
CREATE TABLE "tb_WebhookEventos" (
    "id" SERIAL NOT NULL,
    "idContaRecebimento" INTEGER NOT NULL,
    "cnProvedor" VARCHAR(20) NOT NULL,
    "caEventoExterno" VARCHAR(120),
    "cnTipoEvento" VARCHAR(60) NOT NULL DEFAULT '',
    "caTransacaoExterna" VARCHAR(120),
    "cnStatus" VARCHAR(20) NOT NULL DEFAULT 'recebido',
    "dsResultado" VARCHAR(400),
    "dsPayload" VARCHAR(4000),
    "idPagamento" INTEGER,
    "dtProcessamento" TIMESTAMP(3),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tb_WebhookEventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_WebhookEventos_idContaRecebimento_dtCadastro_idx" ON "tb_WebhookEventos"("idContaRecebimento", "dtCadastro");

-- CreateIndex
CREATE INDEX "tb_WebhookEventos_caTransacaoExterna_idx" ON "tb_WebhookEventos"("caTransacaoExterna");

-- CreateIndex
CREATE UNIQUE INDEX "tb_WebhookEventos_idContaRecebimento_caEventoExterno_key" ON "tb_WebhookEventos"("idContaRecebimento", "caEventoExterno");

-- CreateIndex
CREATE UNIQUE INDEX "tb_ContasRecebimento_caTokenWebhook_key" ON "tb_ContasRecebimento"("caTokenWebhook");

-- AddForeignKey
ALTER TABLE "tb_WebhookEventos" ADD CONSTRAINT "tb_WebhookEventos_idContaRecebimento_fkey" FOREIGN KEY ("idContaRecebimento") REFERENCES "tb_ContasRecebimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_WebhookEventos" ADD CONSTRAINT "tb_WebhookEventos_idPagamento_fkey" FOREIGN KEY ("idPagamento") REFERENCES "tb_Pagamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

