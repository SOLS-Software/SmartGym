-- A cara do TENANT (cores e logo) passa a ser control-plane.
--
-- O PROBLEMA
-- A identidade visual do cliente morava em tb_TemasCustomizados, tabela de
-- APLICACAO. Duas consequencias:
--
--   1. O painel do provedor nao pode configura-la. Ele so alcanca o banco
--      central por construcao (o schema dele declara so control-plane), entao
--      montar a cara de uma academia na entrega ficava fora do alcance — e
--      pararia de funcionar de vez para o cliente que tivesse banco dedicado,
--      justamente quem pagou por isso.
--   2. /auth/theme e uma rota PUBLICA que roda ANTES do login: ela resolve o
--      dominio no central e depois precisava ABRIR O BANCO DO TENANT so para
--      ler cinco cores. Com a marca aqui, vira uma consulta so.
--
-- O QUE ESTA MIGRACAO NAO FAZ
-- Nao apaga as linhas antigas de tb_TemasCustomizados. E um expand/contract: o
-- codigo passa a ler daqui, e a limpeza e uma migration separada, depois de a
-- versao nova estar rodando em producao. Apagar junto com o expand nao deixa
-- caminho de volta se algo se revelar errado no meio da semana.
--
-- O TEMA POR EMPRESA CONTINUA ONDE ESTA. tb_TemasCustomizados segue existindo
-- para o tema por UNIDADE (idEmpresa), que e dado da academia e vai para o
-- banco dela quando ela for siloada. So a parte por CLIENTE se mudou.
--
-- O LOGO NAO PRECISOU SER MOVIDO. O arquivo ja vive num bucket do PROVEDOR
-- (SUPABASE_STORAGE_BUCKET_CLIENTES e global, nao por tenant), entao basta
-- guardar o caminho. Aqui ele e TEXTO, e nao FK para tb_ClientesArquivos: uma
-- chave estrangeira daqui para uma tabela de aplicacao seria exatamente o
-- cruzamento que esta separacao existe para impedir.

CREATE TABLE "tb_ClientesMarcas" (
    "id" SERIAL NOT NULL,
    "idCliente" INTEGER NOT NULL,

    "corPrimaria" VARCHAR(7) NOT NULL DEFAULT '#000000',
    "corSecundaria" VARCHAR(7) NOT NULL DEFAULT '#FFFFFF',
    "corAcentuacao" VARCHAR(7) NOT NULL DEFAULT '#FF0000',
    "corTexto" VARCHAR(7) NOT NULL DEFAULT '#000000',
    "corFundo" VARCHAR(7) NOT NULL DEFAULT '#FFFFFF',
    "fontePrincipal" VARCHAR(100) NOT NULL DEFAULT 'Inter',
    "fonteSecundaria" VARCHAR(100) NOT NULL DEFAULT 'Open Sans',
    "tamanhoBase" INTEGER NOT NULL DEFAULT 14,
    "espacamentoPadrao" INTEGER NOT NULL DEFAULT 16,
    "raioCardBorder" INTEGER NOT NULL DEFAULT 8,
    "boModoEscuro" BOOLEAN NOT NULL DEFAULT false,

    -- Caminho no bucket de clientes. Nulo = sem logo.
    "anCaminhoLogo" VARCHAR(255),
    "anCaminhoFavicon" VARCHAR(255),

    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tb_ClientesMarcas_pkey" PRIMARY KEY ("id")
);

-- Uma marca por cliente. E 1-para-1 de verdade: nao ha "duas caras" possiveis.
CREATE UNIQUE INDEX "tb_ClientesMarcas_idCliente_key" ON "tb_ClientesMarcas"("idCliente");

ALTER TABLE "tb_ClientesMarcas"
    ADD CONSTRAINT "tb_ClientesMarcas_idCliente_fkey"
    FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- COPIA o que ja existe, resolvendo o caminho do logo pela tabela de arquivos.
--
-- COALESCE nas cores porque as colunas de origem sao NOT NULL com default, mas
-- um tema pode nunca ter sido salvo; e nos caminhos porque o tema aceita tanto
-- arquivo do cliente (tb_ClientesArquivos) quanto da empresa — aqui so o do
-- cliente faz sentido, e o da empresa fica para o tema por unidade.
INSERT INTO "tb_ClientesMarcas" (
    "idCliente", "corPrimaria", "corSecundaria", "corAcentuacao", "corTexto",
    "corFundo", "fontePrincipal", "fonteSecundaria", "tamanhoBase",
    "espacamentoPadrao", "raioCardBorder", "boModoEscuro",
    "anCaminhoLogo", "anCaminhoFavicon", "dtCadastro", "dtAlteracao"
)
SELECT
    t."idCliente",
    t."corPrimaria", t."corSecundaria", t."corAcentuacao", t."corTexto",
    t."corFundo", t."fontePrincipal", t."fonteSecundaria", t."tamanhoBase",
    t."espacamentoPadrao", t."raioCardBorder", t."boModoEscuro",
    NULLIF(logo."anCaminho", ''),
    NULLIF(favicon."anCaminho", ''),
    t."dtCadastro",
    CURRENT_TIMESTAMP
FROM "tb_TemasCustomizados" t
LEFT JOIN "tb_ClientesArquivos" logo ON logo."id" = t."idClienteArquivoLogo"
LEFT JOIN "tb_ClientesArquivos" favicon ON favicon."id" = t."idClienteArquivoFavicon"
WHERE t."idCliente" IS NOT NULL
ON CONFLICT ("idCliente") DO NOTHING;
