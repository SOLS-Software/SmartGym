-- Dono explicito nas quatro tabelas comerciais que nao tinham nenhum.
--
-- O PROBLEMA
-- tb_Planos nao tinha coluna de tenant: quem era o dono se deduzia por
-- tb_PlanoEmpresas, e o filtro de leitura da API tratava "plano sem nenhuma
-- empresa vinculada" como GLOBAL, visivel a todos os clientes. Como POST /plans
-- cria o plano justamente sem vinculo, TODO plano nascia global — 7 dos 9
-- planos desta base estavam nesse estado, levando junto o preco de venda em
-- tb_PlanoValores. tb_Atividades, tb_Treinos e tb_Promocoes tinham a mesma
-- doenca por outro caminho: idEmpresa opcional, e nulo lido como "de todos".
--
-- A CORRECAO
-- idCliente NOT NULL nas quatro. idEmpresa continua opcional nas tres que a
-- tem, mas muda de significado: passa de "de todo mundo" para "vale em todas
-- as filiais DESTE cliente" — que e o estado legitimo de uma aula de plano da
-- rede ou de uma ficha modelo.
--
-- Os FILHOS (tb_PlanoValores, tb_PlanoAtividades, tb_PromocaoPlanos...) nao
-- ganham coluna: eles alcancam o tenant pelo pai, que agora tem dono. O
-- idEmpresa nulo deles herda o mesmo significado novo.
--
-- BACKFILL: cada tabela tenta as pistas em ordem, da mais forte para a mais
-- fraca, e por ultimo cai na instalacao de cliente unico. Se sobrar UMA linha
-- sem dono a migracao ABORTA — deixar nulo aqui seria recriar exatamente o
-- buraco que ela fecha.

-- ---------------------------------------------------------------------------
-- 1) tb_Planos
-- ---------------------------------------------------------------------------

ALTER TABLE "tb_Planos" ADD COLUMN "idCliente" INTEGER;

-- Pista 1: filiais em que o plano e vendido.
UPDATE "tb_Planos" p
SET "idCliente" = d."idCliente"
FROM (
  SELECT pe."idPlano" AS id_plano, MIN(e."idCliente") AS "idCliente"
  FROM "tb_PlanoEmpresas" pe
  JOIN "tb_Empresas" e ON e."id" = pe."idEmpresa"
  GROUP BY pe."idPlano"
  HAVING COUNT(DISTINCT e."idCliente") = 1
) d
WHERE p."id" = d.id_plano AND p."idCliente" IS NULL;

-- Pista 2: alunos ja matriculados no plano.
UPDATE "tb_Planos" p
SET "idCliente" = d."idCliente"
FROM (
  SELECT ap."idPlano" AS id_plano, MIN(a."idCliente") AS "idCliente"
  FROM "tb_AlunoPlanos" ap
  JOIN "tb_Alunos" a ON a."id" = ap."idAluno"
  GROUP BY ap."idPlano"
  HAVING COUNT(DISTINCT a."idCliente") = 1
) d
WHERE p."id" = d.id_plano AND p."idCliente" IS NULL;

-- Pista 3: precos cadastrados por filial.
UPDATE "tb_Planos" p
SET "idCliente" = d."idCliente"
FROM (
  SELECT pv."idPlano" AS id_plano, MIN(e."idCliente") AS "idCliente"
  FROM "tb_PlanoValores" pv
  JOIN "tb_Empresas" e ON e."id" = pv."idEmpresa"
  GROUP BY pv."idPlano"
  HAVING COUNT(DISTINCT e."idCliente") = 1
) d
WHERE p."id" = d.id_plano AND p."idCliente" IS NULL;

-- ---------------------------------------------------------------------------
-- 2) tb_Atividades
-- ---------------------------------------------------------------------------

ALTER TABLE "tb_Atividades" ADD COLUMN "idCliente" INTEGER;

-- Pista 1: a propria filial da atividade.
UPDATE "tb_Atividades" a
SET "idCliente" = e."idCliente"
FROM "tb_Empresas" e
WHERE e."id" = a."idEmpresa" AND a."idCliente" IS NULL;

-- Pista 2: as agendas da atividade (idEmpresa la e obrigatorio).
UPDATE "tb_Atividades" a
SET "idCliente" = d."idCliente"
FROM (
  SELECT ag."idAtividade" AS id_atividade, MIN(e."idCliente") AS "idCliente"
  FROM "tb_AtividadeAgendas" ag
  JOIN "tb_Empresas" e ON e."id" = ag."idEmpresa"
  GROUP BY ag."idAtividade"
  HAVING COUNT(DISTINCT e."idCliente") = 1
) d
WHERE a."id" = d.id_atividade AND a."idCliente" IS NULL;

-- Pista 3: os planos que incluem a atividade (ja resolvidos no passo 1).
UPDATE "tb_Atividades" a
SET "idCliente" = d."idCliente"
FROM (
  SELECT pa."idAtividade" AS id_atividade, MIN(p."idCliente") AS "idCliente"
  FROM "tb_PlanoAtividades" pa
  JOIN "tb_Planos" p ON p."id" = pa."idPlano"
  WHERE p."idCliente" IS NOT NULL
  GROUP BY pa."idAtividade"
  HAVING COUNT(DISTINCT p."idCliente") = 1
) d
WHERE a."id" = d.id_atividade AND a."idCliente" IS NULL;

-- ---------------------------------------------------------------------------
-- 3) tb_Treinos
-- ---------------------------------------------------------------------------

ALTER TABLE "tb_Treinos" ADD COLUMN "idCliente" INTEGER;

-- Pista 1: a filial da ficha.
UPDATE "tb_Treinos" t
SET "idCliente" = e."idCliente"
FROM "tb_Empresas" e
WHERE e."id" = t."idEmpresa" AND t."idCliente" IS NULL;

-- Pista 2: o aluno dono da ficha.
UPDATE "tb_Treinos" t
SET "idCliente" = a."idCliente"
FROM "tb_Alunos" a
WHERE a."id" = t."idAluno" AND t."idCliente" IS NULL;

-- Pista 3: os alunos a quem a ficha foi atribuida.
UPDATE "tb_Treinos" t
SET "idCliente" = d."idCliente"
FROM (
  SELECT vt."idTreino" AS id_treino, MIN(a."idCliente") AS "idCliente"
  FROM "tb_AlunoTreinos" vt
  JOIN "tb_Alunos" a ON a."id" = vt."idAluno"
  GROUP BY vt."idTreino"
  HAVING COUNT(DISTINCT a."idCliente") = 1
) d
WHERE t."id" = d.id_treino AND t."idCliente" IS NULL;

-- ---------------------------------------------------------------------------
-- 4) tb_Promocoes
-- ---------------------------------------------------------------------------

ALTER TABLE "tb_Promocoes" ADD COLUMN "idCliente" INTEGER;

-- Pista 1: a filial da campanha.
UPDATE "tb_Promocoes" pr
SET "idCliente" = e."idCliente"
FROM "tb_Empresas" e
WHERE e."id" = pr."idEmpresa" AND pr."idCliente" IS NULL;

-- Pista 2: os planos em campanha (ja resolvidos no passo 1).
UPDATE "tb_Promocoes" pr
SET "idCliente" = d."idCliente"
FROM (
  SELECT pp."idPromocao" AS id_promocao, MIN(p."idCliente") AS "idCliente"
  FROM "tb_PromocaoPlanos" pp
  JOIN "tb_Planos" p ON p."id" = pp."idPlano"
  WHERE p."idCliente" IS NOT NULL
  GROUP BY pp."idPromocao"
  HAVING COUNT(DISTINCT p."idCliente") = 1
) d
WHERE pr."id" = d.id_promocao AND pr."idCliente" IS NULL;

-- ---------------------------------------------------------------------------
-- 5) Ultimo recurso e trava de seguranca
--
-- Numa instalacao com UM cliente nao existe ambiguidade: o que sobrou e dele.
-- Com dois ou mais, o que sobrou e ambiguo e ninguem alem do operador sabe a
-- resposta — a migracao aborta e lista o que precisa ser resolvido a mao.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  qt_clientes INTEGER;
  unico       INTEGER;
  sobraram    INTEGER;
BEGIN
  SELECT COUNT(*) INTO qt_clientes FROM "tb_Clientes";

  IF qt_clientes = 1 THEN
    SELECT "id" INTO unico FROM "tb_Clientes";
    UPDATE "tb_Planos"     SET "idCliente" = unico WHERE "idCliente" IS NULL;
    UPDATE "tb_Atividades" SET "idCliente" = unico WHERE "idCliente" IS NULL;
    UPDATE "tb_Treinos"    SET "idCliente" = unico WHERE "idCliente" IS NULL;
    UPDATE "tb_Promocoes"  SET "idCliente" = unico WHERE "idCliente" IS NULL;
  END IF;

  SELECT
      (SELECT COUNT(*) FROM "tb_Planos"     WHERE "idCliente" IS NULL)
    + (SELECT COUNT(*) FROM "tb_Atividades" WHERE "idCliente" IS NULL)
    + (SELECT COUNT(*) FROM "tb_Treinos"    WHERE "idCliente" IS NULL)
    + (SELECT COUNT(*) FROM "tb_Promocoes"  WHERE "idCliente" IS NULL)
  INTO sobraram;

  IF sobraram > 0 THEN
    RAISE EXCEPTION
      'Restaram % linha(s) sem cliente em tb_Planos/tb_Atividades/tb_Treinos/tb_Promocoes. Atribua o dono a mao (SELECT id, "idCliente" FROM <tabela> WHERE "idCliente" IS NULL) e rode a migracao de novo.',
      sobraram;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6) Fechar as colunas
-- ---------------------------------------------------------------------------

ALTER TABLE "tb_Planos"     ALTER COLUMN "idCliente" SET NOT NULL;
ALTER TABLE "tb_Atividades" ALTER COLUMN "idCliente" SET NOT NULL;
ALTER TABLE "tb_Treinos"    ALTER COLUMN "idCliente" SET NOT NULL;
ALTER TABLE "tb_Promocoes"  ALTER COLUMN "idCliente" SET NOT NULL;

ALTER TABLE "tb_Planos"
  ADD CONSTRAINT "tb_Planos_idCliente_fkey"
  FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tb_Atividades"
  ADD CONSTRAINT "tb_Atividades_idCliente_fkey"
  FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tb_Treinos"
  ADD CONSTRAINT "tb_Treinos_idCliente_fkey"
  FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tb_Promocoes"
  ADD CONSTRAINT "tb_Promocoes_idCliente_fkey"
  FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "tb_Planos_idCliente_idx"     ON "tb_Planos"("idCliente");
CREATE INDEX "tb_Atividades_idCliente_idx" ON "tb_Atividades"("idCliente");
CREATE INDEX "tb_Treinos_idCliente_idx"    ON "tb_Treinos"("idCliente");
CREATE INDEX "tb_Promocoes_idCliente_idx"  ON "tb_Promocoes"("idCliente");
