-- AlterTable
ALTER TABLE "tb_AlunoPlanos" ADD COLUMN     "dsMotivoCancelamento" VARCHAR(255),
ADD COLUMN     "idMotivoCancelamento" INTEGER;

-- CreateTable
CREATE TABLE "tb_MotivosCancelamento" (
    "id" SERIAL NOT NULL,
    "dsMotivoCancelamento" VARCHAR(255) NOT NULL DEFAULT '',
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_MotivosCancelamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_TreinoExecucoes" (
    "id" SERIAL NOT NULL,
    "idAlunoCheckIn" INTEGER NOT NULL,
    "idTreinoExercicio" INTEGER NOT NULL,
    "nrSeriesFeitas" INTEGER NOT NULL DEFAULT 0,
    "nrRepeticoes" INTEGER NOT NULL DEFAULT 0,
    "vlCarga" DECIMAL(8,2),
    "idUnidadeMedida" INTEGER,
    "boConcluido" BOOLEAN NOT NULL DEFAULT false,
    "dsObservacao" VARCHAR(255),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "idUsuarioCadastro" INTEGER,
    "idUsuarioAlteracao" INTEGER,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_TreinoExecucoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_TreinoExecucoes_idAlunoCheckIn_idx" ON "tb_TreinoExecucoes"("idAlunoCheckIn");

-- CreateIndex
CREATE INDEX "tb_TreinoExecucoes_idTreinoExercicio_idx" ON "tb_TreinoExecucoes"("idTreinoExercicio");

-- CreateIndex
CREATE UNIQUE INDEX "tb_TreinoExecucoes_idAlunoCheckIn_idTreinoExercicio_key" ON "tb_TreinoExecucoes"("idAlunoCheckIn", "idTreinoExercicio");

-- CreateIndex
CREATE INDEX "tb_AlunoPlanos_idMotivoCancelamento_idx" ON "tb_AlunoPlanos"("idMotivoCancelamento");

-- AddForeignKey
ALTER TABLE "tb_AlunoPlanos" ADD CONSTRAINT "tb_AlunoPlanos_idMotivoCancelamento_fkey" FOREIGN KEY ("idMotivoCancelamento") REFERENCES "tb_MotivosCancelamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_TreinoExecucoes" ADD CONSTRAINT "tb_TreinoExecucoes_idAlunoCheckIn_fkey" FOREIGN KEY ("idAlunoCheckIn") REFERENCES "tb_AlunoCheckIns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_TreinoExecucoes" ADD CONSTRAINT "tb_TreinoExecucoes_idTreinoExercicio_fkey" FOREIGN KEY ("idTreinoExercicio") REFERENCES "tb_TreinoExercicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_TreinoExecucoes" ADD CONSTRAINT "tb_TreinoExecucoes_idUnidadeMedida_fkey" FOREIGN KEY ("idUnidadeMedida") REFERENCES "tb_UnidadesMedidas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

