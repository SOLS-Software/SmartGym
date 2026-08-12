-- Modo online: a catraca pergunta ao SmartGym a cada identificacao e nos
-- respondemos liberado/negado conforme plano e pagamento do aluno.
--
-- Duas colunas novas em tb_CatracaEventos:
--
-- 1) "dsMotivo": por que o acesso foi negado, em pt-BR. O log do equipamento
--    diz apenas "acesso negado"; sem isso a academia nao consegue responder
--    "por que o aluno foi barrado na porta?".
--
-- 2) "boDecisaoOnline": separa a DECISAO que tomamos na hora do LOG que o
--    equipamento guardou e nos entrega depois pelo push. A mesma passagem gera
--    os dois registros, e sem essa marca eles pareceriam acessos duplicados no
--    relatorio de frequencia.
ALTER TABLE "tb_CatracaEventos" ADD COLUMN "dsMotivo" VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE "tb_CatracaEventos" ADD COLUMN "boDecisaoOnline" BOOLEAN NOT NULL DEFAULT false;
