-- Fix nrDDD column in tb_Funcionarios from VARCHAR to INTEGER
ALTER TABLE "tb_Funcionarios"
  ALTER COLUMN "nrDDD" TYPE INTEGER USING NULLIF(regexp_replace("nrDDD"::TEXT, '\D', '', 'g'), '')::INTEGER;
