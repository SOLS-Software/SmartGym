-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "public" VERSION "3.5.0";

-- DropForeignKey
ALTER TABLE "public"."tb_DominiosCorporativos" DROP CONSTRAINT "tb_DominiosCorporativos_idEmpresa_fkey";

-- DropIndex
DROP INDEX "public"."tb_DominiosCorporativos_idEmpresa_urlDominio_key";

-- AlterTable
ALTER TABLE "public"."tb_AtividadeAgendas" ADD COLUMN     "idLocalidade" INTEGER;

-- AlterTable
ALTER TABLE "public"."tb_DominiosCorporativos" DROP COLUMN "idEmpresa",
ADD COLUMN     "idCliente" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "public"."tb_Empresas" ADD COLUMN     "idCliente" INTEGER;

-- AlterTable
ALTER TABLE "public"."tb_TemasCustomizados" ADD COLUMN     "idCliente" INTEGER,
ADD COLUMN     "idClienteArquivoFavicon" INTEGER,
ADD COLUMN     "idClienteArquivoLogo" INTEGER,
ALTER COLUMN "idEmpresa" DROP NOT NULL;

-- CreateTable
CREATE TABLE "public"."tb_Clientes" (
    "id" SERIAL NOT NULL,
    "dsCliente" VARCHAR(255) NOT NULL,
    "caCNPJ" VARCHAR(14),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tb_ClientesArquivos" (
    "id" SERIAL NOT NULL,
    "idCliente" INTEGER,
    "dsArquivo" VARCHAR(255) NOT NULL DEFAULT '',
    "anCaminho" VARCHAR(255) NOT NULL DEFAULT '',
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_ClientesArquivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tb_EquipamentoArquivos" (
    "id" SERIAL NOT NULL,
    "idEquipamento" INTEGER NOT NULL,
    "idTiposArquivos" INTEGER,
    "dsArquivo" VARCHAR(255) NOT NULL DEFAULT '',
    "anCaminho" VARCHAR(255) NOT NULL DEFAULT '',
    "cnChaveAcesso" INTEGER,
    "cnDistribuidor" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_EquipamentoArquivos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tb_EquipamentoManutencoes" (
    "id" SERIAL NOT NULL,
    "idEquipamento" INTEGER,
    "dtExecucao" TIMESTAMP(3),
    "dtValidade" TIMESTAMP(3),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_EquipamentoManutencoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tb_Equipamentos" (
    "id" SERIAL NOT NULL,
    "nrEquipamento" INTEGER,
    "dsEquipamento" VARCHAR(200),
    "nmEquipamento" VARCHAR(100),
    "dtAquisicao" TIMESTAMP(3),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Equipamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tb_ExercicioEquipamentos" (
    "id" SERIAL NOT NULL,
    "idExericio" INTEGER,
    "idEquipamento" INTEGER,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_ExercicioEquipamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tb_Localidades" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "nmLocalidade" VARCHAR(255) NOT NULL DEFAULT '',
    "dsLocalidade" VARCHAR(255) NOT NULL DEFAULT '',
    "cnLocalidadeTP" INTEGER NOT NULL DEFAULT 0,
    "geoLocalidade" geometry(Point, 4326) NOT NULL,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Localidades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_EquipamentoManutencoes_dtExecucao_idx" ON "public"."tb_EquipamentoManutencoes"("dtExecucao" ASC);

-- CreateIndex
CREATE INDEX "geo" ON "public"."tb_Localidades" USING GIST ("geoLocalidade");

-- CreateIndex
CREATE UNIQUE INDEX "tb_DominiosCorporativos_idCliente_urlDominio_key" ON "public"."tb_DominiosCorporativos"("idCliente" ASC, "urlDominio" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "tb_TemasCustomizados_idCliente_key" ON "public"."tb_TemasCustomizados"("idCliente" ASC);

-- AddForeignKey
ALTER TABLE "public"."tb_AtividadeAgendas" ADD CONSTRAINT "tb_AtividadeAgendas_idLocalidade_fkey" FOREIGN KEY ("idLocalidade") REFERENCES "public"."tb_Localidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tb_ClientesArquivos" ADD CONSTRAINT "tb_ClientesArquivos_idCliente_fkey" FOREIGN KEY ("idCliente") REFERENCES "public"."tb_Clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tb_DominiosCorporativos" ADD CONSTRAINT "tb_DominiosCorporativos_idCliente_fkey" FOREIGN KEY ("idCliente") REFERENCES "public"."tb_Clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tb_Empresas" ADD CONSTRAINT "tb_Empresas_idCliente_fkey" FOREIGN KEY ("idCliente") REFERENCES "public"."tb_Clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tb_EquipamentoArquivos" ADD CONSTRAINT "tb_EquipamentoArquivos_idEquipamento_fkey" FOREIGN KEY ("idEquipamento") REFERENCES "public"."tb_Equipamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tb_EquipamentoManutencoes" ADD CONSTRAINT "tb_EquipamentoManutencoes_idEquipamento_fkey" FOREIGN KEY ("idEquipamento") REFERENCES "public"."tb_Equipamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tb_ExercicioEquipamentos" ADD CONSTRAINT "tb_ExercicioEquipamentos_idEquipamento_fkey" FOREIGN KEY ("idEquipamento") REFERENCES "public"."tb_Equipamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tb_ExercicioEquipamentos" ADD CONSTRAINT "tb_ExercicioEquipamentos_idExericio_fkey" FOREIGN KEY ("idExericio") REFERENCES "public"."tb_Exercicios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tb_TemasCustomizados" ADD CONSTRAINT "tb_TemasCustomizados_idClienteArquivoFavicon_fkey" FOREIGN KEY ("idClienteArquivoFavicon") REFERENCES "public"."tb_ClientesArquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tb_TemasCustomizados" ADD CONSTRAINT "tb_TemasCustomizados_idClienteArquivoLogo_fkey" FOREIGN KEY ("idClienteArquivoLogo") REFERENCES "public"."tb_ClientesArquivos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tb_TemasCustomizados" ADD CONSTRAINT "tb_TemasCustomizados_idCliente_fkey" FOREIGN KEY ("idCliente") REFERENCES "public"."tb_Clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

