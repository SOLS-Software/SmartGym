-- CPF passa a ser armazenado criptografado (AES-256-GCM, prefixo enc:v1:).
-- Lookups exatos e unicidade passam a usar caCPFHash (HMAC-SHA256).
-- O backfill dos dados existentes e feito por script da aplicacao
-- (packages/db/scripts/backfill-cpf-encryption.ts) apos esta migration.

-- AlterTable (Aluno)
ALTER TABLE "tb_Alunos" ALTER COLUMN "caCPF" TYPE VARCHAR(160);
ALTER TABLE "tb_Alunos" ADD COLUMN "caCPFHash" VARCHAR(64);

-- DropIndex (Aluno)
DROP INDEX "tb_Alunos_idCliente_caCPF_key";
DROP INDEX "tb_Alunos_caCPF_idx";

-- CreateIndex (Aluno)
CREATE UNIQUE INDEX "tb_Alunos_idCliente_caCPFHash_key" ON "tb_Alunos"("idCliente", "caCPFHash");
CREATE INDEX "tb_Alunos_caCPFHash_idx" ON "tb_Alunos"("caCPFHash");

-- AlterTable (Funcionario)
ALTER TABLE "tb_Funcionarios" ALTER COLUMN "caCPF" TYPE VARCHAR(160);
ALTER TABLE "tb_Funcionarios" ADD COLUMN "caCPFHash" VARCHAR(64);

-- DropIndex (Funcionario)
DROP INDEX "tb_Funcionarios_idEmpresa_caCPF_key";
DROP INDEX "tb_Funcionarios_caCPF_idx";

-- CreateIndex (Funcionario)
CREATE UNIQUE INDEX "tb_Funcionarios_idEmpresa_caCPFHash_key" ON "tb_Funcionarios"("idEmpresa", "caCPFHash");
CREATE INDEX "tb_Funcionarios_caCPFHash_idx" ON "tb_Funcionarios"("caCPFHash");
