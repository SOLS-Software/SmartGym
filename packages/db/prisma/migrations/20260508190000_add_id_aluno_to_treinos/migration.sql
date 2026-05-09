ALTER TABLE "tb_Treinos"
ADD COLUMN IF NOT EXISTS "idAluno" INTEGER;

DO $$
BEGIN
  ALTER TABLE "tb_Treinos"
  ADD CONSTRAINT "tb_Treinos_idAluno_fkey"
  FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
