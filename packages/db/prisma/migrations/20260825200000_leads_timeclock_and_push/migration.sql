-- AlterTable
ALTER TABLE "tb_Clientes" ADD COLUMN     "nrDiasSemCheckIn" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "tb_Notificacoes" ADD COLUMN     "dtEnvioPush" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "tb_Leads" (
    "id" SERIAL NOT NULL,
    "idCliente" INTEGER NOT NULL,
    "idEmpresa" INTEGER,
    "idPlano" INTEGER,
    "nmLead" VARCHAR(255) NOT NULL DEFAULT '',
    "nrDDD" INTEGER,
    "nrContato" VARCHAR(9),
    "anEmail" VARCHAR(100) NOT NULL DEFAULT '',
    "dsMensagem" VARCHAR(500),
    "cnStatus" VARCHAR(20) NOT NULL DEFAULT 'novo',
    "caOrigem" VARCHAR(20) NOT NULL DEFAULT 'site',
    "dsObservacao" VARCHAR(500),
    "idAluno" INTEGER,
    "idFuncionario" INTEGER,
    "dtContato" TIMESTAMP(3),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_Leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_FuncionarioPontos" (
    "id" SERIAL NOT NULL,
    "idFuncionario" INTEGER NOT NULL,
    "idEmpresa" INTEGER,
    "cnTipo" VARCHAR(10) NOT NULL,
    "dtRegistro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "boManual" BOOLEAN NOT NULL DEFAULT false,
    "dsObservacao" VARCHAR(255),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "idUsuarioCadastro" INTEGER,
    "idUsuarioAlteracao" INTEGER,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_FuncionarioPontos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_UsuarioDispositivos" (
    "id" SERIAL NOT NULL,
    "idUsuario" INTEGER NOT NULL,
    "caTokenPush" VARCHAR(255) NOT NULL,
    "dsPlataforma" VARCHAR(20) NOT NULL DEFAULT '',
    "dtUltimoUso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_UsuarioDispositivos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_Leads_idCliente_cnStatus_idx" ON "tb_Leads"("idCliente", "cnStatus");

-- CreateIndex
CREATE INDEX "tb_Leads_idEmpresa_idx" ON "tb_Leads"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_FuncionarioPontos_idFuncionario_dtRegistro_idx" ON "tb_FuncionarioPontos"("idFuncionario", "dtRegistro");

-- CreateIndex
CREATE INDEX "tb_FuncionarioPontos_idEmpresa_idx" ON "tb_FuncionarioPontos"("idEmpresa");

-- CreateIndex
CREATE UNIQUE INDEX "tb_UsuarioDispositivos_caTokenPush_key" ON "tb_UsuarioDispositivos"("caTokenPush");

-- CreateIndex
CREATE INDEX "tb_UsuarioDispositivos_idUsuario_idx" ON "tb_UsuarioDispositivos"("idUsuario");

-- AddForeignKey
ALTER TABLE "tb_Leads" ADD CONSTRAINT "tb_Leads_idCliente_fkey" FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Leads" ADD CONSTRAINT "tb_Leads_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Leads" ADD CONSTRAINT "tb_Leads_idPlano_fkey" FOREIGN KEY ("idPlano") REFERENCES "tb_Planos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Leads" ADD CONSTRAINT "tb_Leads_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Leads" ADD CONSTRAINT "tb_Leads_idFuncionario_fkey" FOREIGN KEY ("idFuncionario") REFERENCES "tb_Funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_FuncionarioPontos" ADD CONSTRAINT "tb_FuncionarioPontos_idFuncionario_fkey" FOREIGN KEY ("idFuncionario") REFERENCES "tb_Funcionarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_FuncionarioPontos" ADD CONSTRAINT "tb_FuncionarioPontos_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_UsuarioDispositivos" ADD CONSTRAINT "tb_UsuarioDispositivos_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "tb_Usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

