-- AlterTable
ALTER TABLE "tb_Pagamentos" ADD COLUMN     "caTransacaoExterna" VARCHAR(120),
ADD COLUMN     "idContaRecebimento" INTEGER;

-- CreateTable
CREATE TABLE "tb_ContasRecebimento" (
    "id" SERIAL NOT NULL,
    "idCliente" INTEGER NOT NULL,
    "idEmpresa" INTEGER,
    "dsConta" VARCHAR(120) NOT NULL,
    "cnProvedor" VARCHAR(20) NOT NULL DEFAULT 'pix_manual',
    "cnAmbiente" VARCHAR(10) NOT NULL DEFAULT 'producao',
    "caChavePix" VARCHAR(400),
    "cnTipoChavePix" VARCHAR(12),
    "nmBeneficiario" VARCHAR(25),
    "dsCidade" VARCHAR(15),
    "caCredencial" VARCHAR(600),
    "boPadrao" BOOLEAN NOT NULL DEFAULT false,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "idUsuarioCadastro" INTEGER,
    "idUsuarioAlteracao" INTEGER,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_ContasRecebimento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_ContasRecebimento_idCliente_idx" ON "tb_ContasRecebimento"("idCliente");

-- CreateIndex
CREATE INDEX "tb_ContasRecebimento_idEmpresa_idx" ON "tb_ContasRecebimento"("idEmpresa");

-- CreateIndex
CREATE UNIQUE INDEX "tb_Pagamentos_idContaRecebimento_caTransacaoExterna_key" ON "tb_Pagamentos"("idContaRecebimento", "caTransacaoExterna");

-- AddForeignKey
ALTER TABLE "tb_Pagamentos" ADD CONSTRAINT "tb_Pagamentos_idContaRecebimento_fkey" FOREIGN KEY ("idContaRecebimento") REFERENCES "tb_ContasRecebimento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ContasRecebimento" ADD CONSTRAINT "tb_ContasRecebimento_idCliente_fkey" FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ContasRecebimento" ADD CONSTRAINT "tb_ContasRecebimento_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

