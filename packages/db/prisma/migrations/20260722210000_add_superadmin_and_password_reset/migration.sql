-- AlterTable
ALTER TABLE "tb_Usuarios" ADD COLUMN "boSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "tb_RecuperacoesSenha" (
    "id" SERIAL NOT NULL,
    "idUsuario" INTEGER NOT NULL,
    "dsTokenHash" VARCHAR(64) NOT NULL,
    "dtExpiracao" TIMESTAMP(3) NOT NULL,
    "dtUtilizacao" TIMESTAMP(3),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tb_RecuperacoesSenha_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_RecuperacoesSenha_dsTokenHash_idx" ON "tb_RecuperacoesSenha"("dsTokenHash");

-- CreateIndex
CREATE INDEX "tb_RecuperacoesSenha_idUsuario_idx" ON "tb_RecuperacoesSenha"("idUsuario");

-- AddForeignKey
ALTER TABLE "tb_RecuperacoesSenha" ADD CONSTRAINT "tb_RecuperacoesSenha_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "tb_Usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
