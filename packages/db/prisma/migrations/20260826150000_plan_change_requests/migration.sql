-- DropForeignKey
ALTER TABLE "tb_SolicitacoesPlano" DROP CONSTRAINT "tb_SolicitacoesPlano_idAlunoPlano_fkey";

-- AlterTable
ALTER TABLE "tb_SolicitacoesPlano" ADD COLUMN     "idAluno" INTEGER,
ADD COLUMN     "idPlanoDesejado" INTEGER,
ALTER COLUMN "idAlunoPlano" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "tb_SolicitacoesPlano_idAluno_idx" ON "tb_SolicitacoesPlano"("idAluno");

-- AddForeignKey
ALTER TABLE "tb_SolicitacoesPlano" ADD CONSTRAINT "tb_SolicitacoesPlano_idAlunoPlano_fkey" FOREIGN KEY ("idAlunoPlano") REFERENCES "tb_AlunoPlanos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_SolicitacoesPlano" ADD CONSTRAINT "tb_SolicitacoesPlano_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_SolicitacoesPlano" ADD CONSTRAINT "tb_SolicitacoesPlano_idPlanoDesejado_fkey" FOREIGN KEY ("idPlanoDesejado") REFERENCES "tb_Planos"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: as solicitacoes que ja existem nasceram sempre a partir de uma
-- matricula, entao o aluno delas e o dono daquele plano. Sem isto a coluna
-- nasceria nula no historico e nao daria para confiar nela em nenhuma consulta
-- ("de quem e este pedido?" teria duas respostas dependendo da data).
UPDATE "tb_SolicitacoesPlano" s
SET "idAluno" = p."idAluno"
FROM "tb_AlunoPlanos" p
WHERE s."idAlunoPlano" = p."id" AND s."idAluno" IS NULL;
