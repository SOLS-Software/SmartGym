-- CreateTable
CREATE TABLE "tb_AlunoBiometriasFaciais" (
    "id" SERIAL NOT NULL,
    "idAluno" INTEGER NOT NULL,
    "idAlunoArquivo" INTEGER,
    "dsModelo" VARCHAR(100) NOT NULL,
    "dsProvider" VARCHAR(100) NOT NULL,
    "anEmbedding" JSONB NOT NULL,
    "nrDimensoes" INTEGER NOT NULL,
    "nrThreshold" DECIMAL(5,4) NOT NULL,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_AlunoBiometriasFaciais_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tb_AlunoBiometriasFaciais" ADD CONSTRAINT "tb_AlunoBiometriasFaciais_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoBiometriasFaciais" ADD CONSTRAINT "tb_AlunoBiometriasFaciais_idAlunoArquivo_fkey" FOREIGN KEY ("idAlunoArquivo") REFERENCES "tb_AlunoArquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
