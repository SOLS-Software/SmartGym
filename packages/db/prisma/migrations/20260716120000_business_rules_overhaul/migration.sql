-- DropForeignKey
ALTER TABLE "tb_AlunoArquivos" DROP CONSTRAINT "tb_AlunoArquivos_idAluno_fkey";

-- DropForeignKey
ALTER TABLE "tb_AlunoAtividadeAgendas" DROP CONSTRAINT "tb_AlunoAtividadeAgendas_idAluno_fkey";

-- DropForeignKey
ALTER TABLE "tb_AlunoAtividadeAgendas" DROP CONSTRAINT "tb_AlunoAtividadeAgendas_idAtividadeAgenda_fkey";

-- DropForeignKey
ALTER TABLE "tb_AlunoAtividadeAgendas" DROP CONSTRAINT "tb_AlunoAtividadeAgendas_idEmpresa_fkey";

-- DropForeignKey
ALTER TABLE "tb_AlunoCheckIns" DROP CONSTRAINT "tb_AlunoCheckIns_idAluno_fkey";

-- DropForeignKey
ALTER TABLE "tb_AlunoCheckIns" DROP CONSTRAINT "tb_AlunoCheckIns_idEmpresa_fkey";

-- DropForeignKey
ALTER TABLE "tb_AlunoCheckIns" DROP CONSTRAINT "tb_AlunoCheckIns_idPontos_fkey";

-- DropForeignKey
ALTER TABLE "tb_AlunoEvolucoes" DROP CONSTRAINT "tb_AlunoEvolucoes_idAluno_fkey";

-- DropForeignKey
ALTER TABLE "tb_AlunoPlanos" DROP CONSTRAINT "tb_AlunoPlanos_idAluno_fkey";

-- DropForeignKey
ALTER TABLE "tb_AlunoPlanos" DROP CONSTRAINT "tb_AlunoPlanos_idEmpresa_fkey";

-- DropForeignKey
ALTER TABLE "tb_AlunoPlanos" DROP CONSTRAINT "tb_AlunoPlanos_idPlano_fkey";

-- DropForeignKey
ALTER TABLE "tb_AlunoTreinos" DROP CONSTRAINT "tb_AlunoTreinos_idAluno_fkey";

-- DropForeignKey
ALTER TABLE "tb_AlunoTreinos" DROP CONSTRAINT "tb_AlunoTreinos_idTreino_fkey";

-- DropForeignKey
ALTER TABLE "tb_AlunoTreinosSequencias" DROP CONSTRAINT "tb_AlunoTreinosSequencias_idAlunoTreino_fkey";

-- DropForeignKey
ALTER TABLE "tb_AlunosPontos" DROP CONSTRAINT "tb_AlunosPontos_idAluno_fkey";

-- DropForeignKey
ALTER TABLE "tb_AlunosPontos" DROP CONSTRAINT "tb_AlunosPontos_idEmpresa_fkey";

-- DropForeignKey
ALTER TABLE "tb_AlunosPontos" DROP CONSTRAINT "tb_AlunosPontos_idPontos_fkey";

-- DropForeignKey
ALTER TABLE "tb_AtividadeAgendas" DROP CONSTRAINT "tb_AtividadeAgendas_idAtividade_fkey";

-- DropForeignKey
ALTER TABLE "tb_AtividadeAgendas" DROP CONSTRAINT "tb_AtividadeAgendas_idEmpresa_fkey";

-- DropForeignKey
ALTER TABLE "tb_CatracaEventos" DROP CONSTRAINT "tb_CatracaEventos_idCatraca_fkey";

-- DropForeignKey
ALTER TABLE "tb_ClientesArquivos" DROP CONSTRAINT "tb_ClientesArquivos_idCliente_fkey";

-- DropForeignKey
ALTER TABLE "tb_Empresas" DROP CONSTRAINT "tb_Empresas_idCliente_fkey";

-- DropForeignKey
ALTER TABLE "tb_EmpresasArquivos" DROP CONSTRAINT "tb_EmpresasArquivos_idEmpresa_fkey";

-- DropForeignKey
ALTER TABLE "tb_EquipamentoManutencoes" DROP CONSTRAINT "tb_EquipamentoManutencoes_idEquipamento_fkey";

-- DropForeignKey
ALTER TABLE "tb_ExercicioAreasCorporais" DROP CONSTRAINT "tb_ExercicioAreasCorporais_idAreaCorporal_fkey";

-- DropForeignKey
ALTER TABLE "tb_ExercicioAreasCorporais" DROP CONSTRAINT "tb_ExercicioAreasCorporais_idExercicio_fkey";

-- DropForeignKey
ALTER TABLE "tb_ExercicioArquivos" DROP CONSTRAINT "tb_ExercicioArquivos_idExercicio_fkey";

-- DropForeignKey
ALTER TABLE "tb_ExercicioEquipamentos" DROP CONSTRAINT "tb_ExercicioEquipamentos_idEquipamento_fkey";

-- DropForeignKey
ALTER TABLE "tb_ExercicioEquipamentos" DROP CONSTRAINT "tb_ExercicioEquipamentos_idExericio_fkey";

-- DropForeignKey
ALTER TABLE "tb_FuncionarioArquivos" DROP CONSTRAINT "tb_FuncionarioArquivos_idFuncionario_fkey";

-- DropForeignKey
ALTER TABLE "tb_FuncionarioAtividadeAgendas" DROP CONSTRAINT "tb_FuncionarioAtividadeAgendas_idAtividadeAgenda_fkey";

-- DropForeignKey
ALTER TABLE "tb_FuncionarioAtividadeAgendas" DROP CONSTRAINT "tb_FuncionarioAtividadeAgendas_idEmpresa_fkey";

-- DropForeignKey
ALTER TABLE "tb_FuncionarioAtividadeAgendas" DROP CONSTRAINT "tb_FuncionarioAtividadeAgendas_idFuncionario_fkey";

-- DropForeignKey
ALTER TABLE "tb_Pagamentos" DROP CONSTRAINT "tb_Pagamentos_idEmpresa_fkey";

-- DropForeignKey
ALTER TABLE "tb_Pagamentos" DROP CONSTRAINT "tb_Pagamentos_idStatusPagamento_fkey";

-- DropForeignKey
ALTER TABLE "tb_PlanoAtividades" DROP CONSTRAINT "tb_PlanoAtividades_idAtividade_fkey";

-- DropForeignKey
ALTER TABLE "tb_PlanoAtividades" DROP CONSTRAINT "tb_PlanoAtividades_idPlano_fkey";

-- DropForeignKey
ALTER TABLE "tb_PlanoEmpresas" DROP CONSTRAINT "tb_PlanoEmpresas_idEmpresa_fkey";

-- DropForeignKey
ALTER TABLE "tb_PlanoEmpresas" DROP CONSTRAINT "tb_PlanoEmpresas_idPlano_fkey";

-- DropForeignKey
ALTER TABLE "tb_PlanoProdutos" DROP CONSTRAINT "tb_PlanoProdutos_idPlano_fkey";

-- DropForeignKey
ALTER TABLE "tb_PlanoProdutos" DROP CONSTRAINT "tb_PlanoProdutos_idProduto_fkey";

-- DropForeignKey
ALTER TABLE "tb_PlanoValores" DROP CONSTRAINT "tb_PlanoValores_idPlano_fkey";

-- DropForeignKey
ALTER TABLE "tb_Pontos" DROP CONSTRAINT "tb_Pontos_idEmpresa_fkey";

-- DropForeignKey
ALTER TABLE "tb_ProdutoArquivos" DROP CONSTRAINT "tb_ProdutoArquivos_idProduto_fkey";

-- DropForeignKey
ALTER TABLE "tb_ProdutoMovimentacoes" DROP CONSTRAINT "tb_ProdutoMovimentacoes_idEmpresa_fkey";

-- DropForeignKey
ALTER TABLE "tb_ProdutoMovimentacoes" DROP CONSTRAINT "tb_ProdutoMovimentacoes_idProduto_fkey";

-- DropForeignKey
ALTER TABLE "tb_PromocaoArquivos" DROP CONSTRAINT "tb_PromocaoArquivos_idPromocao_fkey";

-- DropForeignKey
ALTER TABLE "tb_PromocaoPlanos" DROP CONSTRAINT "tb_PromocaoPlanos_idPlano_fkey";

-- DropForeignKey
ALTER TABLE "tb_PromocaoPlanos" DROP CONSTRAINT "tb_PromocaoPlanos_idPromocao_fkey";

-- DropForeignKey
ALTER TABLE "tb_PromocaoProdutos" DROP CONSTRAINT "tb_PromocaoProdutos_idProduto_fkey";

-- DropForeignKey
ALTER TABLE "tb_PromocaoProdutos" DROP CONSTRAINT "tb_PromocaoProdutos_idPromocao_fkey";

-- DropForeignKey
ALTER TABLE "tb_Senhas" DROP CONSTRAINT "tb_Senhas_idUsuario_fkey";

-- DropForeignKey
ALTER TABLE "tb_TreinoExercicios" DROP CONSTRAINT "tb_TreinoExercicios_idExercicio_fkey";

-- DropForeignKey
ALTER TABLE "tb_TreinoExercicios" DROP CONSTRAINT "tb_TreinoExercicios_idTreino_fkey";

-- DropIndex
DROP INDEX "tb_CatracaEventos_idAluno_dtEvento_idx";

-- AlterTable
ALTER TABLE "tb_AlunoArquivos" ALTER COLUMN "idAluno" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_AlunoAtividadeAgendas" ALTER COLUMN "idEmpresa" SET NOT NULL,
ALTER COLUMN "idAtividadeAgenda" SET NOT NULL,
ALTER COLUMN "idAluno" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_AlunoBiometriasFaciais" ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_AlunoCheckIns" DROP COLUMN "idPontos",
ADD COLUMN     "idPontuacao" INTEGER,
ADD COLUMN     "idTipoCheckIn" INTEGER,
ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "idEmpresa" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false,
ALTER COLUMN "idAluno" SET NOT NULL;

-- AlterTable
ALTER TABLE "tb_AlunoEvolucoes" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "idAluno" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_AlunoPlanos" DROP COLUMN "idEmpresa",
ADD COLUMN     "dtEncerramento" TIMESTAMP(3),
ADD COLUMN     "dtVencimento" TIMESTAMP(3),
ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "idAluno" SET NOT NULL,
ALTER COLUMN "idPlano" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_AlunoTreinos" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "idAluno" SET NOT NULL,
ALTER COLUMN "idTreino" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_AlunoTreinosSequencias" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "idAlunoTreino" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Alunos" RENAME COLUMN "anCoplemento" TO "anComplemento";
ALTER TABLE "tb_Alunos"
ADD COLUMN     "idCliente" INTEGER,
ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "anCEP" SET DATA TYPE VARCHAR(8),
ALTER COLUMN "anLogradouro" SET DATA TYPE VARCHAR(150),
ALTER COLUMN "nrEndereco" SET DATA TYPE VARCHAR(10),
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_AreasCorporais" ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_AtividadeAgendas" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "idEmpresa" SET NOT NULL,
ALTER COLUMN "idAtividade" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Atividades" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Cargos" ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Categorias" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_CatracaEventos" DROP COLUMN "idAluno",
ALTER COLUMN "idCatraca" SET NOT NULL,
ALTER COLUMN "boAcessoLiberado" DROP DEFAULT,
ALTER COLUMN "boAcessoLiberado" TYPE BOOLEAN USING ("boAcessoLiberado" <> 0),
ALTER COLUMN "boAcessoLiberado" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Catracas" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Clientes" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_ClientesArquivos" ALTER COLUMN "idCliente" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_DominiosCorporativos" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "boSubdominio" DROP DEFAULT,
ALTER COLUMN "boSubdominio" TYPE BOOLEAN USING ("boSubdominio" <> 0),
ALTER COLUMN "boSubdominio" SET DEFAULT true,
ALTER COLUMN "boAtivo" DROP DEFAULT,
ALTER COLUMN "boAtivo" TYPE BOOLEAN USING ("boAtivo" <> 0),
ALTER COLUMN "boAtivo" SET DEFAULT true;

-- AlterTable
ALTER TABLE "tb_Empresas" ADD COLUMN     "anBairro" VARCHAR(100),
ADD COLUMN     "anCEP" VARCHAR(8),
ADD COLUMN     "anCidade" VARCHAR(100),
ADD COLUMN     "anLogradouro" VARCHAR(150),
ADD COLUMN     "anUF" VARCHAR(2),
ADD COLUMN     "geoEmpresa" geometry(Point, 4326),
ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ADD COLUMN     "nrContato" VARCHAR(11),
ADD COLUMN     "nrDDD" INTEGER,
ADD COLUMN     "nrEndereco" VARCHAR(10),
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false,
ALTER COLUMN "idCliente" SET NOT NULL;

-- AlterTable
ALTER TABLE "tb_EmpresasArquivos" ALTER COLUMN "idEmpresa" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_EquipamentoArquivos" ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_EquipamentoManutencoes" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "idEquipamento" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Equipamentos" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Esportes" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_ExercicioAreasCorporais" ALTER COLUMN "idExercicio" SET NOT NULL,
ALTER COLUMN "idAreaCorporal" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_ExercicioArquivos" ALTER COLUMN "idExercicio" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_ExercicioEquipamentos" DROP COLUMN "idExericio",
ADD COLUMN     "idExercicio" INTEGER NOT NULL,
ALTER COLUMN "idEquipamento" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Exercicios" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_FormasPagamento" ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Frequencias" ADD COLUMN     "idUnidadeTempo" INTEGER,
ADD COLUMN     "qtPeriodo" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_FuncionarioArquivos" ALTER COLUMN "idFuncionario" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_FuncionarioAtividadeAgendas" ALTER COLUMN "idEmpresa" SET NOT NULL,
ALTER COLUMN "idAtividadeAgenda" SET NOT NULL,
ALTER COLUMN "idFuncionario" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Funcionarios" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "nrContato" DROP NOT NULL,
ALTER COLUMN "nrContato" DROP DEFAULT,
ALTER COLUMN "nrContato" SET DATA TYPE VARCHAR(9),
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Localidades" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "idEmpresa" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_MetodosTreino" ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Niveis" ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Pagamentos" RENAME COLUMN "vlPagamento" TO "vlPago";
ALTER TABLE "tb_Pagamentos" ALTER COLUMN "vlPago" SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "tb_Pagamentos"
ADD COLUMN     "dtCompetencia" DATE,
ADD COLUMN     "dtVencimento" TIMESTAMP(3),
ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ADD COLUMN     "vlPrevisto" DECIMAL(12,4) NOT NULL DEFAULT 0,
ALTER COLUMN "idEmpresa" SET NOT NULL,
ALTER COLUMN "dtPagamento" DROP DEFAULT,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false,
ALTER COLUMN "idStatusPagamento" SET NOT NULL;

-- AlterTable
ALTER TABLE "tb_PlanoAtividades" ALTER COLUMN "idPlano" SET NOT NULL,
ALTER COLUMN "idAtividade" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_PlanoEmpresas" ALTER COLUMN "idEmpresa" SET NOT NULL,
ALTER COLUMN "idPlano" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_PlanoProdutos" ALTER COLUMN "idPlano" SET NOT NULL,
ALTER COLUMN "idProduto" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_PlanoValores" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "idPlano" SET NOT NULL,
ALTER COLUMN "vlVenda" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Planos" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_ProdutoArquivos" ALTER COLUMN "idProduto" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_ProdutoMovimentacoes" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "idEmpresa" SET NOT NULL,
ALTER COLUMN "idProduto" SET NOT NULL,
ALTER COLUMN "vlUnitario" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Produtos" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_PromocaoArquivos" ALTER COLUMN "idPromocao" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_PromocaoPlanos" ALTER COLUMN "idPromocao" SET NOT NULL,
ALTER COLUMN "idPlano" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_PromocaoProdutos" ALTER COLUMN "idPromocao" SET NOT NULL,
ALTER COLUMN "idProduto" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Promocoes" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "vlDesconto" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "pcDesconto" SET DATA TYPE DECIMAL(12,4),
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Senhas" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "idUsuario" SET NOT NULL,
ALTER COLUMN "boTrocaObrigatoria" DROP DEFAULT,
ALTER COLUMN "boTrocaObrigatoria" TYPE BOOLEAN USING ("boTrocaObrigatoria" <> 0),
ALTER COLUMN "boTrocaObrigatoria" SET DEFAULT false,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_StatusPagamento" ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Temas" ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_TemasCustomizados" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "boModoEscuro" DROP DEFAULT,
ALTER COLUMN "boModoEscuro" TYPE BOOLEAN USING ("boModoEscuro" <> 0),
ALTER COLUMN "boModoEscuro" SET DEFAULT false,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_TiposArquivos" ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_TreinoExercicios" DROP COLUMN "cnUnidadeMedida",
ADD COLUMN     "idUnidadeMedida" INTEGER,
ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "idTreino" SET NOT NULL,
ALTER COLUMN "idExercicio" SET NOT NULL,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Treinos" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_UnidadesMedidas" ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_UnidadesTempo" ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- AlterTable
ALTER TABLE "tb_Usuarios" ADD COLUMN     "idUsuarioAlteracao" INTEGER,
ADD COLUMN     "idUsuarioCadastro" INTEGER,
ALTER COLUMN "boInativo" DROP DEFAULT,
ALTER COLUMN "boInativo" TYPE BOOLEAN USING ("boInativo" <> 0),
ALTER COLUMN "boInativo" SET DEFAULT false;

-- DropTable
DROP TABLE "tb_AlunosPontos";

-- DropTable
DROP TABLE "tb_Pontos";

-- CreateTable
CREATE TABLE "tb_Pontuacoes" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER NOT NULL,
    "dsPontuacao" VARCHAR(255) NOT NULL,
    "qtPontos" INTEGER NOT NULL DEFAULT 0,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "idUsuarioCadastro" INTEGER,
    "idUsuarioAlteracao" INTEGER,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_Pontuacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_AlunoPontuacoes" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER NOT NULL,
    "idPontuacao" INTEGER NOT NULL,
    "idAluno" INTEGER NOT NULL,
    "qtDisponivel" INTEGER NOT NULL DEFAULT 0,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "idUsuarioCadastro" INTEGER,
    "idUsuarioAlteracao" INTEGER,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_AlunoPontuacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tb_TiposCheckIn" (
    "id" SERIAL NOT NULL,
    "dsTipoCheckIn" VARCHAR(255) NOT NULL DEFAULT '',
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_TiposCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_Pontuacoes_idEmpresa_idx" ON "tb_Pontuacoes"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_AlunoPontuacoes_idEmpresa_idx" ON "tb_AlunoPontuacoes"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_AlunoPontuacoes_idPontuacao_idx" ON "tb_AlunoPontuacoes"("idPontuacao");

-- CreateIndex
CREATE INDEX "tb_AlunoPontuacoes_idAluno_idx" ON "tb_AlunoPontuacoes"("idAluno");

-- CreateIndex
CREATE INDEX "tb_AlunoArquivos_idAluno_idx" ON "tb_AlunoArquivos"("idAluno");

-- CreateIndex
CREATE INDEX "tb_AlunoAtividadeAgendas_idEmpresa_idx" ON "tb_AlunoAtividadeAgendas"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_AlunoAtividadeAgendas_idAtividadeAgenda_idx" ON "tb_AlunoAtividadeAgendas"("idAtividadeAgenda");

-- CreateIndex
CREATE INDEX "tb_AlunoAtividadeAgendas_idAluno_idx" ON "tb_AlunoAtividadeAgendas"("idAluno");

-- CreateIndex
CREATE INDEX "tb_AlunoBiometriasFaciais_idAluno_idx" ON "tb_AlunoBiometriasFaciais"("idAluno");

-- CreateIndex
CREATE INDEX "tb_AlunoBiometriasFaciais_idAlunoArquivo_idx" ON "tb_AlunoBiometriasFaciais"("idAlunoArquivo");

-- CreateIndex
CREATE INDEX "tb_AlunoCheckIns_idEmpresa_idx" ON "tb_AlunoCheckIns"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_AlunoCheckIns_idAlunoPlano_idx" ON "tb_AlunoCheckIns"("idAlunoPlano");

-- CreateIndex
CREATE INDEX "tb_AlunoCheckIns_idAlunoTreinosSequencia_idx" ON "tb_AlunoCheckIns"("idAlunoTreinosSequencia");

-- CreateIndex
CREATE INDEX "tb_AlunoCheckIns_idAtividadeAgenda_idx" ON "tb_AlunoCheckIns"("idAtividadeAgenda");

-- CreateIndex
CREATE INDEX "tb_AlunoCheckIns_idPontuacao_idx" ON "tb_AlunoCheckIns"("idPontuacao");

-- CreateIndex
CREATE INDEX "tb_AlunoEvolucoes_idAluno_idx" ON "tb_AlunoEvolucoes"("idAluno");

-- CreateIndex
CREATE INDEX "tb_AlunoEvolucoes_idFuncionario_idx" ON "tb_AlunoEvolucoes"("idFuncionario");

-- CreateIndex
CREATE INDEX "tb_AlunoPlanos_idAluno_idx" ON "tb_AlunoPlanos"("idAluno");

-- CreateIndex
CREATE INDEX "tb_AlunoPlanos_idPlano_idx" ON "tb_AlunoPlanos"("idPlano");

-- CreateIndex
CREATE INDEX "tb_AlunoPlanos_idPromocaoPlano_idx" ON "tb_AlunoPlanos"("idPromocaoPlano");

-- CreateIndex
CREATE INDEX "tb_AlunoTreinos_idAluno_idx" ON "tb_AlunoTreinos"("idAluno");

-- CreateIndex
CREATE INDEX "tb_AlunoTreinos_idFuncionario_idx" ON "tb_AlunoTreinos"("idFuncionario");

-- CreateIndex
CREATE INDEX "tb_AlunoTreinos_idTreino_idx" ON "tb_AlunoTreinos"("idTreino");

-- CreateIndex
CREATE INDEX "tb_AlunoTreinosSequencias_idAlunoTreino_idx" ON "tb_AlunoTreinosSequencias"("idAlunoTreino");

-- CreateIndex
CREATE UNIQUE INDEX "tb_Alunos_idCliente_caCPF_key" ON "tb_Alunos"("idCliente", "caCPF");

-- CreateIndex
CREATE INDEX "tb_AtividadeAgendas_idEmpresa_idx" ON "tb_AtividadeAgendas"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_AtividadeAgendas_idAtividade_idx" ON "tb_AtividadeAgendas"("idAtividade");

-- CreateIndex
CREATE INDEX "tb_AtividadeAgendas_idCategoria_idx" ON "tb_AtividadeAgendas"("idCategoria");

-- CreateIndex
CREATE INDEX "tb_AtividadeAgendas_idLocalidade_idx" ON "tb_AtividadeAgendas"("idLocalidade");

-- CreateIndex
CREATE INDEX "tb_Atividades_idEmpresa_idx" ON "tb_Atividades"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_Atividades_idEsporte_idx" ON "tb_Atividades"("idEsporte");

-- CreateIndex
CREATE INDEX "tb_Categorias_idEmpresa_idx" ON "tb_Categorias"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_Categorias_idEsporte_idx" ON "tb_Categorias"("idEsporte");

-- CreateIndex
CREATE INDEX "tb_Catracas_idEmpresa_idx" ON "tb_Catracas"("idEmpresa");

-- CreateIndex
CREATE UNIQUE INDEX "tb_Clientes_caCNPJ_key" ON "tb_Clientes"("caCNPJ");

-- CreateIndex
CREATE INDEX "tb_ClientesArquivos_idCliente_idx" ON "tb_ClientesArquivos"("idCliente");

-- CreateIndex
CREATE UNIQUE INDEX "tb_Empresas_caCNPJ_key" ON "tb_Empresas"("caCNPJ");

-- CreateIndex
CREATE INDEX "geo_empresa" ON "tb_Empresas" USING GIST ("geoEmpresa");

-- CreateIndex
CREATE INDEX "tb_Empresas_idCliente_idx" ON "tb_Empresas"("idCliente");

-- CreateIndex
CREATE INDEX "tb_EmpresasArquivos_idEmpresa_idx" ON "tb_EmpresasArquivos"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_EquipamentoArquivos_idEquipamento_idx" ON "tb_EquipamentoArquivos"("idEquipamento");

-- CreateIndex
CREATE INDEX "tb_EquipamentoManutencoes_idEquipamento_idx" ON "tb_EquipamentoManutencoes"("idEquipamento");

-- CreateIndex
CREATE INDEX "tb_Esportes_idEmpresa_idx" ON "tb_Esportes"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_ExercicioAreasCorporais_idExercicio_idx" ON "tb_ExercicioAreasCorporais"("idExercicio");

-- CreateIndex
CREATE INDEX "tb_ExercicioAreasCorporais_idAreaCorporal_idx" ON "tb_ExercicioAreasCorporais"("idAreaCorporal");

-- CreateIndex
CREATE INDEX "tb_ExercicioArquivos_idExercicio_idx" ON "tb_ExercicioArquivos"("idExercicio");

-- CreateIndex
CREATE INDEX "tb_ExercicioEquipamentos_idExercicio_idx" ON "tb_ExercicioEquipamentos"("idExercicio");

-- CreateIndex
CREATE INDEX "tb_ExercicioEquipamentos_idEquipamento_idx" ON "tb_ExercicioEquipamentos"("idEquipamento");

-- CreateIndex
CREATE INDEX "tb_Exercicios_idEmpresa_idx" ON "tb_Exercicios"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_FuncionarioArquivos_idFuncionario_idx" ON "tb_FuncionarioArquivos"("idFuncionario");

-- CreateIndex
CREATE INDEX "tb_FuncionarioAtividadeAgendas_idEmpresa_idx" ON "tb_FuncionarioAtividadeAgendas"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_FuncionarioAtividadeAgendas_idAtividadeAgenda_idx" ON "tb_FuncionarioAtividadeAgendas"("idAtividadeAgenda");

-- CreateIndex
CREATE INDEX "tb_FuncionarioAtividadeAgendas_idFuncionario_idx" ON "tb_FuncionarioAtividadeAgendas"("idFuncionario");

-- CreateIndex
CREATE UNIQUE INDEX "tb_Funcionarios_idEmpresa_caCPF_key" ON "tb_Funcionarios"("idEmpresa", "caCPF");

-- CreateIndex
CREATE INDEX "tb_Localidades_idEmpresa_idx" ON "tb_Localidades"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_Pagamentos_idAlunoPlano_idx" ON "tb_Pagamentos"("idAlunoPlano");

-- CreateIndex
CREATE INDEX "tb_Pagamentos_idStatusPagamento_dtVencimento_idx" ON "tb_Pagamentos"("idStatusPagamento", "dtVencimento");

-- CreateIndex
CREATE INDEX "tb_Pagamentos_idEmpresa_idx" ON "tb_Pagamentos"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_Pagamentos_idProdutoMovimentacao_idx" ON "tb_Pagamentos"("idProdutoMovimentacao");

-- CreateIndex
CREATE INDEX "tb_PlanoAtividades_idEmpresa_idx" ON "tb_PlanoAtividades"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_PlanoAtividades_idPlano_idx" ON "tb_PlanoAtividades"("idPlano");

-- CreateIndex
CREATE INDEX "tb_PlanoAtividades_idAtividade_idx" ON "tb_PlanoAtividades"("idAtividade");

-- CreateIndex
CREATE INDEX "tb_PlanoEmpresas_idEmpresa_idx" ON "tb_PlanoEmpresas"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_PlanoEmpresas_idPlano_idx" ON "tb_PlanoEmpresas"("idPlano");

-- CreateIndex
CREATE INDEX "tb_PlanoProdutos_idEmpresa_idx" ON "tb_PlanoProdutos"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_PlanoProdutos_idPlano_idx" ON "tb_PlanoProdutos"("idPlano");

-- CreateIndex
CREATE INDEX "tb_PlanoProdutos_idProduto_idx" ON "tb_PlanoProdutos"("idProduto");

-- CreateIndex
CREATE INDEX "tb_PlanoValores_idEmpresa_idx" ON "tb_PlanoValores"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_PlanoValores_idPlano_idx" ON "tb_PlanoValores"("idPlano");

-- CreateIndex
CREATE INDEX "tb_ProdutoArquivos_idProduto_idx" ON "tb_ProdutoArquivos"("idProduto");

-- CreateIndex
CREATE INDEX "tb_ProdutoMovimentacoes_idEmpresa_idx" ON "tb_ProdutoMovimentacoes"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_ProdutoMovimentacoes_idProduto_idx" ON "tb_ProdutoMovimentacoes"("idProduto");

-- CreateIndex
CREATE INDEX "tb_ProdutoMovimentacoes_idAluno_idx" ON "tb_ProdutoMovimentacoes"("idAluno");

-- CreateIndex
CREATE INDEX "tb_Produtos_idEmpresa_idx" ON "tb_Produtos"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_PromocaoArquivos_idPromocao_idx" ON "tb_PromocaoArquivos"("idPromocao");

-- CreateIndex
CREATE INDEX "tb_PromocaoPlanos_idEmpresa_idx" ON "tb_PromocaoPlanos"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_PromocaoPlanos_idPromocao_idx" ON "tb_PromocaoPlanos"("idPromocao");

-- CreateIndex
CREATE INDEX "tb_PromocaoPlanos_idPlano_idx" ON "tb_PromocaoPlanos"("idPlano");

-- CreateIndex
CREATE INDEX "tb_PromocaoProdutos_idEmpresa_idx" ON "tb_PromocaoProdutos"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_PromocaoProdutos_idPromocao_idx" ON "tb_PromocaoProdutos"("idPromocao");

-- CreateIndex
CREATE INDEX "tb_PromocaoProdutos_idProduto_idx" ON "tb_PromocaoProdutos"("idProduto");

-- CreateIndex
CREATE INDEX "tb_Promocoes_idEmpresa_idx" ON "tb_Promocoes"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_Senhas_idUsuario_idx" ON "tb_Senhas"("idUsuario");

-- CreateIndex
CREATE INDEX "tb_TemasCustomizados_idArquivoLogo_idx" ON "tb_TemasCustomizados"("idArquivoLogo");

-- CreateIndex
CREATE INDEX "tb_TemasCustomizados_idArquivoFavicon_idx" ON "tb_TemasCustomizados"("idArquivoFavicon");

-- CreateIndex
CREATE INDEX "tb_TemasCustomizados_idClienteArquivoLogo_idx" ON "tb_TemasCustomizados"("idClienteArquivoLogo");

-- CreateIndex
CREATE INDEX "tb_TemasCustomizados_idClienteArquivoFavicon_idx" ON "tb_TemasCustomizados"("idClienteArquivoFavicon");

-- CreateIndex
CREATE INDEX "tb_TreinoExercicios_idEmpresa_idx" ON "tb_TreinoExercicios"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_TreinoExercicios_idTreino_idx" ON "tb_TreinoExercicios"("idTreino");

-- CreateIndex
CREATE INDEX "tb_TreinoExercicios_idExercicio_idx" ON "tb_TreinoExercicios"("idExercicio");

-- CreateIndex
CREATE INDEX "tb_Treinos_idEmpresa_idx" ON "tb_Treinos"("idEmpresa");

-- CreateIndex
CREATE INDEX "tb_Treinos_idAluno_idx" ON "tb_Treinos"("idAluno");

-- CreateIndex
CREATE UNIQUE INDEX "tb_Usuarios_dsLogin_key" ON "tb_Usuarios"("dsLogin");

-- CreateIndex
CREATE INDEX "tb_Usuarios_idFuncionario_idx" ON "tb_Usuarios"("idFuncionario");

-- CreateIndex
CREATE INDEX "tb_Usuarios_idAluno_idx" ON "tb_Usuarios"("idAluno");

-- AddForeignKey
ALTER TABLE "tb_Empresas" ADD CONSTRAINT "tb_Empresas_idCliente_fkey" FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Pontuacoes" ADD CONSTRAINT "tb_Pontuacoes_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AtividadeAgendas" ADD CONSTRAINT "tb_AtividadeAgendas_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AtividadeAgendas" ADD CONSTRAINT "tb_AtividadeAgendas_idAtividade_fkey" FOREIGN KEY ("idAtividade") REFERENCES "tb_Atividades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoAtividadeAgendas" ADD CONSTRAINT "tb_AlunoAtividadeAgendas_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoAtividadeAgendas" ADD CONSTRAINT "tb_AlunoAtividadeAgendas_idAtividadeAgenda_fkey" FOREIGN KEY ("idAtividadeAgenda") REFERENCES "tb_AtividadeAgendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoAtividadeAgendas" ADD CONSTRAINT "tb_AlunoAtividadeAgendas_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_FuncionarioAtividadeAgendas" ADD CONSTRAINT "tb_FuncionarioAtividadeAgendas_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_FuncionarioAtividadeAgendas" ADD CONSTRAINT "tb_FuncionarioAtividadeAgendas_idAtividadeAgenda_fkey" FOREIGN KEY ("idAtividadeAgenda") REFERENCES "tb_AtividadeAgendas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_FuncionarioAtividadeAgendas" ADD CONSTRAINT "tb_FuncionarioAtividadeAgendas_idFuncionario_fkey" FOREIGN KEY ("idFuncionario") REFERENCES "tb_Funcionarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ExercicioAreasCorporais" ADD CONSTRAINT "tb_ExercicioAreasCorporais_idExercicio_fkey" FOREIGN KEY ("idExercicio") REFERENCES "tb_Exercicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ExercicioAreasCorporais" ADD CONSTRAINT "tb_ExercicioAreasCorporais_idAreaCorporal_fkey" FOREIGN KEY ("idAreaCorporal") REFERENCES "tb_AreasCorporais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Alunos" ADD CONSTRAINT "tb_Alunos_idCliente_fkey" FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_FuncionarioArquivos" ADD CONSTRAINT "tb_FuncionarioArquivos_idFuncionario_fkey" FOREIGN KEY ("idFuncionario") REFERENCES "tb_Funcionarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Senhas" ADD CONSTRAINT "tb_Senhas_idUsuario_fkey" FOREIGN KEY ("idUsuario") REFERENCES "tb_Usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoAtividades" ADD CONSTRAINT "tb_PlanoAtividades_idPlano_fkey" FOREIGN KEY ("idPlano") REFERENCES "tb_Planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoAtividades" ADD CONSTRAINT "tb_PlanoAtividades_idAtividade_fkey" FOREIGN KEY ("idAtividade") REFERENCES "tb_Atividades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoProdutos" ADD CONSTRAINT "tb_PlanoProdutos_idPlano_fkey" FOREIGN KEY ("idPlano") REFERENCES "tb_Planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoProdutos" ADD CONSTRAINT "tb_PlanoProdutos_idProduto_fkey" FOREIGN KEY ("idProduto") REFERENCES "tb_Produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoEmpresas" ADD CONSTRAINT "tb_PlanoEmpresas_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoEmpresas" ADD CONSTRAINT "tb_PlanoEmpresas_idPlano_fkey" FOREIGN KEY ("idPlano") REFERENCES "tb_Planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PlanoValores" ADD CONSTRAINT "tb_PlanoValores_idPlano_fkey" FOREIGN KEY ("idPlano") REFERENCES "tb_Planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PromocaoPlanos" ADD CONSTRAINT "tb_PromocaoPlanos_idPromocao_fkey" FOREIGN KEY ("idPromocao") REFERENCES "tb_Promocoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PromocaoPlanos" ADD CONSTRAINT "tb_PromocaoPlanos_idPlano_fkey" FOREIGN KEY ("idPlano") REFERENCES "tb_Planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PromocaoProdutos" ADD CONSTRAINT "tb_PromocaoProdutos_idPromocao_fkey" FOREIGN KEY ("idPromocao") REFERENCES "tb_Promocoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PromocaoProdutos" ADD CONSTRAINT "tb_PromocaoProdutos_idProduto_fkey" FOREIGN KEY ("idProduto") REFERENCES "tb_Produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoEvolucoes" ADD CONSTRAINT "tb_AlunoEvolucoes_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoPlanos" ADD CONSTRAINT "tb_AlunoPlanos_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoPlanos" ADD CONSTRAINT "tb_AlunoPlanos_idPlano_fkey" FOREIGN KEY ("idPlano") REFERENCES "tb_Planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Pagamentos" ADD CONSTRAINT "tb_Pagamentos_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Pagamentos" ADD CONSTRAINT "tb_Pagamentos_idStatusPagamento_fkey" FOREIGN KEY ("idStatusPagamento") REFERENCES "tb_StatusPagamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_TreinoExercicios" ADD CONSTRAINT "tb_TreinoExercicios_idTreino_fkey" FOREIGN KEY ("idTreino") REFERENCES "tb_Treinos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_TreinoExercicios" ADD CONSTRAINT "tb_TreinoExercicios_idExercicio_fkey" FOREIGN KEY ("idExercicio") REFERENCES "tb_Exercicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_TreinoExercicios" ADD CONSTRAINT "tb_TreinoExercicios_idUnidadeMedida_fkey" FOREIGN KEY ("idUnidadeMedida") REFERENCES "tb_UnidadesMedidas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoTreinos" ADD CONSTRAINT "tb_AlunoTreinos_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoTreinos" ADD CONSTRAINT "tb_AlunoTreinos_idTreino_fkey" FOREIGN KEY ("idTreino") REFERENCES "tb_Treinos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoPontuacoes" ADD CONSTRAINT "tb_AlunoPontuacoes_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoPontuacoes" ADD CONSTRAINT "tb_AlunoPontuacoes_idPontuacao_fkey" FOREIGN KEY ("idPontuacao") REFERENCES "tb_Pontuacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoPontuacoes" ADD CONSTRAINT "tb_AlunoPontuacoes_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ProdutoMovimentacoes" ADD CONSTRAINT "tb_ProdutoMovimentacoes_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ProdutoMovimentacoes" ADD CONSTRAINT "tb_ProdutoMovimentacoes_idProduto_fkey" FOREIGN KEY ("idProduto") REFERENCES "tb_Produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_EmpresasArquivos" ADD CONSTRAINT "tb_EmpresasArquivos_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ClientesArquivos" ADD CONSTRAINT "tb_ClientesArquivos_idCliente_fkey" FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoArquivos" ADD CONSTRAINT "tb_AlunoArquivos_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ExercicioArquivos" ADD CONSTRAINT "tb_ExercicioArquivos_idExercicio_fkey" FOREIGN KEY ("idExercicio") REFERENCES "tb_Exercicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ProdutoArquivos" ADD CONSTRAINT "tb_ProdutoArquivos_idProduto_fkey" FOREIGN KEY ("idProduto") REFERENCES "tb_Produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_PromocaoArquivos" ADD CONSTRAINT "tb_PromocaoArquivos_idPromocao_fkey" FOREIGN KEY ("idPromocao") REFERENCES "tb_Promocoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoCheckIns" ADD CONSTRAINT "tb_AlunoCheckIns_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoCheckIns" ADD CONSTRAINT "tb_AlunoCheckIns_idAluno_fkey" FOREIGN KEY ("idAluno") REFERENCES "tb_Alunos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoCheckIns" ADD CONSTRAINT "tb_AlunoCheckIns_idPontuacao_fkey" FOREIGN KEY ("idPontuacao") REFERENCES "tb_Pontuacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoCheckIns" ADD CONSTRAINT "tb_AlunoCheckIns_idTipoCheckIn_fkey" FOREIGN KEY ("idTipoCheckIn") REFERENCES "tb_TiposCheckIn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_AlunoTreinosSequencias" ADD CONSTRAINT "tb_AlunoTreinosSequencias_idAlunoTreino_fkey" FOREIGN KEY ("idAlunoTreino") REFERENCES "tb_AlunoTreinos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Frequencias" ADD CONSTRAINT "tb_Frequencias_idUnidadeTempo_fkey" FOREIGN KEY ("idUnidadeTempo") REFERENCES "tb_UnidadesTempo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Catracas" ADD CONSTRAINT "tb_Catracas_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_CatracaEventos" ADD CONSTRAINT "tb_CatracaEventos_idCatraca_fkey" FOREIGN KEY ("idCatraca") REFERENCES "tb_Catracas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_EquipamentoManutencoes" ADD CONSTRAINT "tb_EquipamentoManutencoes_idEquipamento_fkey" FOREIGN KEY ("idEquipamento") REFERENCES "tb_Equipamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ExercicioEquipamentos" ADD CONSTRAINT "tb_ExercicioEquipamentos_idExercicio_fkey" FOREIGN KEY ("idExercicio") REFERENCES "tb_Exercicios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_ExercicioEquipamentos" ADD CONSTRAINT "tb_ExercicioEquipamentos_idEquipamento_fkey" FOREIGN KEY ("idEquipamento") REFERENCES "tb_Equipamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tb_Localidades" ADD CONSTRAINT "tb_Localidades_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Backfill de colunas novas NOT NULL (dados de dev preservados)
UPDATE "tb_Alunos" SET "idCliente" = 1 WHERE "idCliente" IS NULL;
ALTER TABLE "tb_Alunos" ALTER COLUMN "idCliente" SET NOT NULL;
UPDATE "tb_Frequencias" SET "idUnidadeTempo" = 3 WHERE "idUnidadeTempo" IS NULL;
ALTER TABLE "tb_Frequencias" ALTER COLUMN "idUnidadeTempo" SET NOT NULL;
