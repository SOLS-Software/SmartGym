-- Produtos da SOLS: o que a empresa vende e o que cada cliente contratou.
--
-- O QUE FALTAVA
-- `tb_Clientes` nao tinha NENHUMA relacao com contrato, modulo ou limite. A
-- consequencia pratica: todo cliente recebe o sistema inteiro, e nao existe
-- resposta para "esta academia comprou catraca?" nem para "o que eu fature
-- deste cliente?". Sem este eixo nao ha cobranca — nao se fatura o que nao se
-- sabe que foi vendido.
--
-- POR QUE O SUFIXO "Sols"
-- `tb_Produtos` ja existe e e o que a ACADEMIA vende no balcao (suplemento,
-- camiseta) — tabela de aplicacao, que vai para o banco do cliente quando ele
-- for siloado. Usar a mesma palavra para as duas coisas deixaria toda conversa
-- ambigua. Mesmo racional do `tb_OperadoresSols`.
--
-- NAO E O PerfilAcesso
-- `tb_PerfisAcesso` responde "quem, dentro da academia, pode o que". Estas
-- tabelas respondem "o que esta academia comprou". Sao eixos diferentes e
-- independentes: um funcionario pode ter permissao de catraca no perfil e a
-- academia nao ter contratado catraca.
--
-- CONTROL-PLANE, e o motivo importa
-- Alem de ser dado da SOLS e nao da academia, o SmartGym precisa consultar os
-- direitos ANTES e INDEPENDENTE de abrir o banco de aplicacao do cliente. Se
-- estas tabelas morassem no banco dele, um cliente siloado teria acesso de
-- escrita aos proprios direitos.

CREATE TABLE "tb_ProdutosSols" (
    "id" SERIAL NOT NULL,
    -- CHAVE ESTAVEL: e o contrato entre os dois sistemas. O SmartGym pergunta
    -- "tem direito a 'catraca'?", nunca "qual produto assinou?". Assim
    -- renomear o produto comercial nao quebra o produto de software.
    "caCodigo" VARCHAR(40) NOT NULL,
    "dsProduto" VARCHAR(255) NOT NULL,
    "dsDescricao" VARCHAR(500),
    -- 'plano' | 'modulo' | 'limite' | 'servico'
    "cnTipo" VARCHAR(20) NOT NULL DEFAULT 'modulo',
    -- Preco de TABELA. O que o cliente paga fica no vinculo: desconto e caso a
    -- caso e nao pode reescrever o catalogo.
    "vlMensal" DECIMAL(12,4),
    -- Teto padrao quando cnTipo = 'limite'.
    "nrLimitePadrao" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_ProdutosSols_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tb_ProdutosSols_caCodigo_key" ON "tb_ProdutosSols"("caCodigo");

CREATE TABLE "tb_ClientesProdutos" (
    "id" SERIAL NOT NULL,
    "idCliente" INTEGER NOT NULL,
    "idProdutoSols" INTEGER NOT NULL,
    "dtInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- NULO = VIGENTE. Encerrar preenche dtFim; nunca se deleta a linha. E o que
    -- permite responder "o que valia em marco?" no dia em que um cliente
    -- questionar uma fatura.
    "dtFim" TIMESTAMP(3),
    -- Preco combinado com ESTE cliente. Nulo = usa o de tabela.
    "vlNegociado" DECIMAL(12,4),
    -- Teto deste cliente. E o que permite vender "ate 500 alunos" para um e
    -- "ate 300" para outro sem criar dois produtos no catalogo.
    "nrLimite" INTEGER,
    "dsObservacao" VARCHAR(500),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tb_ClientesProdutos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tb_ClientesProdutos_idCliente_idx" ON "tb_ClientesProdutos"("idCliente");
CREATE INDEX "tb_ClientesProdutos_idProdutoSols_idx" ON "tb_ClientesProdutos"("idProdutoSols");

-- UM VIGENTE POR VEZ, garantido pelo banco.
--
-- O mesmo produto pode aparecer varias vezes para o mesmo cliente: ele
-- contrata, cancela e recontrata, e cada periodo e uma linha do historico. Um
-- UNIQUE comum em (idCliente, idProdutoSols) proibiria isso.
--
-- O que NAO pode e haver dois vigentes simultaneos — seria cobrar duas vezes o
-- mesmo item, ou ficar sem saber qual teto vale. Um indice unico PARCIAL
-- resolve: a restricao so se aplica as linhas em aberto.
--
-- Fica no banco, e nao so na aplicacao, porque duas requisicoes simultaneas
-- passariam as duas por qualquer checagem feita em codigo antes de gravar.
CREATE UNIQUE INDEX "tb_ClientesProdutos_vigente_unico"
    ON "tb_ClientesProdutos"("idCliente", "idProdutoSols")
    WHERE "dtFim" IS NULL;

-- ON DELETE CASCADE no cliente: se o registro do cliente sair, o que ele
-- contratou sai com ele — sao linhas sem sentido proprio.
ALTER TABLE "tb_ClientesProdutos"
    ADD CONSTRAINT "tb_ClientesProdutos_idCliente_fkey"
    FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT no produto (padrao): um produto do catalogo que algum cliente ja
-- contratou nao pode simplesmente desaparecer e deixar o historico sem
-- referencia. Para tirar de venda, use boInativo.
ALTER TABLE "tb_ClientesProdutos"
    ADD CONSTRAINT "tb_ClientesProdutos_idProdutoSols_fkey"
    FOREIGN KEY ("idProdutoSols") REFERENCES "tb_ProdutosSols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
