CREATE TABLE IF NOT EXISTS "tb_Esportes" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "dsEsporte" VARCHAR(255) NOT NULL,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tb_Esportes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "tb_Categorias" (
    "id" SERIAL NOT NULL,
    "idEmpresa" INTEGER,
    "idEsporte" INTEGER,
    "dsCategoria" VARCHAR(255) NOT NULL,
    "dtCadastro" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dtAlteracao" TIMESTAMP(3) NOT NULL,
    "boInativo" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tb_Categorias_pkey" PRIMARY KEY ("id")
);

ALTER TABLE IF EXISTS "tb_Atividades" ADD COLUMN IF NOT EXISTS "idEsporte" INTEGER;
ALTER TABLE IF EXISTS "tb_AtividadeAgendas" ADD COLUMN IF NOT EXISTS "idCategoria" INTEGER;
ALTER TABLE IF EXISTS "tb_AlunoCheckIns" ADD COLUMN IF NOT EXISTS "idAtividadeAgenda" INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tb_Esportes_idEmpresa_fkey'
    ) THEN
        ALTER TABLE "tb_Esportes" ADD CONSTRAINT "tb_Esportes_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tb_Categorias_idEmpresa_fkey'
    ) THEN
        ALTER TABLE "tb_Categorias" ADD CONSTRAINT "tb_Categorias_idEmpresa_fkey" FOREIGN KEY ("idEmpresa") REFERENCES "tb_Empresas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tb_Categorias_idEsporte_fkey'
    ) THEN
        ALTER TABLE "tb_Categorias" ADD CONSTRAINT "tb_Categorias_idEsporte_fkey" FOREIGN KEY ("idEsporte") REFERENCES "tb_Esportes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tb_Atividades_idEsporte_fkey'
    ) AND to_regclass('"tb_Atividades"') IS NOT NULL THEN
        ALTER TABLE "tb_Atividades" ADD CONSTRAINT "tb_Atividades_idEsporte_fkey" FOREIGN KEY ("idEsporte") REFERENCES "tb_Esportes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tb_AtividadeAgendas_idCategoria_fkey'
    ) AND to_regclass('"tb_AtividadeAgendas"') IS NOT NULL THEN
        ALTER TABLE "tb_AtividadeAgendas" ADD CONSTRAINT "tb_AtividadeAgendas_idCategoria_fkey" FOREIGN KEY ("idCategoria") REFERENCES "tb_Categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tb_AlunoCheckIns_idAtividadeAgenda_fkey'
    ) AND to_regclass('"tb_AlunoCheckIns"') IS NOT NULL AND to_regclass('"tb_AtividadeAgendas"') IS NOT NULL THEN
        ALTER TABLE "tb_AlunoCheckIns" ADD CONSTRAINT "tb_AlunoCheckIns_idAtividadeAgenda_fkey" FOREIGN KEY ("idAtividadeAgenda") REFERENCES "tb_AtividadeAgendas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
