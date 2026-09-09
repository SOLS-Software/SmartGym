-- CreateTable
CREATE TABLE "tb_Consentimentos" (
    "id" SERIAL NOT NULL,
    "idCliente" INTEGER NOT NULL,
    "idAluno" INTEGER NOT NULL,
    "cnFinalidade" VARCHAR(40) NOT NULL,
    "boConcedido" BOOLEAN NOT NULL,
    "dsVersaoTermo" VARCHAR(40),
    "dtRegistro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anIpOrigem" VARCHAR(64),

    CONSTRAINT "tb_Consentimentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_Consentimentos_idAluno_cnFinalidade_dtRegistro_idx" ON "tb_Consentimentos"("idAluno", "cnFinalidade", "dtRegistro");

-- CreateIndex
CREATE INDEX "tb_Consentimentos_idCliente_idx" ON "tb_Consentimentos"("idCliente");

-- AddForeignKey
ALTER TABLE "tb_Consentimentos" ADD CONSTRAINT "tb_Consentimentos_idCliente_fkey" FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Consentimentos" ADD CONSTRAINT "tb_Consentimentos_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
