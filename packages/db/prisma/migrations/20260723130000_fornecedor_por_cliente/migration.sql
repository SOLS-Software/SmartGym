-- Fornecedor passa a pertencer ao CLIENTE (rede), nao a uma filial: fica
-- disponivel para todas as empresas do cliente. A filial da compra continua
-- registrada em tb_ProdutoMovimentacoes.idEmpresa.

-- 1) Nova coluna + backfill a partir da empresa atual (empresa -> cliente).
ALTER TABLE "tb_Fornecedores" ADD COLUMN "idCliente" INTEGER;

UPDATE "tb_Fornecedores" f
SET "idCliente" = e."idCliente"
FROM "tb_Empresas" e
WHERE f."idEmpresa" = e."id";

-- 2) FK + indice do novo vinculo.
ALTER TABLE "tb_Fornecedores"
  ADD CONSTRAINT "tb_Fornecedores_idCliente_fkey"
  FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tb_Fornecedores_idCliente_idx" ON "tb_Fornecedores"("idCliente");

-- 3) Remove o vinculo antigo por filial.
ALTER TABLE "tb_Fornecedores" DROP CONSTRAINT "tb_Fornecedores_idEmpresa_fkey";
DROP INDEX "tb_Fornecedores_idEmpresa_idx";
ALTER TABLE "tb_Fornecedores" DROP COLUMN "idEmpresa";
