-- DropForeignKey
ALTER TABLE "tb_AlunoPontuacoes" DROP CONSTRAINT "tb_AlunoPontuacoes_idPontuacao_fkey";

-- AlterTable
ALTER TABLE "tb_AlunoPontuacoes" ADD COLUMN     "dsHistorico" VARCHAR(255),
ADD COLUMN     "idAlunoCheckIn" INTEGER,
ADD COLUMN     "idProdutoMovimentacao" INTEGER,
ADD COLUMN     "qtPontos" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "idPontuacao" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tb_Pontuacoes" ADD COLUMN     "boPadrao" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Produtos" ADD COLUMN     "qtPontosResgate" INTEGER,
ADD COLUMN     "vlVenda" DECIMAL(12,4);

-- CreateIndex
CREATE UNIQUE INDEX "tb_AlunoPontuacoes_idAlunoCheckIn_key" ON "tb_AlunoPontuacoes"("idAlunoCheckIn");

-- CreateIndex
CREATE INDEX "tb_AlunoPontuacoes_idProdutoMovimentacao_idx" ON "tb_AlunoPontuacoes"("idProdutoMovimentacao");

-- AddForeignKey
ALTER TABLE "tb_AlunoPontuacoes" ADD CONSTRAINT "tb_AlunoPontuacoes_idPontuacao_fkey" FOREIGN KEY ("idPontuacao") REFERENCES "tb_Pontuacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoPontuacoes" ADD CONSTRAINT "tb_AlunoPontuacoes_idAlunoCheckIn_fkey" FOREIGN KEY ("idAlunoCheckIn") REFERENCES "tb_AlunoCheckIns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoPontuacoes" ADD CONSTRAINT "tb_AlunoPontuacoes_idProdutoMovimentacao_fkey" FOREIGN KEY ("idProdutoMovimentacao") REFERENCES "tb_ProdutoMovimentacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

