-- CreateTable
CREATE TABLE "tb_Catracas" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "dsCatraca" VARCHAR(100) NOT NULL DEFAULT '',
    "dsFabricante" VARCHAR(50) NOT NULL DEFAULT 'controlid',
    "dsModelo" VARCHAR(50) NOT NULL DEFAULT '',
    "caSerial" VARCHAR(100) NOT NULL DEFAULT '',
    "anIp" VARCHAR(45) NOT NULL DEFAULT '',
    "anMac" VARCHAR(17) NOT NULL DEFAULT '',
    "caToken" VARCHAR(100) NOT NULL DEFAULT '',
    "dtUltimoPush" TIMESTAMP(3),
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tb_Catracas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_Catracas_caSerial_idx" ON "tb_Catracas"("caSerial");

-- CreateIndex
CREATE INDEX "tb_Catracas_anMac_idx" ON "tb_Catracas"("anMac");

-- CreateTable
CREATE TABLE "tb_CatracaEventos" (
    "id" SERIAL NOT NULL,
    "idCatraca" INTEGER,
    "idAluno" INTEGER,
    "idEventoDispositivo" BIGINT,
    "nrUsuarioCatraca" VARCHAR(50),
    "nrTipoEvento" INTEGER,
    "dsTipoEvento" VARCHAR(50) NOT NULL DEFAULT '',
    "boAcessoLiberado" INTEGER NOT NULL DEFAULT 0,
    "dsIdentificacao" VARCHAR(50) NOT NULL DEFAULT '',
    "dsCartao" VARCHAR(50) NOT NULL DEFAULT '',
    "dsPortal" VARCHAR(20) NOT NULL DEFAULT '',
    "dsDirecao" VARCHAR(20) NOT NULL DEFAULT '',
    "anIpOrigem" VARCHAR(45) NOT NULL DEFAULT '',
    "dtEvento" TIMESTAMP(3) NOT NULL,
    "jsPayload" JSONB,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tb_CatracaEventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_CatracaEventos_idCatraca_dtEvento_idx" ON "tb_CatracaEventos"("idCatraca", "dtEvento");

-- CreateIndex
CREATE INDEX "tb_CatracaEventos_idAluno_dtEvento_idx" ON "tb_CatracaEventos"("idAluno", "dtEvento");

-- CreateIndex
CREATE INDEX "tb_CatracaEventos_dtEvento_idx" ON "tb_CatracaEventos"("dtEvento");

-- AddForeignKey
ALTER TABLE "tb_CatracaEventos" ADD CONSTRAINT "tb_CatracaEventos_idCatraca_fkey" FOREIGN KEY ("idCatraca") REFERENCES "tb_Catracas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
