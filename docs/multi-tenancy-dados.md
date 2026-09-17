# Multi-tenancy de dados — locação de dados por cliente (modelo híbrido/registro)

> **STATUS (2026-09-16): ROLLOUT EM ANDAMENTO — 533 → 3 acessos.** O roteamento
> por tenant está feito em ~30 arquivos, a guarda de `$transaction` entre bancos
> existe, e as portas da catraca e do webhook ganharam âncora no control-plane.
> Falta a última (login/identidade) para a trava de `ROTEAMENTO_COMPLETO` abrir —
> ver "Portas de entrada". Nada quebra hoje: sem registro em `tb_ClienteConexoes`,
> tudo cai no padrão do `.env` (o pool compartilhado atual).

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

## Fronteira dos dados: o que é do provedor × do cliente

A separação é em **dois níveis** (decisão do dono, 2026-09-11): as tabelas do
**provedor** ficam sempre no banco central; só as tabelas da **aplicação** vão
para o banco do cliente. Há ainda um terceiro grupo — o **catálogo global**.

**🔒 Provedor (control plane — central, sempre):**
- Tenancy/infra: `tb_Clientes`, `tb_ClienteConexoes`, `tb_DominiosCorporativos`.
- Logs: `tb_Auditoria` (trilha global). *(`tb_WebhookEventos` NÃO — é da aplicação,
  ver abaixo: tem FK para a conta de recebimento/pagamento do cliente.)*
- **Identidade/login enxuta** (ver abaixo): a credencial de acesso.

**🏢 Aplicação (dados do cliente — vão para o banco dele):**
- Todo o negócio: `tb_Alunos` (+ filhos), `tb_Empresas`, `tb_Funcionarios`,
  `tb_Planos`/`tb_Pagamentos`, `tb_Atividades`, `tb_Treinos`, `tb_Promocoes`,
  `tb_Leads`, `tb_Fornecedores`, `tb_Equipamentos`, `tb_ContasRecebimento`,
  `tb_Consentimentos`, `tb_ClientesArquivos`, `tb_TemasCustomizados`,
  `tb_PerfisAcesso` (RBAC), `tb_Catracas`/eventos, `tb_Produtos`, `tb_Categorias`
  (tem `idEmpresa`), `tb_WebhookEventos` (FK para conta/pagamento), etc.

**📚 Catálogo global (referência igual para todos):** `tb_UnidadesMedida`,
`tb_Localidades`, `tb_AreasCorporais`, `tb_Esportes`, `tb_Exercicios` (+ filhos),
`tb_FormasPagamento`, `tb_Niveis`, `tb_StatusPagamento`, `tb_TiposArquivo`… As
tabelas da aplicação têm FK para elas, então precisam existir **dentro de cada
banco de aplicação** — são semeadas iguais em cada banco, não ficam no central.
*(Atenção: alguns "catálogos" são na verdade config por-tenant — `TipoCheckIn`,
`Pontuacao`, `MotivoCancelamento` — e pertencem à aplicação.)*

**Codificado e guardado:** a classificação das 82 tabelas vive em
`apps/api/src/shared/tenantTables.ts` (control-plane / application / catalog), e
`tenantTables.test.ts` afirma — via DMMF do Prisma — que **todo** model do schema
está classificado (tabela nova sem nível quebra o build). A "passada fina" foi
concluída (2026-09-15): `WebhookEvento` e `Categoria` → aplicação (têm vínculo
por-tenant); `MetodoTreino`/`Nivel`/`Tema`/`Cargo`/`Frequencia` → catálogo (listas
padrão, decisão do dono). `TIER_REVIEW` está **vazio** — sem pendências.

## Identidade enxuta central (decisão: híbrido)

O login é do provedor, mas o **perfil** da pessoa é dado do cliente. Então a
identidade é **partida**:

- **No central**, uma identidade MÍNIMA: chave de login (email/CPF), hash de
  senha, `idCliente` (para onde apontar) e o ponteiro lógico para o perfil
  (`idAluno`/`idFuncionario`). É o que hoje está em `tb_Usuarios` + `tb_Senhas` +
  `tb_RecuperacaoSenha` + `tb_UsuarioDispositivos`.
- **No banco do cliente**, o perfil rico e o RBAC: `tb_Alunos`/`tb_Funcionarios`
  e `tb_PerfisAcesso`/permissões.

**Consequência:** o vínculo `Usuario → Aluno/Funcionario` deixa de ser FK (bancos
diferentes) e vira **referência lógica** que o app resolve. Fluxo de login:

1. Acha a identidade no central pela chave (email/CPF) — e/ou `resolveTenantByDomain`.
2. Verifica a senha no central; lê `idCliente` + ponteiro do perfil.
3. Emite o JWT com `idCliente` (como hoje).
4. Nas requisições seguintes, `getTenantDb(idCliente)` carrega perfil/RBAC do
   banco do cliente. As permissões passam a vir do banco do tenant, não do central.

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
   - ✅ **Feito (fundação, 2026-09-11):** `resolveTenantByDomain` foi extraído para
     `apps/api/src/shared/tenantResolver.ts` (control-plane, reusado pelo auth) —
     o primitivo `domínio → idCliente` que antecede o `getTenantDb`. Falta rotear
     o *lookup de login* por `getTenantDb(idCliente)` (parte do item 2).
2. **Partir a identidade (central enxuta).** Separar o que autentica (central:
   chave de login, hash, `idCliente`, ponteiro do perfil) do perfil rico + RBAC
   (banco do cliente). Envolve mudar o schema (`tb_Usuarios` deixa de ter FK para
   `Aluno`/`Funcionario` — vira referência lógica) e o hook de auth passar a
   carregar permissões do banco do tenant. Ver "Identidade enxuta central".
3. **Rotear as queries pelo resolver.** Os call sites que hoje usam o singleton
   `prisma` (dados de aplicação) passam a usar `getTenantDb(idCliente)`. Grande,
   mecânico e arriscado — fazer por módulo, com a rede do M-1 (`tenantScope.test`)
   e testes de fumaça. **Cuidado:** um `$transaction` não cruza dois clients — todo
   o caminho de dados de um handler tem de estar num único banco. As tabelas do
   provedor (control plane) continuam no `prisma` central; só as da aplicação vão
   pelo resolver. *(Desde 2026-09-16 isso não depende mais de disciplina: a
   guarda de `shared/tenantTx.ts` lança em vez de deixar a escrita escapar. O
   que falta é o trabalho mecânico — **533** acessos, medidos pelo
   `tenantRolloutCoverage.test.ts`.)*
4. **Migrations por tenant.** Cada banco dedicado precisa do schema (aplicação +
   catálogo global semeado) e das migrations. Provisionar cliente = criar banco +
   `prisma migrate deploy` + seed do catálogo. Deploy = rodar `migrate deploy` em
   **todos** os bancos do registro. O schema do provedor (central) migra à parte.
5. **RLS.** No silo, a RLS (M-1 fase 2) vira defesa em profundidade (o isolamento
   já é físico); no pool, continua sendo o isolamento. Manter a policy nos dois.
6. **Pool de conexões.** N `PrismaClient` × pool multiplica conexões. Usar
   `connection_limit` por client, o pooler do Neon, e avaliar LRU/eviction do
   cache de clients.
7. **Storage por tenant.** `getTenantStorageConfig` já resolve; falta trocar os
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
   Rollback: `--disable --apply` no registro volta o cliente ao padrão; a virada
   acontece sozinha em até `TENANT_DB_CACHE_TTL_MS` (60 s por padrão), sem
   reiniciar a API. Para religar depois: `--enable --apply`.

> **O passo 5 está travado de propósito.** Enquanto `ROTEAMENTO_COMPLETO` for
> `false` em `shared/tenantRollout.ts`, o script recusa ativar banco dedicado —
> ver "O que o piloto encontrou" abaixo. Contornar exige
> `--force-rollout-incompleto` e sabendo o que se está aceitando.

## O que o piloto encontrou (2026-09-16)

O rollout foi exercitado de ponta a ponta contra infra real: Postgres+PostGIS
local para o cliente 3, `migrate deploy` num banco zerado, registro provisionado
pelo script, e `GET /students` + `GET /students/:id` roteados por `getTenantDb`.
Funcionou — e expôs três defeitos que só aparecem rodando.

**1. Rollout parcial serve duas verdades.** Mesmo aluno, mesmo token:
`GET /students/490` (roteada) devolvia `[SILO] AUDIT Aluno B` enquanto
`GET /students/490/lgpd-export` (não roteada) devolvia `AUDIT Aluno B`. Não é
transitório: dura o tempo inteiro da migração módulo a módulo.
→ **Trava:** `shared/tenantRollout.ts` (`ROTEAMENTO_COMPLETO`) + o medidor
`tenantRolloutCoverage.test.ts`, catraca que só desce (hoje: **533** acessos a
dado de aplicação pelo client central). O script de provisionamento recusa
ativar banco dedicado enquanto o número não for zero. A constante não pode
mentir: o teste falha se ela disser "completo" com acesso sobrando.

**2. `$transaction` entre clients falhava em silêncio.** Uma escrita no client
do tenant dentro de um `prisma.$transaction` central **sobrevivia ao rollback**,
sem erro nenhum — meia gravação, zero alarme.
→ **Guarda:** `shared/tenantTx.ts`. Cada client carrega um dono; `$transaction`
registra o dono no contexto assíncrono e qualquer operação de outro dono lança,
nomeando os dois clients. Escape explícito para o caso legítimo (trilha de
auditoria no central durante escrita no tenant): `outsideTransaction(...)`, que
diz no código que aquele trecho não tem rollback. 11 testes de unidade.

**3. O rollback documentado não funcionava.** O cache de clients era eterno:
`boAtivo=false` mudava o registro e o processo seguia servindo do silo até
alguém reiniciar a API.
→ **Correção:** cache com prazo (`TENANT_DB_CACHE_TTL_MS`, 60 s), descarte do
client antigo com carência de 30 s para requests em voo, e
`invalidateTenantDb(idCliente)` para não esperar o TTL. No caminho, o script
ganhou `--enable`: sem ele o registro era porta de mão única — `--disable`
gravava `false` e nada jamais voltava para `true`.

## Portas de entrada: as que já têm âncora e as que faltam

O roteamento desceu de 533 para **13**. O que sobrou não é trabalho repetitivo —
é o mesmo problema de arquitetura, e ele tem um formato único:

> Toda porta pública precisa de uma chave que viva no **control-plane**. Sem
> isso, descobrir o tenant exige abrir um banco de aplicação — que é justamente
> o que só dá para escolher depois de saber o tenant.

| Porta | Chave | Situação |
|---|---|---|
| Lead (site) | domínio → `tb_DominiosCorporativos` | ✅ desde sempre |
| **Catraca** | **`tb_Clientes.caChaveDispositivo` no caminho** | ✅ **09/2026** |
| **Webhook** | **`tb_Clientes.caChaveWebhook` no caminho** | ✅ **09/2026** |
| Login (3 + relações) | `caCPFHash` em `tb_Alunos`/`tb_Funcionarios` (aplicação) | ❌ pendente |

### Catraca — resolvida sem tabela de-para

O firmware não aceita token (a tela de push não tem o campo), mas **aceita
endereço de servidor, e anexa o próprio endpoint ao caminho digitado** — é por
isso que existem rotas para `/controlid`, `/controlid/push` e
`/controlid/push/push`. O caminho é nosso, então ele carrega a chave da
academia: `https://<api>/d/<caChaveDispositivo>`.

A chave mora em `tb_Clientes`, que **já é control-plane** — por isso não há
de-para serial→cliente para manter em dia, e portanto nada que possa derivar. O
caminho antigo segue valendo e cai no pool, então o parque instalado não muda.
Detalhes em `docs/catraca-controlid.md`.

### Webhook — resolvida com a mesma forma

`/webhooks/payments/<chave>/<token>`: a **chave** roteia (control-plane) e o
**token** continua autenticando a conta em tempo constante, como antes. As três
camadas de defesa do módulo seguem intactas; ganhou-se uma quarta: a conta
encontrada precisa pertencer ao tenant que a chave resolveu.

Essa quarta camada não é enfeite. Testando, a chave de uma academia com o token
de outra **passava** — sem ganho para quem tentasse (o token é o segredo), mas
gravando evento no banco errado. Enquanto todos dividem o pool, a busca pelo
token alcança a conta de qualquer cliente; a conferência é o que faz o pool se
comportar como o silo.

Chave **separada** da chave de dispositivo de propósito: uma é digitada na tela
do equipamento, a outra é colada no painel do provedor de pagamento. Chave única
faria o vazamento de um painel enfraquecer o outro — e a do dispositivo é, neste
firmware, a única autenticação de equipamento que restou.

O caminho legado (`/webhooks/payments/<token>`) continua atendendo e cai no pool.

### Login — resolvida movendo a chave, não os dados

O login procurava a pessoa com um filtro que saía de `tb_Usuarios` (central) e
atravessava para `tb_Alunos`/`tb_Funcionarios` (aplicação). Com banco por
cliente esse JOIN deixa de existir — e quem está tentando entrar ainda não
disse de qual academia é; o app mobile nem domínio manda.

A **chave de login** (`Usuario.caCPFHash`) passou para a identidade central,
junto com o hash de senha que ela já guardava. O perfil rico e o RBAC continuam
sendo dado do cliente, carregados depois, do banco dele. Isso duplica o hash em
dois lugares — inevitável, porque o login precisa dele antes de saber o banco —
então os pontos de escrita são poucos e passam todos por `shared/loginKey.ts`,
que grava **a ficha primeiro e a chave depois**: se a segunda falhar, a pessoa
continua entrando com o CPF antigo, um desencontro recuperável, em vez de ficar
sem entrar.

Consequência no caminho quente: o hook de auth passou a fazer **duas consultas**
por request autenticado — "esta sessão ainda vale?" no central e "o que essa
pessoa pode fazer?" no banco do cliente. A segunda só para quem tem perfil a
aplicar.

O `register` era uma transação só que lia a ficha e criava a conta; virou
leitura da ficha (tenant) seguida de uma transação **só do central**.

### O medidor já foi cego uma vez

A varredura nasceu enxergando só `prisma.<model>`. Faltavam duas formas, e as
duas foram descobertas tarde:

1. **SQL cru** (`prisma.$queryRaw`) — 8 consultas em tabela de tenant,
   invisíveis. Fechado casando o `@@map` da tabela dentro do SQL.
2. **Filtro por relação** — a consulta parte de um model central e atravessa
   pela relação. Eram mais 8, e o mais importante era o carregamento de
   perfil/RBAC a cada request autenticado.

O segundo caso é o que vale a lição: ao ser implementado, o detector marcou zero
— e **zero de medidor morto é indistinguível de zero de trabalho terminado**. O
regex tinha um caractere de controle invisível no lugar de ``, colado por um
`sed`, que nem `String(regex)` revelava. Só apareceu porque o teste alimentou o
detector com um trecho sabidamente ruim e exigiu que ele acusasse.

Por isso `tenantRolloutCoverage.test.ts` agora testa **a própria varredura**, com
um exemplo de cada forma e um contraexemplo de control-plane legítimo. E os
exemplos vivem no teste, não nos comentários do scanner: escritos na prosa, eles
seriam varridos como se fossem código.

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
