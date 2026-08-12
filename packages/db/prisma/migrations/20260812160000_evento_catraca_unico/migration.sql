-- Impede o mesmo acesso entrar duas vezes no historico.
--
-- O ciclo de coleta pede "access_logs com id maior que o ultimo que gravei". Se
-- dois comandos ficarem em voo ao mesmo tempo — polling rapido, reinicio da API
-- no meio de um lote, comando reenviado — os dois voltam com o MESMO lote e o
-- historico ganha copias. Aconteceu em campo: 189 linhas para ~73 acessos reais,
-- varios eventos triplicados. Frequencia do aluno e relatorio de acesso ficam
-- inflados, e nao ha como saber depois qual copia e a boa.
--
-- 1) Remove as duplicatas mantendo a linha de menor id (a primeira gravada).
DELETE FROM "tb_CatracaEventos" e
USING "tb_CatracaEventos" anterior
WHERE e."idEventoDispositivo" IS NOT NULL
  AND anterior."idEventoDispositivo" = e."idEventoDispositivo"
  AND anterior."idCatraca" = e."idCatraca"
  AND anterior."id" < e."id";

-- 2) Passa a recusar novas duplicatas no banco, nao so na aplicacao.
--    `idEventoDispositivo` NULL nao conflita (varios NULLs convivem num unique
--    do Postgres) — proposital: as decisoes tomadas pelo SmartGym no modo online
--    nao tem id de log do equipamento e podem coexistir livremente.
CREATE UNIQUE INDEX "tb_CatracaEventos_idCatraca_idEventoDispositivo_key"
  ON "tb_CatracaEventos"("idCatraca", "idEventoDispositivo");
