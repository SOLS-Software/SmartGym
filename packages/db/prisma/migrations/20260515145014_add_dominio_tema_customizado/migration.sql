-- CreateTable
CREATE TABLE "tb_DominiosCorporativos" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER NOT NULL,
    "urlDominio" VARCHAR(255) NOT NULL,
    "boSubdominio" INTEGER NOT NULL DEFAULT 1,
    "boAtivo" INTEGER NOT NULL DEFAULT 1,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tb_DominiosCorporativos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_TemasCustomizados" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER NOT NULL,
    "corPrimaria" VARCHAR(7) NOT NULL DEFAULT '#000000',
    "corSecundaria" VARCHAR(7) NOT NULL DEFAULT '#FFFFFF',
    "corAcentuacao" VARCHAR(7) NOT NULL DEFAULT '#FF0000',
    "corTexto" VARCHAR(7) NOT NULL DEFAULT '#000000',
    "corFundo" VARCHAR(7) NOT NULL DEFAULT '#FFFFFF',
    "fontePrincipal" VARCHAR(100) NOT NULL DEFAULT 'Roboto',
    "fonteSecundaria" VARCHAR(100) NOT NULL DEFAULT 'Open Sans',
    "tamanhoBase" INTEGER NOT NULL DEFAULT 14,
    "espacamentoPadrao" INTEGER NOT NULL DEFAULT 16,
    "raioCardBorder" INTEGER NOT NULL DEFAULT 8,
    "boModoEscuro" INTEGER NOT NULL DEFAULT 0,
    "idArquivoLogo" INTEGER,
    "idArquivoFavicon" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_TemasCustomizados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tb_DominiosCorporativos_urlDominio_key" ON "tb_DominiosCorporativos"("urlDominio");

-- CreateIndex
CREATE UNIQUE INDEX "tb_DominiosCorporativos_idEmpresa_urlDominio_key" ON "tb_DominiosCorporativos"("idEmpresa", "urlDominio");

-- CreateIndex
CREATE UNIQUE INDEX "tb_TemasCustomizados_idEmpresa_key" ON "tb_TemasCustomizados"("idEmpresa");

-- AddForeignKey
ALTER TABLE "tb_DominiosCorporativos" ADD CONSTRAINT "tb_DominiosCorporativos_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_TemasCustomizados" ADD CONSTRAINT "tb_TemasCustomizados_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_TemasCustomizados" ADD CONSTRAINT "tb_TemasCustomizados_idArquivoLogo_fkey" FOREIGN KEY ("idArquivoLogo") REFERENCES "tb_EmpresasArquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_TemasCustomizados" ADD CONSTRAINT "tb_TemasCustomizados_idArquivoFavicon_fkey" FOREIGN KEY ("idArquivoFavicon") REFERENCES "tb_EmpresasArquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
