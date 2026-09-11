# Multi-tenancy de dados — locação de dados por cliente (modelo híbrido/registro)

> **STATUS (2026-09-11): DESENHO + CAMADA DE PARAMETRIZAÇÃO prontos.** O resolver
> por tenant existe e é testado; o rollout (rotear as queries por ele, migrations
> por tenant, provisionamento em produção) vem depois. Nada quebra hoje: sem
> registro, tudo cai no padrão do `.env` (o pool compartilhado atual).

## Problema

Hoje a conexão de **banco** (`DATABASE_URL`) e de **storage de imagens**
(`SUPABASE_*`) é um endereço **global** no `.env`, e os dados de todos os clientes
moram lá (isolados por `idCliente` linha a linha + RLS). Para oferecer **locação
de dados** — a infraestrutura é minha, mas o dado é do cliente — a conexão dos
dados de um cliente não pode ser um endereço fixo no `.env`: precisa ser
**resolvida por tenant**, para que um cliente possa ter o próprio banco/bucket.

## Os três modelos (e por que o híbrido)

| Modelo | O que é | Custo | Isolamento |
|---|---|---|---|
| **Pool** (hoje) | 1 banco, isolado por `idCliente` + RLS | Baixo | Lógico |
| **Silo** | 1 banco + 1 bucket por cliente, sempre | Alto (N bancos, migration por tenant, provisionamento) | Físico |
| **Híbrido/registro** (escolhido) | Um *control plane* resolve banco+storage por tenant; sem override, cai no padrão | Incremental | Físico **sob demanda** |

O **híbrido** é o caminho: não quebra o atual, tira a config de dados do cliente
do `.env` global e a coloca num **registro cifrado por tenant**, e permite migrar
clientes para banco/bucket próprio **um a um** (o produto "seu dado no seu banco"
vira um upgrade, não um rewrite).

## Arquitetura

```
                    ┌───────────────────────────── CONTROL PLANE ─────────────────────────────┐
   request ── domínio/subdomínio ─▶ resolve tenant ─▶ tb_ClienteConexoes (registro cifrado)     │
   (sabe o tenant                                        │                                       │
    ANTES de conectar)                                   ▼                                       │
                                        ┌─────────────── resolver (tenantDataSource.ts) ─────────┘
                                        │  tem override?     não ──▶ BANCO/STORAGE PADRÃO (.env, pool compartilhado)
                                        │                    sim ──▶ BANCO/STORAGE DEDICADO do cliente (silo)
                                        ▼
                                   PrismaClient por tenant (cache) / config de storage por tenant
```

- **Control plane** = a infraestrutura que sabe *quem é* cada tenant e *para onde*
  apontam seus dados. Vive no banco de bootstrap (o `DATABASE_URL` padrão). Hoje:
  a lista de clientes/domínios (`tb_Clientes`, `tb_DominiosCorporativos`) + o novo
  registro de conexões.
- **Registro** = `tb_ClienteConexoes` (control-plane, credenciais **cifradas**).
- **Plano de dados** = onde moram alunos/planos/pagamentos: no pool padrão (a
  maioria) ou no banco dedicado de um cliente siloado.

## O que já foi construído (camada de parametrização)

1. **`packages/db/scripts/cliente-conexoes.sql`** — tabela control-plane
   `tb_ClienteConexoes` (idempotente). Por cliente: `dsDatabaseUrlEnc`,
   `dsStorageUrlEnc`, `dsStorageKeyEnc` (cifrados, `enc:v1:` — mesma chave mestre
   de `secrets.ts`), buckets em claro, `boAtivo`. **Linha ausente/nula/inativa =>
   usa o padrão do `.env`.** Fica **fora da RLS de tenant** (é infra, guarda
   segredo; nunca exposta por rota).
2. **`apps/api/src/shared/tenantDataSource.ts`** — o resolver:
   - `resolveTenantDataSource(row)` (puro, testado): decide banco/storage a partir
     do registro; **decifra** as credenciais; **lança** se a credencial estiver
     corrompida (não cai no padrão em silêncio — isso mascararia um tenant
     provisionado "sumindo" para o pool compartilhado).
   - `getTenantDb(idCliente)`: devolve o `PrismaClient` do tenant (dedicado, em
     cache) ou o `prisma` padrão. Se a tabela control-plane ainda não existe,
     cai no padrão — a camada é **segura de mergear antes do rollout**.
   - `getTenantStorageConfig(idCliente)`: config de storage dedicada ou do `.env`.
   - `closeTenantDbs()`: fecha os pools dedicados no shutdown.
3. **`apps/api/src/scripts/setTenantDataSource.ts`** — provisiona/atualiza o
   registro de um cliente: cifra as credenciais e faz upsert. **Dry-run por
   padrão**, `--apply` para gravar; mascara segredos na saída.
4. **Testes** — `tenantDataSource.test.ts`: fallback ao padrão, round-trip de
   cifragem, precedência dos buckets, e o fail-loud da credencial corrompida.

## O que falta (rollout — leva dedicada, com staging)

1. **Resolução do tenant ANTES de conectar.** Hoje o login busca CPF no banco
   compartilhado. Com banco por cliente, é preciso saber o tenant por
   **domínio/subdomínio** (o `caDominio` que já resolvemos no achado A-2) para
   escolher o banco, e só então autenticar contra ele. Este é o ponto mais
   sensível: sem ele, um cliente siloado não consegue logar.
2. **Rotear as queries pelo resolver.** Os call sites que hoje usam o singleton
   `prisma` passam a usar `getTenantDb(idCliente)` nos caminhos por-tenant.
   Grande, mecânico e arriscado — fazer por módulo, com a rede do M-1
   (`tenantScope.test`) e testes de fumaça.
3. **Migrations por tenant.** Cada banco dedicado precisa do schema e das
   migrations. Provisionar cliente = criar banco + `prisma migrate deploy` +
   seed. Deploy = rodar `migrate deploy` em **todos** os bancos do registro.
4. **RLS.** No silo, a RLS (M-1 fase 2) vira defesa em profundidade (o isolamento
   já é físico); no pool, continua sendo o isolamento. Manter a policy nos dois.
5. **Pool de conexões.** N `PrismaClient` × pool multiplica conexões. Usar
   `connection_limit` por client, o pooler do Neon, e avaliar LRU/eviction do
   cache de clients.
6. **Storage por tenant.** `getTenantStorageConfig` já resolve; falta trocar os
   call sites de `getSupabaseClient()`/`getSupabaseConfig()` por versões
   por-tenant e mover os arquivos ao migrar um cliente.

## Runbook: migrar um cliente para infra dedicada

1. **Staging** (nunca a base compartilhada). Backup.
2. Provisionar o banco/bucket do cliente (fora deste repo — Neon/Supabase).
3. Aplicar o schema no banco novo (`prisma migrate deploy`) e seed mínimo.
4. Migrar os dados do cliente do pool para o banco dedicado (export por
   `idCliente` → import); mover os arquivos do storage.
5. Registrar a conexão:
   `tsx src/scripts/setTenantDataSource.ts --cliente=<id> --db-url=... --storage-url=... --storage-key=... --bucket=...`
   (rode em dry-run primeiro; depois `--apply`).
6. Validar (login pelo domínio do cliente, listagens, upload/leitura de arquivo).
7. Só então remover as linhas do cliente do pool compartilhado.
   Rollback: `boAtivo=false` no registro volta o cliente ao padrão.

## Segurança

- **Credenciais cifradas em repouso** (`secrets.ts`, AES-256-GCM, chave mestre
  `PII_ENCRYPTION_KEY`). O dump do control plane não entrega as strings de
  conexão. Quem tem a env mestre lê tudo — a defesa é contra vazamento do banco.
- **`tb_ClienteConexoes` nunca é exposta por rota** e fica fora da RLS de tenant.
  No futuro com `smartgym_app`, só um role de control plane pode lê-la.
- **`.env` passa a ter só**: a conexão de **control plane / pool padrão**
  (`DATABASE_URL`) e o storage padrão. As conexões de dados de cada cliente
  siloado vivem no registro cifrado, não no `.env`.

## Riscos

- **Tenant siloado caindo no pool por engano** (credencial ilegível): mitigado
  pelo fail-loud do resolver — melhor erro visível que dado servido do lugar
  errado.
- **Explosão de conexões** ao siloar muitos clientes: limitar pool por client +
  pooler.
- **Migrations dessincronizadas** entre bancos: um cliente com migration atrasada
  quebra silenciosamente. O deploy precisa iterar o registro e falhar se algum
  banco ficar para trás.
