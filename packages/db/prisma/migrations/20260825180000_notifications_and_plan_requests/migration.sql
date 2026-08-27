-- CreateTable
CREATE TABLE "tb_Notificacoes" (
    "id" SERIAL NOT NULL,
    "idAluno" INTEGER NOT NULL,
    "cnTipo" VARCHAR(40) NOT NULL,
    "cnSeveridade" VARCHAR(20) NOT NULL DEFAULT 'info',
    "dsTitulo" VARCHAR(120) NOT NULL DEFAULT '',
    "dsMensagem" VARCHAR(500) NOT NULL DEFAULT '',
    "caChave" VARCHAR(120) NOT NULL,
    "dtLeitura" TIMESTAMP(3),
    "dtEnvioEmail" TIMESTAMP(3),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_Notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_SolicitacoesPlano" (
    "id" SERIAL NOT NULL,
    "idAlunoPlano" INTEGER NOT NULL,
    "cnTipo" VARCHAR(20) NOT NULL,
    "cnStatus" VARCHAR(20) NOT NULL DEFAULT 'pendente',
    "idMotivoCancelamento" INTEGER,
    "dsObservacao" VARCHAR(500),
    "dsResposta" VARCHAR(500),
    "idFuncionarioResolucao" INTEGER,
    "dtResolucao" TIMESTAMP(3),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "idUsuarioCadastro" INTEGER,
    "idUsuarioAlteracao" INTEGER,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_SolicitacoesPlano_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_Notificacoes_idAluno_idx" ON "tb_Notificacoes"("idAluno");

-- CreateIndex
CREATE INDEX "tb_Notificacoes_dtEnvioEmail_idx" ON "tb_Notificacoes"("dtEnvioEmail");

-- CreateIndex
CREATE UNIQUE INDEX "tb_Notificacoes_idAluno_caChave_key" ON "tb_Notificacoes"("idAluno", "caChave");

-- CreateIndex
CREATE INDEX "tb_SolicitacoesPlano_idAlunoPlano_idx" ON "tb_SolicitacoesPlano"("idAlunoPlano");

-- CreateIndex
CREATE INDEX "tb_SolicitacoesPlano_cnStatus_idx" ON "tb_SolicitacoesPlano"("cnStatus");

-- AddForeignKey
ALTER TABLE "tb_Notificacoes" ADD CONSTRAINT "tb_Notificacoes_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_SolicitacoesPlano" ADD CONSTRAINT "tb_SolicitacoesPlano_idAlunoPlano_fkey" FOREIGN KEY ("idAlunoPlano") REFERENCES "tb_AlunoPlanos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_SolicitacoesPlano" ADD CONSTRAINT "tb_SolicitacoesPlano_idMotivoCancelamento_fkey" FOREIGN KEY ("idMotivoCancelamento") REFERENCES "tb_MotivosCancelamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_SolicitacoesPlano" ADD CONSTRAINT "tb_SolicitacoesPlano_idFuncionarioResolucao_fkey" FOREIGN KEY ("idFuncionarioResolucao") REFERENCES "tb_Funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

