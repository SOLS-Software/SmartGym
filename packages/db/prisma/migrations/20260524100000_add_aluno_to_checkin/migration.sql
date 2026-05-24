-- AlterTable: add idAluno to AlunoCheckIn for direct student reference in agenda check-ins
ALTER TABLE "tb_AlunoCheckIns"
    ADD COLUMN "idAluno" INTEGER;

-- AddForeignKey
ALTER TABLE "tb_AlunoCheckIns" ADD CONSTRAINT "tb_AlunoCheckIns_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "tb_AlunoCheckIns_idAluno_idAtividadeAgenda_idx" ON "tb_AlunoCheckIns"("idAluno", "idAtividadeAgenda");
