-- Trancamento de matricula: o periodo em que o contrato fica pausado.
--
-- Antes disto nao havia onde registrar uma pausa, entao a equipe encerrava a
-- matricula e abria outra na volta. O efeito colateral e que a saida virava
-- churn: quem viajou dois meses aparecia na evasao junto com quem foi para o
-- concorrente, e o motivo de cancelamento ficava poluido.
--
-- Tabela e nao coluna porque trancar e um INTERVALO e acontece mais de uma vez
-- por contrato. Uma flag responderia "esta trancado?" e perderia "quantas
-- vezes", "por quanto tempo" e "quando".
--
-- Nao ha backfill possivel: os cancelamentos que na verdade eram pausas ja
-- perderam essa informacao ao virar `dtEncerramento`. O historico anterior
-- segue com o churn superestimado, e nao ha como saber de quanto.

-- CreateTable
CREATE TABLE "tb_AlunoPlanoTrancamentos" (
    "id" SERIAL NOT NULL,
    "idAlunoPlano" INTEGER NOT NULL,
    "dtInicio" DATE NOT NULL,
    "dtPrevisaoRetorno" DATE,
    "dtRetorno" DATE,
    "dsMotivo" VARCHAR(255),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "idUsuarioCadastro" INTEGER,
    "idUsuarioAlteracao" INTEGER,
    "boInativo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tb_AlunoPlanoTrancamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_AlunoPlanoTrancamentos_idAlunoPlano_dtInicio_idx" ON "tb_AlunoPlanoTrancamentos"("idAlunoPlano", "dtInicio");

-- AddForeignKey
ALTER TABLE "tb_AlunoPlanoTrancamentos" ADD CONSTRAINT "tb_AlunoPlanoTrancamentos_idAlunoPlano_fkey" FOREIGN KEY ("idAlunoPlano") REFERENCES "tb_AlunoPlanos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
