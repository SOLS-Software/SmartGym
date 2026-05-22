-- CreateTable
CREATE TABLE "tb_UnidadesMedidas" (
    "id" SERIAL NOT NULL,
    "cnUnidade" VARCHAR(10) NOT NULL DEFAULT '',
    "dsUnidade" VARCHAR(50) NOT NULL DEFAULT '',
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_UnidadesMedidas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tb_UnidadesMedidas_cnUnidade_key" ON "tb_UnidadesMedidas"("cnUnidade");

-- AlterTable: add qtPeso and cnUnidadeMedida to training exercises
ALTER TABLE "tb_TreinoExercicios"
    ADD COLUMN "qtPeso" DECIMAL(8,2) NOT NULL DEFAULT 0,
    ADD COLUMN "cnUnidadeMedida" VARCHAR(10) NOT NULL DEFAULT '';

-- Seed default units of measure
INSERT INTO "tb_UnidadesMedidas" ("cnUnidade", "dsUnidade") VALUES
    ('KG', 'Quilograma'),
    ('G', 'Grama'),
    ('LBS', 'Libra'),
    ('OZ', 'Onça');
