-- AlterTable
ALTER TABLE "tb_Exercicios" ADD COLUMN     "dsInstrucao" TEXT;

-- CreateTable
CREATE TABLE "tb_AreasCorporais" (
    "id" SERIAL NOT NULL,
    "dsAreaCorporal" VARCHAR(100) NOT NULL,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_AreasCorporais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_ExercicioAreasCorporais" (
    "id" SERIAL NOT NULL,
    "idExercicio" INTEGER,
    "idAreaCorporal" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_ExercicioAreasCorporais_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tb_ExercicioAreasCorporais" ADD CONSTRAINT "tb_ExercicioAreasCorporais_idExercicio_fkey" FOREIGN KEY ("idExercicio") REFERENCES "tb_Exercicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ExercicioAreasCorporais" ADD CONSTRAINT "tb_ExercicioAreasCorporais_idAreaCorporal_fkey" FOREIGN KEY ("idAreaCorporal") REFERENCES "tb_AreasCorporais"("id") ON DELETE SET NULL ON UPDATE CASCADE;
