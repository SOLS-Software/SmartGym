-- Quantas entradas o plano permite por periodo ("3x por semana").
--
-- Campo PROPRIO porque o tb_Frequencias do plano e outra coisa: e o ciclo de
-- cobranca (Mensal, Trimestral), usado para gerar parcelas. "Semanal" esta la
-- como qtPeriodo 7 / unidade Dia(s) — ler aquilo como limite de acesso
-- acusaria todo mensalista de ter estourado a cota na primeira visita.
--
-- Nulo = sem limite, que e o estado de todo plano ja cadastrado.
ALTER TABLE "tb_Planos" ADD COLUMN "qtAcessosPeriodo" INTEGER;
ALTER TABLE "tb_Planos" ADD COLUMN "cnPeriodoAcesso" VARCHAR(10);
