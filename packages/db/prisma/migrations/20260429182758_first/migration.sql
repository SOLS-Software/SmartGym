-- CreateTable
CREATE TABLE "tb_Empresas" (
    "id" SERIAL NOT NULL,
    "dsEmpresa" VARCHAR(255) NOT NULL,
    "caCNPJ" VARCHAR(14) NOT NULL,
    "cnTemaTP" INTEGER NOT NULL DEFAULT 0,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_Planos" (
    "id" SERIAL NOT NULL,
    "dsPlano" VARCHAR(255) NOT NULL,
    "cnPlanoTP" INTEGER NOT NULL DEFAULT 0,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Planos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_Pontos" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "dsPontos" VARCHAR(255) NOT NULL,
    "qtPontos" INTEGER NOT NULL DEFAULT 0,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Pontos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_Atividades" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "dsAtividade" VARCHAR(255) NOT NULL,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Atividades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_Exercicios" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "dsExercicio" VARCHAR(255) NOT NULL,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Exercicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_Produtos" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "dsProduto" VARCHAR(255) NOT NULL,
    "qtEstoque" INTEGER NOT NULL DEFAULT 0,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_Treinos" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "dsTreino" VARCHAR(255) NOT NULL,
    "cnNivelTP" INTEGER NOT NULL DEFAULT 0,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Treinos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_Alunos" (
    "id" SERIAL NOT NULL,
    "nmAluno" VARCHAR(255) NOT NULL DEFAULT '',
    "caCPF" VARCHAR(11) NOT NULL DEFAULT '',
    "dtNascimento" DATE,
    "nrDDD" INTEGER NOT NULL DEFAULT 0,
    "nrContato" VARCHAR(9),
    "anEmail" VARCHAR(100) NOT NULL DEFAULT '',
    "anCEP" VARCHAR(100) NOT NULL DEFAULT '',
    "anLogradouro" VARCHAR(100) NOT NULL DEFAULT '',
    "nrEndereco" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Alunos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_Promocoes" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "dsPromocao" VARCHAR(255) NOT NULL DEFAULT '',
    "qtPeriodo" INTEGER NOT NULL DEFAULT 0,
    "cnPeriodoTP" INTEGER NOT NULL DEFAULT 0,
    "vlDesconto" DECIMAL(10,2) DEFAULT 0,
    "pcDesconto" DECIMAL(10,2) DEFAULT 0,
    "dtInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtEncerramento" TIMESTAMP(3),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Promocoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_PlanoAtividades" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "idPlano" INTEGER,
    "idAtividade" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_PlanoAtividades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_PlanoProdutos" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "idPlano" INTEGER,
    "idProduto" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_PlanoProdutos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_PlanoEmpresas" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "idPlano" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_PlanoEmpresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_PlanoValores" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "idPlano" INTEGER,
    "vlVenda" DECIMAL(10,2) DEFAULT 0,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_PlanoValores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_PromocaoPlanos" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "idPromocao" INTEGER,
    "idPlano" INTEGER,
    "qtDisponivel" INTEGER NOT NULL DEFAULT 0,
    "dtInicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtEncerramento" TIMESTAMP(3),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_PromocaoPlanos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_PromocaoProdutos" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "idPromocao" INTEGER,
    "idProduto" INTEGER,
    "qtDisponivel" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_PromocaoProdutos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_AlunoEvolucoes" (
    "id" SERIAL NOT NULL,
    "idAluno" INTEGER,
    "vlAltura" DECIMAL(3,2) DEFAULT 0,
    "vlPeso" DECIMAL(5,2) DEFAULT 0,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_AlunoEvolucoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_AlunoPlanos" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "idAluno" INTEGER,
    "idPlano" INTEGER,
    "idPromocaoPlano" INTEGER,
    "nrDiaPagamento" INTEGER NOT NULL DEFAULT 1,
    "dtAdmissao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_AlunoPlanos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_Pagamentos" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "idAlunoPlano" INTEGER,
    "idProdutoMovimentacao" INTEGER,
    "vlPagamento" DECIMAL(7,2),
    "cnPagamentoSTS" INTEGER NOT NULL DEFAULT 0,
    "dtPagamento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_TreinoExercicios" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "idTreino" INTEGER,
    "idExercicio" INTEGER,
    "nrOrdem" INTEGER NOT NULL DEFAULT 0,
    "nrSeries" INTEGER NOT NULL DEFAULT 0,
    "nrRepeticoes" INTEGER NOT NULL DEFAULT 0,
    "cnExercicioTP" INTEGER NOT NULL DEFAULT 0,
    "qtDescanso" INTEGER NOT NULL DEFAULT 0,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_TreinoExercicios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_AlunoTreinos" (
    "id" SERIAL NOT NULL,
    "idAluno" INTEGER,
    "idTreino" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_AlunoTreinos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_AlunosPontos" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "idPontos" INTEGER,
    "idAluno" INTEGER,
    "qtDisponivel" INTEGER NOT NULL DEFAULT 0,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_AlunosPontos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_ProdutoMovimentacoes" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "idProduto" INTEGER,
    "idAluno" INTEGER,
    "qtMovimentada" INTEGER NOT NULL DEFAULT 0,
    "vlUnitario" DECIMAL(10,2) DEFAULT 0,
    "qtDisponivel" INTEGER NOT NULL DEFAULT 0,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_ProdutoMovimentacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_EmpresasArquivos" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "anCaminho" VARCHAR(255) NOT NULL DEFAULT '',
    "cnChaveAcesso" INTEGER,
    "cnDistribuidor" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_EmpresasArquivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_AlunoArquivos" (
    "id" SERIAL NOT NULL,
    "idAluno" INTEGER,
    "anCaminho" VARCHAR(255) NOT NULL DEFAULT '',
    "cnChaveAcesso" INTEGER,
    "cnDistribuidor" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_AlunoArquivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_ExercicioArquivos" (
    "id" SERIAL NOT NULL,
    "idExercicio" INTEGER,
    "anCaminho" VARCHAR(255) NOT NULL DEFAULT '',
    "cnChaveAcesso" INTEGER,
    "cnDistribuidor" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_ExercicioArquivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_ProdutoArquivos" (
    "id" SERIAL NOT NULL,
    "idProduto" INTEGER,
    "anCaminho" VARCHAR(255) NOT NULL DEFAULT '',
    "cnChaveAcesso" INTEGER,
    "cnDistribuidor" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_ProdutoArquivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_PromocaoArquivos" (
    "id" SERIAL NOT NULL,
    "idPromocao" INTEGER,
    "anCaminho" VARCHAR(255) NOT NULL DEFAULT '',
    "cnChaveAcesso" INTEGER,
    "cnDistribuidor" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_PromocaoArquivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_AlunoCheckIns" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "idAlunoPlano" INTEGER,
    "idAlunoTreinosSequencia" INTEGER,
    "idPontos" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_AlunoCheckIns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_AlunoTreinosSequencias" (
    "id" SERIAL NOT NULL,
    "idAlunoTreino" INTEGER,
    "nrOrdem" INTEGER NOT NULL DEFAULT 0,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_AlunoTreinosSequencias_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tb_Pontos" ADD CONSTRAINT "tb_Pontos_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Atividades" ADD CONSTRAINT "tb_Atividades_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Exercicios" ADD CONSTRAINT "tb_Exercicios_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Produtos" ADD CONSTRAINT "tb_Produtos_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Treinos" ADD CONSTRAINT "tb_Treinos_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Promocoes" ADD CONSTRAINT "tb_Promocoes_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoAtividades" ADD CONSTRAINT "tb_PlanoAtividades_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoAtividades" ADD CONSTRAINT "tb_PlanoAtividades_idPlano_fkey" FOREIGN KEY ("idPlano") REFERENCES "tb_Planos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoAtividades" ADD CONSTRAINT "tb_PlanoAtividades_idAtividade_fkey" FOREIGN KEY ("idAtividade") REFERENCES "tb_Atividades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoProdutos" ADD CONSTRAINT "tb_PlanoProdutos_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoProdutos" ADD CONSTRAINT "tb_PlanoProdutos_idPlano_fkey" FOREIGN KEY ("idPlano") REFERENCES "tb_Planos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoProdutos" ADD CONSTRAINT "tb_PlanoProdutos_idProduto_fkey" FOREIGN KEY ("idProduto") REFERENCES "tb_Produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoEmpresas" ADD CONSTRAINT "tb_PlanoEmpresas_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoEmpresas" ADD CONSTRAINT "tb_PlanoEmpresas_idPlano_fkey" FOREIGN KEY ("idPlano") REFERENCES "tb_Planos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoValores" ADD CONSTRAINT "tb_PlanoValores_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoValores" ADD CONSTRAINT "tb_PlanoValores_idPlano_fkey" FOREIGN KEY ("idPlano") REFERENCES "tb_Planos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PromocaoPlanos" ADD CONSTRAINT "tb_PromocaoPlanos_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PromocaoPlanos" ADD CONSTRAINT "tb_PromocaoPlanos_idPromocao_fkey" FOREIGN KEY ("idPromocao") REFERENCES "tb_Promocoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PromocaoPlanos" ADD CONSTRAINT "tb_PromocaoPlanos_idPlano_fkey" FOREIGN KEY ("idPlano") REFERENCES "tb_Planos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PromocaoProdutos" ADD CONSTRAINT "tb_PromocaoProdutos_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PromocaoProdutos" ADD CONSTRAINT "tb_PromocaoProdutos_idPromocao_fkey" FOREIGN KEY ("idPromocao") REFERENCES "tb_Promocoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PromocaoProdutos" ADD CONSTRAINT "tb_PromocaoProdutos_idProduto_fkey" FOREIGN KEY ("idProduto") REFERENCES "tb_Produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoEvolucoes" ADD CONSTRAINT "tb_AlunoEvolucoes_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoPlanos" ADD CONSTRAINT "tb_AlunoPlanos_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoPlanos" ADD CONSTRAINT "tb_AlunoPlanos_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoPlanos" ADD CONSTRAINT "tb_AlunoPlanos_idPlano_fkey" FOREIGN KEY ("idPlano") REFERENCES "tb_Planos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoPlanos" ADD CONSTRAINT "tb_AlunoPlanos_idPromocaoPlano_fkey" FOREIGN KEY ("idPromocaoPlano") REFERENCES "tb_PromocaoPlanos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Pagamentos" ADD CONSTRAINT "tb_Pagamentos_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Pagamentos" ADD CONSTRAINT "tb_Pagamentos_idAlunoPlano_fkey" FOREIGN KEY ("idAlunoPlano") REFERENCES "tb_AlunoPlanos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Pagamentos" ADD CONSTRAINT "tb_Pagamentos_idProdutoMovimentacao_fkey" FOREIGN KEY ("idProdutoMovimentacao") REFERENCES "tb_ProdutoMovimentacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_TreinoExercicios" ADD CONSTRAINT "tb_TreinoExercicios_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_TreinoExercicios" ADD CONSTRAINT "tb_TreinoExercicios_idTreino_fkey" FOREIGN KEY ("idTreino") REFERENCES "tb_Treinos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_TreinoExercicios" ADD CONSTRAINT "tb_TreinoExercicios_idExercicio_fkey" FOREIGN KEY ("idExercicio") REFERENCES "tb_Exercicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoTreinos" ADD CONSTRAINT "tb_AlunoTreinos_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoTreinos" ADD CONSTRAINT "tb_AlunoTreinos_idTreino_fkey" FOREIGN KEY ("idTreino") REFERENCES "tb_Treinos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunosPontos" ADD CONSTRAINT "tb_AlunosPontos_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunosPontos" ADD CONSTRAINT "tb_AlunosPontos_idPontos_fkey" FOREIGN KEY ("idPontos") REFERENCES "tb_Pontos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunosPontos" ADD CONSTRAINT "tb_AlunosPontos_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ProdutoMovimentacoes" ADD CONSTRAINT "tb_ProdutoMovimentacoes_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ProdutoMovimentacoes" ADD CONSTRAINT "tb_ProdutoMovimentacoes_idProduto_fkey" FOREIGN KEY ("idProduto") REFERENCES "tb_Produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ProdutoMovimentacoes" ADD CONSTRAINT "tb_ProdutoMovimentacoes_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_EmpresasArquivos" ADD CONSTRAINT "tb_EmpresasArquivos_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoArquivos" ADD CONSTRAINT "tb_AlunoArquivos_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ExercicioArquivos" ADD CONSTRAINT "tb_ExercicioArquivos_idExercicio_fkey" FOREIGN KEY ("idExercicio") REFERENCES "tb_Exercicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ProdutoArquivos" ADD CONSTRAINT "tb_ProdutoArquivos_idProduto_fkey" FOREIGN KEY ("idProduto") REFERENCES "tb_Produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PromocaoArquivos" ADD CONSTRAINT "tb_PromocaoArquivos_idPromocao_fkey" FOREIGN KEY ("idPromocao") REFERENCES "tb_Promocoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoCheckIns" ADD CONSTRAINT "tb_AlunoCheckIns_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoCheckIns" ADD CONSTRAINT "tb_AlunoCheckIns_idAlunoPlano_fkey" FOREIGN KEY ("idAlunoPlano") REFERENCES "tb_AlunoPlanos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoCheckIns" ADD CONSTRAINT "tb_AlunoCheckIns_idAlunoTreinosSequencia_fkey" FOREIGN KEY ("idAlunoTreinosSequencia") REFERENCES "tb_AlunoTreinosSequencias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoCheckIns" ADD CONSTRAINT "tb_AlunoCheckIns_idPontos_fkey" FOREIGN KEY ("idPontos") REFERENCES "tb_Pontos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoTreinosSequencias" ADD CONSTRAINT "tb_AlunoTreinosSequencias_idAlunoTreino_fkey" FOREIGN KEY ("idAlunoTreino") REFERENCES "tb_AlunoTreinos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
