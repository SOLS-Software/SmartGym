# Plano de implantação: RLS de tenant no PostgreSQL (M-1, fase 2)

> **STATUS (2026-09-10): RLS APLICADA E PROVADA na base de dev (Neon), com o
> usuário autorizando.** Role `smartgym_app` (sem BYPASSRLS) criado; `ENABLE RLS`
> + política `tenant_isolation` nas 16 tabelas; SQL idempotente em
> `packages/db/scripts/rls-tenant.sql`. Prova: owner lê 253 alunos; `smartgym_app`
> **sem** `app.tenant` lê **0**; `app.tenant=1` lê 250; `app.tenant=3` lê 3
> (250+3=253). O app (que conecta como `neondb_owner`, com bypassrls) **continua
> funcionando sem mudança** — confirmado (login + `GET /students` = 250).
>
> **A RLS está ativa mas DORMANT para o app:** o owner a ignora. Ela só
> **protege** quando o app passar a conectar como `smartgym_app` e fizer
> `SET LOCAL app.tenant` por request — o passo abaixo (app), que muda o modelo de
> conexão e é o de maior risco; fazer em staging. Reproduzir a RLS em outro
> ambiente: rodar `packages/db/scripts/rls-tenant.sql` + criar o role.

## Objetivo

Fechar a causa-raiz do M-1: hoje o isolamento é filtro manual por handler (229
pontos). Com **Row-Level Security**, o próprio Postgres filtra por `idCliente` —
uma query que esqueça o `where` **não vaza**, porque o banco não devolve as
linhas de outros tenants. A rede de proteção da fase 1 (`tenantScope.test.ts`)
continua útil como aviso precoce; a RLS é a defesa que não depende de ninguém
lembrar.

## Modelo

1. Um **role de aplicação sem `BYPASSRLS`** (`smartgym_app`). A API conecta com
   ele. (O owner do banco — dono das tabelas — ignora RLS a menos que
   `FORCE ROW LEVEL SECURITY`; por isso usamos FORCE e um role separado.)
2. Cada request faz **`SET LOCAL app.tenant = <idCliente do token>`** no início
   de uma transação; as políticas comparam `idCliente = current_setting('app.tenant')`.
3. Sem `app.tenant` setado, o role **não lê nenhuma linha** das tabelas de tenant
   — o default é fechado.

## Tabelas cobertas (16)

Todas as que têm `idCliente`, EXCETO `tb_Auditoria` (trilha global, lida só pelo
super-admin em `/reports/security-signals`):

`tb_Alunos`, `tb_Empresas`, `tb_Planos`, `tb_Atividades`, `tb_Treinos`,
`tb_Promocoes`, `tb_Usuarios`, `tb_PerfisAcesso`, `tb_Fornecedores`,
`tb_ClientesArquivos`, `tb_DominiosCorporativos`, `tb_TemasCustomizados`,
`tb_Equipamentos`, `tb_Leads`, `tb_ContasRecebimento`, `tb_Consentimentos`.

> Os **65 filhos** (Pagamento, AlunoEvolucao, AlunoBiometriaFacial…) não têm
> `idCliente` e ficam de fora desta fase — continuam cobertos pela posse do pai
> nos handlers + a rede da fase 1. Estendê-los exige denormalizar `idCliente`
> (fase 3), priorizando financeiro e sensível.

## SQL das políticas

```sql
-- 1) Role de aplicação (sem BYPASSRLS). A API passa a conectar com ele.
--    Ajuste a senha e os GRANTs ao seu ambiente.
CREATE ROLE smartgym_app LOGIN PASSWORD '***';
GRANT USAGE ON SCHEMA public TO smartgym_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO smartgym_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO smartgym_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO smartgym_app;

-- 2) Política por tabela. Repetir o bloco para cada uma das 16 tabelas.
--    current_setting(..., true) => NULL se não setado (em vez de erro); com
--    idCliente = NULL a linha não casa, então sem tenant o role não vê nada.
ALTER TABLE "tb_Alunos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tb_Alunos" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "tb_Alunos"
  USING ("idCliente" = current_setting('app.tenant', true)::int)
  WITH CHECK ("idCliente" = current_setting('app.tenant', true)::int);
-- ... idem para tb_Empresas, tb_Planos, tb_Atividades, tb_Treinos,
--     tb_Promocoes, tb_Usuarios, tb_PerfisAcesso, tb_Fornecedores,
--     tb_ClientesArquivos, tb_DominiosCorporativos, tb_TemasCustomizados,
--     tb_Equipamentos, tb_Leads, tb_ContasRecebimento, tb_Consentimentos.
```

O `WITH CHECK` impede também **inserir/atualizar** uma linha para outro tenant
(não só ler) — fecha o mass-assignment de `idCliente`.

## O `SET LOCAL` com Prisma (o ponto sensível)

`SET LOCAL` só vale dentro de uma transação, e o Prisma reusa conexões do pool —
um `SET` sem `LOCAL` vazaria o tenant de um request para o próximo. Duas formas:

- **A (recomendada): transação por request via Prisma Client Extension.**
  Uma extensão com `AsyncLocalStorage` (o tenant é populado no `onRequest`)
  embrulha cada operação numa transação que começa com
  `SET LOCAL app.tenant = <id>`. Custo: toda query vira transacional (overhead
  pequeno) e operações que hoje não usam `$transaction` passam a usar.
- **B: middleware de conexão.** Interceptar o checkout de conexão do pool e
  emitir `SET LOCAL` — mais frágil com o pool do Prisma; não recomendado.

Esboço da opção A:

```ts
// tenantStore: AsyncLocalStorage<number> populado no onRequest a partir do token.
prisma.$extends({
  query: {
    async $allOperations({ args, query }) {
      const tenant = tenantStore.getStore();
      if (tenant == null) return query(args); // caminhos sem tenant: ver abaixo
      return prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.tenant = ${Number(tenant)}`);
        return query(args);
      });
    },
  },
});
```

## Os cross-tenant legítimos (não podem quebrar)

1. **Auth-lookup por CPF** (`/auth/login`, `forgot`, `register`): rodam ANTES de
   saber o tenant e buscam em `tb_Alunos`/`tb_Funcionarios` sem `idCliente`. Com
   RLS ligada e sem `app.tenant`, não leriam nada. Solução: expor esses lookups
   como **funções `SECURITY DEFINER`** (rodam com o dono, ignoram RLS) que
   recebem o `caCPFHash` e devolvem só o mínimo (id, idCliente, hash de senha) —
   o resto do login já roda com o tenant setado. Alternativa: um segundo Prisma
   Client num role com `BYPASSRLS`, usado só pelo módulo de auth.
2. **Super-admin (SOLS)**: opera cross-tenant. Não setar `app.tenant` o deixaria
   sem ler nada. Solução: quando `request.user.superAdmin`, usar o cliente/rota
   com `BYPASSRLS` (o mesmo do item 1) em vez do role restrito.
3. **`tb_Funcionarios`**: alcança o tenant por `idEmpresa`, não tem `idCliente`.
   Fica de fora da RLS nesta fase (como os filhos) OU ganha política via JOIN a
   `tb_Empresas` (mais lenta). A auditoria não achou IDOR de funcionário aberto;
   a rede da fase 1 cobre o esquecimento.

## Runbook

1. **Staging que espelha produção** (nunca a base compartilhada). Backup antes.
2. Criar `smartgym_app`, aplicar as políticas, trocar o `DATABASE_URL` para o
   novo role.
3. Implementar a extensão do `SET LOCAL` (opção A) e o role `BYPASSRLS` para
   auth/super-admin.
4. **Teste que prova o isolamento** (o mais importante): abrir uma conexão com
   `smartgym_app` **sem** `SET app.tenant` e afirmar que `SELECT count(*) FROM
   "tb_Alunos"` retorna **0**; depois `SET app.tenant = <A>` e afirmar que só vê
   alunos de A. Sem esse teste, um role com `BYPASSRLS` por engano passaria
   despercebido.
5. Rodar a suíte + smoke test (login, listagens, super-admin, webhook).
6. Só então promover — com plano de rollback (desabilitar RLS é um `ALTER TABLE
   ... DISABLE ROW LEVEL SECURITY`, reversível).

## Riscos

- **Quebra silenciosa** se o `SET LOCAL` não rodar em algum caminho (job, script,
  seed): aquele caminho passa a ler 0 linhas. Mitiga o teste do passo 4 + cobrir
  scripts/seeds com o mesmo mecanismo (ou o role bypass).
- **`BYPASSRLS` vazado**: se o role do app ganhar `BYPASSRLS`, a proteção some
  sem erro. O teste do passo 4 é a rede contra isso — rodá-lo no CI de staging.
- **Performance**: transação por request adiciona um round-trip (`SET LOCAL`).
  Pequeno, mas medir em staging.

## Esforço

G. Recomendado fazer em uma leva dedicada, com staging, não misturado a outras
mudanças. A fase 1 (rede de proteção) já reduz o risco enquanto isto não vem.
