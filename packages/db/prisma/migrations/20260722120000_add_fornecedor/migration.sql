-- CreateTable
CREATE TABLE "tb_Fornecedores" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "dsFornecedor" VARCHAR(255) NOT NULL,
    "caCNPJ" VARCHAR(14),
    "anCEP" VARCHAR(8),
    "anLogradouro" VARCHAR(150),
    "nrEndereco" VARCHAR(10),
    "anBairro" VARCHAR(100),
    "anCidade" VARCHAR(100),
    "anUF" VARCHAR(2),
    "nrDDD" INTEGER,
    "nrContato" VARCHAR(11),
    "dsEmail" VARCHAR(255),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "idUsuarioCadastro" INTEGER,
    "idUsuarioAlteracao" INTEGER,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_Fornecedores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_Fornecedores_idEmpresa_idx" ON "tb_Fornecedores"("idEmpresa");

-- AddForeignKey
ALTER TABLE "tb_Fornecedores" ADD CONSTRAINT "tb_Fornecedores_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: link stock movements to a supplier (purchases)
ALTER TABLE "tb_ProdutoMovimentacoes" ADD COLUMN "idFornecedor" INTEGER;

-- CreateIndex
CREATE INDEX "tb_ProdutoMovimentacoes_idFornecedor_idx" ON "tb_ProdutoMovimentacoes"("idFornecedor");

-- AddForeignKey
ALTER TABLE "tb_ProdutoMovimentacoes" ADD CONSTRAINT "tb_ProdutoMovimentacoes_idFornecedor_fkey" FOREIGN KEY ("idFornecedor") REFERENCES "tb_Fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
