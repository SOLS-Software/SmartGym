-- AlterTable
ALTER TABLE "tb_AlunoPlanos" ALTER COLUMN "dtAdmissao" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tb_Funcionarios" ALTER COLUMN "nrDDD" DROP NOT NULL,
ALTER COLUMN "nrDDD" DROP DEFAULT,
ALTER COLUMN "dtAdmissao" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tb_Pagamentos" ALTER COLUMN "dtPagamento" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tb_PromocaoPlanos" ALTER COLUMN "dtInicio" DROP NOT NULL;

-- AlterTable
ALTER TABLE "tb_Promocoes" ALTER COLUMN "dtInicio" DROP NOT NULL;

-- CreateTable
CREATE TABLE "tb_AtividadeAgendas" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "idAtividade" INTEGER,
    "idCategoria" INTEGER,
    "dtInicial" TIMESTAMP(3),
    "dtFinal" TIMESTAMP(3),
    "qtAlunos" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_AtividadeAgendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_AlunoAtividadeAgendas" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "idAtividadeAgenda" INTEGER,
    "idAluno" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_AlunoAtividadeAgendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_FuncionarioAtividadeAgendas" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "idAtividadeAgenda" INTEGER,
    "idFuncionario" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_FuncionarioAtividadeAgendas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_FuncionarioArquivos" (
    "id" SERIAL NOT NULL,
    "idFuncionario" INTEGER,
    "idTiposArquivos" INTEGER,
    "dsArquivo" VARCHAR(255) NOT NULL DEFAULT '',
    "anCaminho" VARCHAR(255) NOT NULL DEFAULT '',
    "cnChaveAcesso" INTEGER,
    "cnDistribuidor" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_FuncionarioArquivos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tb_AtividadeAgendas" ADD CONSTRAINT "tb_AtividadeAgendas_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AtividadeAgendas" ADD CONSTRAINT "tb_AtividadeAgendas_idAtividade_fkey" FOREIGN KEY ("idAtividade") REFERENCES "tb_Atividades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AtividadeAgendas" ADD CONSTRAINT "tb_AtividadeAgendas_idCategoria_fkey" FOREIGN KEY ("idCategoria") REFERENCES "tb_Categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoAtividadeAgendas" ADD CONSTRAINT "tb_AlunoAtividadeAgendas_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoAtividadeAgendas" ADD CONSTRAINT "tb_AlunoAtividadeAgendas_idAtividadeAgenda_fkey" FOREIGN KEY ("idAtividadeAgenda") REFERENCES "tb_AtividadeAgendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoAtividadeAgendas" ADD CONSTRAINT "tb_AlunoAtividadeAgendas_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_FuncionarioAtividadeAgendas" ADD CONSTRAINT "tb_FuncionarioAtividadeAgendas_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_FuncionarioAtividadeAgendas" ADD CONSTRAINT "tb_FuncionarioAtividadeAgendas_idAtividadeAgenda_fkey" FOREIGN KEY ("idAtividadeAgenda") REFERENCES "tb_AtividadeAgendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_FuncionarioAtividadeAgendas" ADD CONSTRAINT "tb_FuncionarioAtividadeAgendas_idFuncionario_fkey" FOREIGN KEY ("idFuncionario") REFERENCES "tb_Funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_FuncionarioArquivos" ADD CONSTRAINT "tb_FuncionarioArquivos_idFuncionario_fkey" FOREIGN KEY ("idFuncionario") REFERENCES "tb_Funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_FuncionarioArquivos" ADD CONSTRAINT "tb_FuncionarioArquivos_idTiposArquivos_fkey" FOREIGN KEY ("idTiposArquivos") REFERENCES "tb_TiposArquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoCheckIns" ADD CONSTRAINT "tb_AlunoCheckIns_idAtividadeAgenda_fkey" FOREIGN KEY ("idAtividadeAgenda") REFERENCES "tb_AtividadeAgendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
