-- QUEBRA DE VIDRO: registro de cada acesso da SOLS ao sistema de um cliente.
--
-- POR QUE ISTO EXISTE
-- Perante a academia, a SOLS e OPERADORA e nao controladora. Entrar no sistema
-- dela para implantar ou dar suporte nao pode ser navegacao livre: tem de ser
-- ato deliberado, com motivo, prazo e registro (LGPD art. 37/38). Esta tabela
-- E esse registro — e ela nasce junto com a funcionalidade, e nao depois, para
-- que nao exista um periodo em que o acesso acontece sem rastro.
--
-- COMO FUNCIONA
-- O painel do provedor emite um token de USO UNICO e prazo curto; a API do
-- SOLSFIT o troca por uma sessao com permissoes FIXAS de implantacao. Sao dois
-- prazos diferentes de proposito: o do token e para ser usado na hora (o link
-- nao e para guardar), e o da sessao acompanha o trabalho.
--
-- O TOKEN NAO E GUARDADO, so o hash — como senha. Um dump deste banco nao
-- entrega acesso a cliente nenhum.
--
-- O QUE A SESSAO ALCANCA: configuracao e equipe. NAO alcanca ficha de aluno,
-- avaliacao fisica, treino, check-in, pagamento de aluno nem fidelidade. A
-- lista e fixa no codigo (plugins/permissions.ts) e NAO depende de perfil
-- gravado no banco do cliente — assim ninguem amplia o acesso da SOLS editando
-- um perfil.

CREATE TABLE "tb_AcessosProvedor" (
    "id" SERIAL NOT NULL,
    "idOperadorSols" INTEGER NOT NULL,
    "idCliente" INTEGER NOT NULL,

    -- Obrigatorio: um registro sem motivo nao responde a pergunta que a trilha
    -- existe para responder.
    "dsMotivo" VARCHAR(200) NOT NULL,

    -- SHA-256 do token. O token claro so existe no link, uma vez.
    "caTokenHash" VARCHAR(64) NOT NULL,

    "dtCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtExpiracao" TIMESTAMP(3) NOT NULL,
    -- Preenchido = token queimado. E o que torna o uso UNICO.
    "dtUso" TIMESTAMP(3),
    "anIpUso" VARCHAR(64),

    CONSTRAINT "tb_AcessosProvedor_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tb_AcessosProvedor_caTokenHash_key" ON "tb_AcessosProvedor"("caTokenHash");
CREATE INDEX "tb_AcessosProvedor_idCliente_dtCriacao_idx" ON "tb_AcessosProvedor"("idCliente", "dtCriacao");
CREATE INDEX "tb_AcessosProvedor_idOperadorSols_dtCriacao_idx" ON "tb_AcessosProvedor"("idOperadorSols", "dtCriacao");

-- RESTRICT no operador: o historico de quem entrou onde nao pode desaparecer
-- porque alguem saiu da equipe. Para desligar um operador, use boInativo.
ALTER TABLE "tb_AcessosProvedor"
    ADD CONSTRAINT "tb_AcessosProvedor_idOperadorSols_fkey"
    FOREIGN KEY ("idOperadorSols") REFERENCES "tb_OperadoresSols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tb_AcessosProvedor"
    ADD CONSTRAINT "tb_AcessosProvedor_idCliente_fkey"
    FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
