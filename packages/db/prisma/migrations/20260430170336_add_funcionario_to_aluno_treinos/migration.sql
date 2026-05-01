-- AlterTable
ALTER TABLE "tb_AlunoTreinos" ADD COLUMN     "idFuncionario" INTEGER;

-- AddForeignKey
ALTER TABLE "tb_AlunoTreinos" ADD CONSTRAINT "tb_AlunoTreinos_idFuncionario_fkey" FOREIGN KEY ("idFuncionario") REFERENCES "tb_Funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
