-- AlterTable
ALTER TABLE "tb_AlunoEvolucoes" ADD COLUMN     "dsObservacao" VARCHAR(1000),
ADD COLUMN     "dtAvaliacao" DATE,
ADD COLUMN     "idAlunoArquivo" INTEGER,
ADD COLUMN     "vlCircBraco" DECIMAL(5,2),
ADD COLUMN     "vlCircCintura" DECIMAL(5,2),
ADD COLUMN     "vlCircCoxa" DECIMAL(5,2),
ADD COLUMN     "vlCircPeitoral" DECIMAL(5,2),
ADD COLUMN     "vlCircQuadril" DECIMAL(5,2),
ADD COLUMN     "vlMassaMagra" DECIMAL(5,2),
ADD COLUMN     "vlPercentualGordura" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "tb_Funcionarios" ADD COLUMN     "idPerfilAcesso" INTEGER;

-- CreateTable
CREATE TABLE "tb_PerfisAcesso" (
    "id" SERIAL NOT NULL,
    "idCliente" INTEGER NOT NULL,
    "dsPerfil" VARCHAR(100) NOT NULL DEFAULT '',
    "boPadrao" BOOLEAN NOT NULL DEFAULT false,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "idUsuarioCadastro" INTEGER,
    "idUsuarioAlteracao" INTEGER,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_PerfisAcesso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_PerfilAcessoPermissoes" (
    "id" SERIAL NOT NULL,
    "idPerfilAcesso" INTEGER NOT NULL,
    "cnPermissao" VARCHAR(60) NOT NULL,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tb_PerfilAcessoPermissoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_PerfisAcesso_idCliente_idx" ON "tb_PerfisAcesso"("idCliente");

-- CreateIndex
CREATE UNIQUE INDEX "tb_PerfisAcesso_idCliente_dsPerfil_key" ON "tb_PerfisAcesso"("idCliente", "dsPerfil");

-- CreateIndex
CREATE INDEX "tb_PerfilAcessoPermissoes_idPerfilAcesso_idx" ON "tb_PerfilAcessoPermissoes"("idPerfilAcesso");

-- CreateIndex
CREATE UNIQUE INDEX "tb_PerfilAcessoPermissoes_idPerfilAcesso_cnPermissao_key" ON "tb_PerfilAcessoPermissoes"("idPerfilAcesso", "cnPermissao");

-- CreateIndex
CREATE INDEX "tb_AlunoEvolucoes_idAlunoArquivo_idx" ON "tb_AlunoEvolucoes"("idAlunoArquivo");

-- CreateIndex
CREATE INDEX "tb_Funcionarios_idPerfilAcesso_idx" ON "tb_Funcionarios"("idPerfilAcesso");

-- AddForeignKey
ALTER TABLE "tb_Funcionarios" ADD CONSTRAINT "tb_Funcionarios_idPerfilAcesso_fkey" FOREIGN KEY ("idPerfilAcesso") REFERENCES "tb_PerfisAcesso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoEvolucoes" ADD CONSTRAINT "tb_AlunoEvolucoes_idAlunoArquivo_fkey" FOREIGN KEY ("idAlunoArquivo") REFERENCES "tb_AlunoArquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PerfisAcesso" ADD CONSTRAINT "tb_PerfisAcesso_idCliente_fkey" FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PerfilAcessoPermissoes" ADD CONSTRAINT "tb_PerfilAcessoPermissoes_idPerfilAcesso_fkey" FOREIGN KEY ("idPerfilAcesso") REFERENCES "tb_PerfisAcesso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

