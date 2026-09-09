-- CreateTable
CREATE TABLE "tb_Auditoria" (
    "id" BIGSERIAL NOT NULL,
    "dtEvento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idUsuario" INTEGER,
    "idCliente" INTEGER,
    "cnPapel" VARCHAR(20),
    "cnMetodo" VARCHAR(10) NOT NULL,
    "dsRota" VARCHAR(255) NOT NULL,
    "nrStatus" INTEGER NOT NULL,
    "anIp" VARCHAR(64),
    "dsResultado" VARCHAR(100),

    CONSTRAINT "tb_Auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tb_Auditoria_dtEvento_idx" ON "tb_Auditoria"("dtEvento");

-- CreateIndex
CREATE INDEX "tb_Auditoria_idCliente_dtEvento_idx" ON "tb_Auditoria"("idCliente", "dtEvento");

-- CreateIndex
CREATE INDEX "tb_Auditoria_idUsuario_dtEvento_idx" ON "tb_Auditoria"("idUsuario", "dtEvento");
