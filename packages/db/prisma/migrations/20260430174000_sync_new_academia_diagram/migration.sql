CREATE TABLE "tb_Cargos" (
    "id" SERIAL NOT NULL,
    "dsCargo" VARCHAR(255) NOT NULL DEFAULT '',
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tb_Cargos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tb_Temas" (
    "id" SERIAL NOT NULL,
    "dsTema" VARCHAR(255) NOT NULL DEFAULT '',
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tb_Temas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tb_Frequencias" (
    "id" SERIAL NOT NULL,
    "dsFrequencia" VARCHAR(255) NOT NULL DEFAULT '',
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tb_Frequencias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tb_Niveis" (
    "id" SERIAL NOT NULL,
    "dsNivel" VARCHAR(255) NOT NULL DEFAULT '',
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tb_Niveis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tb_UnidadesTempo" (
    "id" SERIAL NOT NULL,
    "dsUnidadeTempo" VARCHAR(255) NOT NULL DEFAULT '',
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tb_UnidadesTempo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tb_StatusPagamento" (
    "id" SERIAL NOT NULL,
    "dsStatusPagamento" VARCHAR(255) NOT NULL DEFAULT '',
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tb_StatusPagamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tb_FormasPagamento" (
    "id" SERIAL NOT NULL,
    "dsFormaPagamento" VARCHAR(255) NOT NULL DEFAULT '',
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tb_FormasPagamento_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tb_MetodosTreino" (
    "id" SERIAL NOT NULL,
    "nmMetodoTreino" VARCHAR(255) NOT NULL DEFAULT '',
    "dsMetodoTreino" VARCHAR(255) NOT NULL DEFAULT '',
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tb_MetodosTreino_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tb_TiposArquivos" (
    "id" SERIAL NOT NULL,
    "dsTipo" VARCHAR(255) NOT NULL DEFAULT '',
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tb_TiposArquivos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tb_Alunos" ADD COLUMN "anBairro" VARCHAR(100) NOT NULL DEFAULT '';
ALTER TABLE "tb_Alunos" ADD COLUMN "anCoplemento" VARCHAR(100) NOT NULL DEFAULT '';

ALTER TABLE "tb_Empresas" DROP COLUMN "cnTemaTP";
ALTER TABLE "tb_Empresas" ADD COLUMN "idTema" INTEGER;

ALTER TABLE "tb_Funcionarios" DROP COLUMN "cnCargoTP";
ALTER TABLE "tb_Funcionarios" ADD COLUMN "idCargo" INTEGER;

ALTER TABLE "tb_Pagamentos" DROP COLUMN "cnPagamentoSTS";
ALTER TABLE "tb_Pagamentos" ADD COLUMN "idFormaPagamento" INTEGER;
ALTER TABLE "tb_Pagamentos" ADD COLUMN "idStatusPagamento" INTEGER;

ALTER TABLE "tb_Planos" DROP COLUMN "cnPlanoTP";
ALTER TABLE "tb_Planos" ADD COLUMN "idFrequencia" INTEGER;

ALTER TABLE "tb_Promocoes" DROP COLUMN "cnPeriodoTP";
ALTER TABLE "tb_Promocoes" ADD COLUMN "idUnidadeTempo" INTEGER;

ALTER TABLE "tb_TreinoExercicios" DROP COLUMN "cnExercicioTP";
ALTER TABLE "tb_TreinoExercicios" ADD COLUMN "idMetodoTreino" INTEGER;

ALTER TABLE "tb_Treinos" DROP COLUMN "cnNivelTP";
ALTER TABLE "tb_Treinos" ADD COLUMN "idNivel" INTEGER;

ALTER TABLE "tb_AlunoEvolucoes" ADD COLUMN "idFuncionario" INTEGER;
ALTER TABLE "tb_AlunoEvolucoes" ALTER COLUMN "vlAltura" TYPE DECIMAL(5,2);

ALTER TABLE "tb_EmpresasArquivos" ADD COLUMN "idTiposArquivos" INTEGER;
ALTER TABLE "tb_EmpresasArquivos" ADD COLUMN "dsArquivo" VARCHAR(255) NOT NULL DEFAULT '';

ALTER TABLE "tb_AlunoArquivos" ADD COLUMN "idTiposArquivos" INTEGER;
ALTER TABLE "tb_AlunoArquivos" ADD COLUMN "dsArquivo" VARCHAR(255) NOT NULL DEFAULT '';

ALTER TABLE "tb_ExercicioArquivos" ADD COLUMN "idTiposArquivos" INTEGER;
ALTER TABLE "tb_ExercicioArquivos" ADD COLUMN "dsArquivo" VARCHAR(255) NOT NULL DEFAULT '';

ALTER TABLE "tb_ProdutoArquivos" ADD COLUMN "idTiposArquivos" INTEGER;
ALTER TABLE "tb_ProdutoArquivos" ADD COLUMN "dsArquivo" VARCHAR(255) NOT NULL DEFAULT '';

ALTER TABLE "tb_PromocaoArquivos" ADD COLUMN "idTiposArquivos" INTEGER;
ALTER TABLE "tb_PromocaoArquivos" ADD COLUMN "dsArquivo" VARCHAR(255) NOT NULL DEFAULT '';

ALTER TABLE "tb_Empresas" ADD CONSTRAINT "tb_Empresas_idTema_fkey" FOREIGN KEY ("idTema") REFERENCES "tb_Temas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tb_Funcionarios" ADD CONSTRAINT "tb_Funcionarios_idCargo_fkey" FOREIGN KEY ("idCargo") REFERENCES "tb_Cargos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tb_Planos" ADD CONSTRAINT "tb_Planos_idFrequencia_fkey" FOREIGN KEY ("idFrequencia") REFERENCES "tb_Frequencias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tb_Treinos" ADD CONSTRAINT "tb_Treinos_idNivel_fkey" FOREIGN KEY ("idNivel") REFERENCES "tb_Niveis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tb_Promocoes" ADD CONSTRAINT "tb_Promocoes_idUnidadeTempo_fkey" FOREIGN KEY ("idUnidadeTempo") REFERENCES "tb_UnidadesTempo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tb_AlunoEvolucoes" ADD CONSTRAINT "tb_AlunoEvolucoes_idFuncionario_fkey" FOREIGN KEY ("idFuncionario") REFERENCES "tb_Funcionarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tb_Pagamentos" ADD CONSTRAINT "tb_Pagamentos_idStatusPagamento_fkey" FOREIGN KEY ("idStatusPagamento") REFERENCES "tb_StatusPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tb_Pagamentos" ADD CONSTRAINT "tb_Pagamentos_idFormaPagamento_fkey" FOREIGN KEY ("idFormaPagamento") REFERENCES "tb_FormasPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tb_TreinoExercicios" ADD CONSTRAINT "tb_TreinoExercicios_idMetodoTreino_fkey" FOREIGN KEY ("idMetodoTreino") REFERENCES "tb_MetodosTreino"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tb_EmpresasArquivos" ADD CONSTRAINT "tb_EmpresasArquivos_idTiposArquivos_fkey" FOREIGN KEY ("idTiposArquivos") REFERENCES "tb_TiposArquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tb_AlunoArquivos" ADD CONSTRAINT "tb_AlunoArquivos_idTiposArquivos_fkey" FOREIGN KEY ("idTiposArquivos") REFERENCES "tb_TiposArquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tb_ExercicioArquivos" ADD CONSTRAINT "tb_ExercicioArquivos_idTiposArquivos_fkey" FOREIGN KEY ("idTiposArquivos") REFERENCES "tb_TiposArquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tb_ProdutoArquivos" ADD CONSTRAINT "tb_ProdutoArquivos_idTiposArquivos_fkey" FOREIGN KEY ("idTiposArquivos") REFERENCES "tb_TiposArquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tb_PromocaoArquivos" ADD CONSTRAINT "tb_PromocaoArquivos_idTiposArquivos_fkey" FOREIGN KEY ("idTiposArquivos") REFERENCES "tb_TiposArquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
