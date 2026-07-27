-- Isolamento de tenant em tb_Equipamentos.
--
-- Ate aqui a tabela nao tinha NENHUMA coluna de posse: as rotas /equipments
-- listavam, editavam, desativavam e geravam URL assinada de arquivo de
-- equipamento de QUALQUER cliente para QUALQUER funcionario autenticado
-- (Broken Access Control cross-tenant). Passa a pertencer ao CLIENTE (rede),
-- no mesmo modelo ja usado por tb_Fornecedores.

-- 1) Nova coluna (nullable: as linhas existentes ainda nao tem dono conhecido).
ALTER TABLE "tb_Equipamentos" ADD COLUMN "idCliente" INTEGER;

-- 2) Backfill best-effort: se todos os exercicios vinculados a um equipamento
--    pertencem a empresas de UM UNICO cliente, a posse e inequivoca e pode ser
--    atribuida. Equipamentos sem vinculo, ou com vinculos de clientes
--    diferentes, ficam com idCliente NULL e sao tratados como legado.
UPDATE "tb_Equipamentos" eq
SET "idCliente" = donos."idCliente"
FROM (
  SELECT ee."idEquipamento" AS eq_id, MIN(emp."idCliente") AS "idCliente"
  FROM "tb_ExercicioEquipamentos" ee
  JOIN "tb_Exercicios" ex ON ex."id" = ee."idExercicio"
  JOIN "tb_Empresas" emp ON emp."id" = ex."idEmpresa"
  GROUP BY ee."idEquipamento"
  HAVING COUNT(DISTINCT emp."idCliente") = 1
) AS donos
WHERE eq."id" = donos.eq_id;

-- 3) FK + indice.
ALTER TABLE "tb_Equipamentos"
  ADD CONSTRAINT "tb_Equipamentos_idCliente_fkey"
  FOREIGN KEY ("idCliente") REFERENCES "tb_Clientes"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "tb_Equipamentos_idCliente_idx" ON "tb_Equipamentos"("idCliente");

-- ---------------------------------------------------------------------------
-- ACAO MANUAL PENDENTE (fecha o risco residual)
--
-- Equipamentos que sobraram com "idCliente" IS NULL sao legado sem dono
-- deduzivel. A API os mantem VISIVEIS para todos os tenants (para nao sumir
-- com dados de tela ja em uso) mas NAO permite mais edicao/exclusao/arquivo
-- por quem nao e o dono. Rode a consulta abaixo e atribua o cliente correto:
--
--   SELECT id, "nmEquipamento", "dsEquipamento" FROM "tb_Equipamentos"
--   WHERE "idCliente" IS NULL;
--
--   UPDATE "tb_Equipamentos" SET "idCliente" = <id_do_cliente>
--   WHERE id IN (...);
--
-- Depois de zerar os NULL, nenhum equipamento e visivel fora do seu tenant.
-- ---------------------------------------------------------------------------
