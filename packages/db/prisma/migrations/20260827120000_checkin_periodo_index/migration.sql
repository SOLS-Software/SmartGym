-- Indice de frequencia por periodo em tb_AlunoCheckIns.
--
-- Toda pergunta de relatorio sobre check-in e "nesta filial, entre estas duas
-- datas": movimento de hoje, serie de 12 semanas, serie de 6 meses. O indice
-- que existia cobria so `idEmpresa`, entao o recorte de periodo era resolvido
-- varrendo todas as linhas da filial — e esta e a tabela que mais cresce no
-- sistema (uma linha por pessoa por treino, para sempre).
--
-- ORDEM: igualdade antes de intervalo. O Postgres so aproveita a coluna de
-- intervalo depois de fixar as de igualdade; com `dtCadastro` na frente, o
-- corte por filial seria descartado.
--
-- O composto SUBSTITUI o indice de coluna unica: `(idEmpresa, dtCadastro)`
-- atende como prefixo tudo que `(idEmpresa)` atendia, inclusive a checagem da
-- chave estrangeira. Manter os dois cobraria escrita a cada check-in sem
-- devolver leitura.
--
-- Criado ANTES de derrubar o antigo para nao existir instante sem indice em
-- `idEmpresa`.
--
-- EM BASE GRANDE: `CREATE INDEX` sem CONCURRENTLY segura um SHARE lock, que
-- bloqueia INSERT ate terminar — ou seja, catraca sem registrar passagem. Em
-- producao com a tabela ja volumosa, rode a criacao a mao com
-- `CREATE INDEX CONCURRENTLY` (fora de transacao, o que esta migration nao
-- permite) numa janela de baixo movimento e so depois aplique o DROP.

-- CreateIndex
CREATE INDEX "tb_AlunoCheckIns_idEmpresa_dtCadastro_idx" ON "tb_AlunoCheckIns"("idEmpresa", "dtCadastro");

-- DropIndex
DROP INDEX "tb_AlunoCheckIns_idEmpresa_idx";
