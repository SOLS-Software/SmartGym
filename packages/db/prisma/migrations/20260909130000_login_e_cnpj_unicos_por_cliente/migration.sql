-- Unicidade por CLIENTE, nao por instalacao.
--
-- Dois @unique globais vazavam a existencia de outros tenants e impediam
-- cadastros legitimos:
--
--   tb_Usuarios."dsLogin"  — o primeiro cliente a cadastrar "recepcao@..."
--     tomava o nome para todos; o segundo recebia erro de duplicidade, que e
--     uma confirmacao de que aquele login existe em algum lugar do sistema.
--
--   tb_Empresas."caCNPJ"   — uma rede que opera o mesmo CNPJ em duas contas,
--     ou uma migracao em que a academia e recadastrada antes de a antiga sair,
--     simplesmente travava.
--
-- tb_Alunos ja resolveu isso ha tempos com @@unique([idCliente, caCPFHash]);
-- aqui e o mesmo movimento nas outras duas.
--
-- tb_Usuarios ganha "idCliente" no caminho. O tenant do usuario ja era
-- deduzido no login (funcionario -> empresa -> cliente, ou aluno -> cliente),
-- mas nao estava gravado — e sem coluna nao ha unique composto possivel.

-- ---------------------------------------------------------------------------
-- 1) tb_Usuarios.idCliente
-- ---------------------------------------------------------------------------

ALTER TABLE "tb_Usuarios" ADD COLUMN "idCliente" INTEGER;

-- Usuario de aluno.
UPDATE "tb_Usuarios" u
SET "idCliente" = a."idCliente"
FROM "tb_Alunos" a
WHERE a."id" = u."idAluno" AND u."idCliente" IS NULL;

-- Usuario de funcionario (chega ao cliente pela filial).
UPDATE "tb_Usuarios" u
SET "idCliente" = e."idCliente"
FROM "tb_Funcionarios" f
JOIN "tb_Empresas" e ON e."id" = f."idEmpresa"
WHERE f."id" = u."idFuncionario" AND u."idCliente" IS NULL;

-- Ultimo recurso: instalacao de cliente unico. Sobrando alguem sem tenant
-- (usuario sem aluno e sem funcionario, ou funcionario sem filial), a
-- migracao aborta — um usuario sem dono e uma sessao sem tenant, e o resto do
-- sistema ja recusa isso com 403.
DO $$
DECLARE
  qt_clientes INTEGER;
  unico       INTEGER;
  sobraram    INTEGER;
BEGIN
  SELECT COUNT(*) INTO qt_clientes FROM "tb_Clientes";

  IF qt_clientes = 1 THEN
    SELECT "id" INTO unico FROM "tb_Clientes";
    UPDATE "tb_Usuarios" SET "idCliente" = unico WHERE "idCliente" IS NULL;
  END IF;

  SELECT COUNT(*) INTO sobraram FROM "tb_Usuarios" WHERE "idCliente" IS NULL;

  IF sobraram > 0 THEN
    RAISE EXCEPTION
      'Restaram % usuario(s) sem cliente. Rode SELECT id, "dsLogin", "idAluno", "idFuncionario" FROM "tb_Usuarios" WHERE "idCliente" IS NULL, atribua o dono e repita a migracao.',
      sobraram;
  END IF;
END $$;

ALTER TABLE "tb_Usuarios" ALTER COLUMN "idCliente" SET NOT NULL;

ALTER TABLE "tb_Usuarios"
  ADD CONSTRAINT "tb_Usuarios_idCliente_fkey"
  FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "tb_Usuarios_idCliente_idx" ON "tb_Usuarios"("idCliente");

-- ---------------------------------------------------------------------------
-- 2) Trocar os uniques globais pelos compostos
--
-- A ordem importa: o composto entra ANTES de o global sair, para nao existir
-- um instante sem nenhuma garantia de unicidade.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "tb_Usuarios_idCliente_dsLogin_key"
  ON "tb_Usuarios"("idCliente", "dsLogin");

DROP INDEX IF EXISTS "tb_Usuarios_dsLogin_key";

CREATE UNIQUE INDEX "tb_Empresas_idCliente_caCNPJ_key"
  ON "tb_Empresas"("idCliente", "caCNPJ");

DROP INDEX IF EXISTS "tb_Empresas_caCNPJ_key";
