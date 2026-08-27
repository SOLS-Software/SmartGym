-- CreateTable
CREATE TABLE "tb_AlunoIntegracoes" (
    "id" SERIAL NOT NULL,
    "idAluno" INTEGER NOT NULL,
    "idContaRecebimento" INTEGER NOT NULL,
    "caClienteExterno" VARCHAR(120) NOT NULL,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tb_AlunoIntegracoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_AlunoIntegracoes_idContaRecebimento_idx" ON "tb_AlunoIntegracoes"("idContaRecebimento");

-- CreateIndex
CREATE UNIQUE INDEX "tb_AlunoIntegracoes_idAluno_idContaRecebimento_key" ON "tb_AlunoIntegracoes"("idAluno", "idContaRecebimento");

-- AddForeignKey
ALTER TABLE "tb_AlunoIntegracoes" ADD CONSTRAINT "tb_AlunoIntegracoes_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoIntegracoes" ADD CONSTRAINT "tb_AlunoIntegracoes_idContaRecebimento_fkey" FOREIGN KEY ("idContaRecebimento") REFERENCES "tb_ContasRecebimento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

