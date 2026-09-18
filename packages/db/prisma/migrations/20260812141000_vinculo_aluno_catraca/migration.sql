-- Vinculo entre o usuario cadastrado NO EQUIPAMENTO e o aluno do SOLSFIT.
--
-- A catraca reporta o acesso com o `user_id` dela (ex.: 1000013). Ate aqui esse
-- numero era gravado cru em tb_CatracaEventos."nrUsuarioCatraca" e morria ali:
-- o sistema sabia que "alguem" entrou, nunca QUEM. Sem isso nao existe
-- relatorio de frequencia, check-in automatico nem bloqueio por plano vencido.

-- 1) Numero do usuario correspondente no equipamento.
ALTER TABLE "tb_Alunos" ADD COLUMN "nrUsuarioCatraca" INTEGER;

-- 2) Um mesmo numero nao pode apontar para dois alunos do MESMO cliente, senao
--    o acesso liberado fica ambiguo. NULL nao conflita (varios alunos podem
--    ainda nao ter usuario na catraca) e o unique e por cliente, entao redes
--    diferentes podem reusar a mesma numeracao de equipamento.
CREATE UNIQUE INDEX "tb_Alunos_idCliente_nrUsuarioCatraca_key"
  ON "tb_Alunos"("idCliente", "nrUsuarioCatraca");

-- 3) Aluno resolvido no evento, gravado no momento em que o push chega.
--    Nullable de proposito: acesso de funcionario, visitante, tentativa nao
--    identificada ou numero ainda sem vinculo continuam sendo registrados.
ALTER TABLE "tb_CatracaEventos" ADD COLUMN "idAluno" INTEGER;

CREATE INDEX "tb_CatracaEventos_idAluno_dtEvento_idx"
  ON "tb_CatracaEventos"("idAluno", "dtEvento");

ALTER TABLE "tb_CatracaEventos"
  ADD CONSTRAINT "tb_CatracaEventos_idAluno_fkey"
  FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
