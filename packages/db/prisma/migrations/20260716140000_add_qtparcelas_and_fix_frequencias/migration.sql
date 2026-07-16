-- AlunoPlano: number of installments the student pays the plan cycle in
ALTER TABLE "tb_AlunoPlanos" ADD COLUMN "qtParcelas" INTEGER NOT NULL DEFAULT 1;

-- Fix frequency cycle data (previously all stored as "1 Dia").
-- UnidadeTempo ids: Dia=3, Mes=5, Ano=6.
UPDATE "tb_Frequencias" SET "qtPeriodo" = 1, "idUnidadeTempo" = 5 WHERE lower("dsFrequencia") = 'mensal';
UPDATE "tb_Frequencias" SET "qtPeriodo" = 3, "idUnidadeTempo" = 5 WHERE lower("dsFrequencia") = 'trimestral';
UPDATE "tb_Frequencias" SET "qtPeriodo" = 6, "idUnidadeTempo" = 5 WHERE lower("dsFrequencia") = 'semestral';
UPDATE "tb_Frequencias" SET "qtPeriodo" = 7, "idUnidadeTempo" = 3 WHERE lower("dsFrequencia") = 'semanal';
UPDATE "tb_Frequencias" SET "qtPeriodo" = 1, "idUnidadeTempo" = 6 WHERE lower("dsFrequencia") = 'anual';
