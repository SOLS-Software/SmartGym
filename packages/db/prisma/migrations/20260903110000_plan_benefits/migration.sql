-- Direitos que a matricula da: uma camiseta na assinatura, uma avaliacao por
-- mes, dois passes de convidado por ano.
--
-- tb_PlanoProdutos ja dizia QUAIS produtos vinham com o plano; faltava QUANTOS
-- e EM QUE JANELA, e sem isso ninguem sabia se o aluno ja tinha pegado. O uso
-- e append-only (como o extrato de pontos): cancelar uma entrega e inativar a
-- linha, nao apaga-la.

-- CreateTable
CREATE TABLE "tb_PlanoBeneficios" (
    "id" SERIAL NOT NULL,
    "idPlano" INTEGER NOT NULL,
    "idEmpresa" INTEGER,
    "cnTipo" VARCHAR(20) NOT NULL,
    "idProduto" INTEGER,
    "dsBeneficio" VARCHAR(255) NOT NULL DEFAULT '',
    "qtLimite" INTEGER NOT NULL DEFAULT 1,
    "cnJanela" VARCHAR(20) NOT NULL,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "idUsuarioCadastro" INTEGER,
    "idUsuarioAlteracao" INTEGER,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_PlanoBeneficios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_AlunoBeneficioUsos" (
    "id" SERIAL NOT NULL,
    "idPlanoBeneficio" INTEGER NOT NULL,
    "idAlunoPlano" INTEGER NOT NULL,
    "idAluno" INTEGER NOT NULL,
    "idEmpresa" INTEGER,
    "qtUsada" INTEGER NOT NULL DEFAULT 1,
    "idProdutoMovimentacao" INTEGER,
    "idAlunoEvolucao" INTEGER,
    "dsObservacao" VARCHAR(255),
    "dtUso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "idUsuarioCadastro" INTEGER,
    "idUsuarioAlteracao" INTEGER,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_AlunoBeneficioUsos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_PlanoBeneficios_idPlano_idx" ON "tb_PlanoBeneficios"("idPlano");

-- CreateIndex
CREATE INDEX "tb_PlanoBeneficios_idProduto_idx" ON "tb_PlanoBeneficios"("idProduto");

-- CreateIndex
CREATE INDEX "tb_AlunoBeneficioUsos_idAluno_idx" ON "tb_AlunoBeneficioUsos"("idAluno");

-- CreateIndex
CREATE INDEX "tb_AlunoBeneficioUsos_idAlunoPlano_idx" ON "tb_AlunoBeneficioUsos"("idAlunoPlano");

-- CreateIndex
CREATE INDEX "tb_AlunoBeneficioUsos_idPlanoBeneficio_idx" ON "tb_AlunoBeneficioUsos"("idPlanoBeneficio");

-- AddForeignKey
ALTER TABLE "tb_PlanoBeneficios" ADD CONSTRAINT "tb_PlanoBeneficios_idPlano_fkey" FOREIGN KEY ("idPlano") REFERENCES "tb_Planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoBeneficios" ADD CONSTRAINT "tb_PlanoBeneficios_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoBeneficios" ADD CONSTRAINT "tb_PlanoBeneficios_idProduto_fkey" FOREIGN KEY ("idProduto") REFERENCES "tb_Produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoBeneficioUsos" ADD CONSTRAINT "tb_AlunoBeneficioUsos_idPlanoBeneficio_fkey" FOREIGN KEY ("idPlanoBeneficio") REFERENCES "tb_PlanoBeneficios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoBeneficioUsos" ADD CONSTRAINT "tb_AlunoBeneficioUsos_idAlunoPlano_fkey" FOREIGN KEY ("idAlunoPlano") REFERENCES "tb_AlunoPlanos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoBeneficioUsos" ADD CONSTRAINT "tb_AlunoBeneficioUsos_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoBeneficioUsos" ADD CONSTRAINT "tb_AlunoBeneficioUsos_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoBeneficioUsos" ADD CONSTRAINT "tb_AlunoBeneficioUsos_idProdutoMovimentacao_fkey" FOREIGN KEY ("idProdutoMovimentacao") REFERENCES "tb_ProdutoMovimentacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoBeneficioUsos" ADD CONSTRAINT "tb_AlunoBeneficioUsos_idAlunoEvolucao_fkey" FOREIGN KEY ("idAlunoEvolucao") REFERENCES "tb_AlunoEvolucoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

