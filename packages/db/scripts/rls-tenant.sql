-- RLS de isolamento de tenant (achado M-1, fase 2).
--
-- APLICADO E PROVADO na base de dev (Neon) em 2026-09-10:
--   owner (neondb_owner, bypassrls) le 253 alunos; smartgym_app SEM app.tenant
--   le 0; app.tenant=1 le 250; app.tenant=3 le 3 (250+3=253). Isolamento OK.
--
-- IMPORTANTE — a RLS so PROTEGE quando o app conecta com um role SEM BYPASSRLS
-- (smartgym_app) e faz `SET LOCAL app.tenant = <idCliente>` por request. Com o
-- owner atual (neondb_owner tem bypassrls), a RLS fica ativa mas o owner a
-- ignora: o app segue funcionando sem mudanca, e o filtro manual por handler
-- continua sendo o escopo efetivo. Trocar o app para smartgym_app + SET LOCAL e
-- o passo de staging/prod — ver docs/isolamento-tenant-rls.md. Idempotente.

-- ---------------------------------------------------------------------------
-- Role de aplicacao (rode UMA vez por ambiente; defina a senha do ambiente).
-- Mantido comentado: senha nao versionada, e o role ja existe no dev.
-- ---------------------------------------------------------------------------
-- CREATE ROLE smartgym_app LOGIN PASSWORD '<defina-no-ambiente>';
-- GRANT CONNECT ON DATABASE neondb TO smartgym_app;
-- GRANT USAGE ON SCHEMA public TO smartgym_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO smartgym_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO smartgym_app;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA public
--   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO smartgym_app;

-- ---------------------------------------------------------------------------
-- Politicas (ENABLE RLS + tenant_isolation) nas 16 tabelas com idCliente.
-- A tb_Auditoria fica de fora: trilha global, lida so pelo super-admin.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tabelas text[] := ARRAY[
    'tb_Alunos','tb_Empresas','tb_Planos','tb_Atividades','tb_Treinos','tb_Promocoes',
    'tb_Usuarios','tb_PerfisAcesso','tb_Fornecedores','tb_ClientesArquivos',
    'tb_DominiosCorporativos','tb_TemasCustomizados','tb_Equipamentos','tb_Leads',
    'tb_ContasRecebimento','tb_Consentimentos'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      'USING ("idCliente" = current_setting(''app.tenant'', true)::int) '
      'WITH CHECK ("idCliente" = current_setting(''app.tenant'', true)::int)',
      t
    );
  END LOOP;
END $$;

-- Rollback (se precisar): para cada tabela,
--   DROP POLICY IF EXISTS tenant_isolation ON "<tabela>";
--   ALTER TABLE "<tabela>" DISABLE ROW LEVEL SECURITY;
