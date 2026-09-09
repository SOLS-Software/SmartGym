# Proposta: tornar o isolamento de tenant à prova de esquecimento (achado M-1)

> Desenho, não implementação. Decisão de arquitetura pendente.

## O problema

O isolamento entre academias é **opt-in e manual**: cada handler adiciona
`where: { idCliente }` à mão. Números da auditoria:

- `request.user.idCliente` aparece **~229 vezes** espalhado pelos handlers.
- `getTenantId()` em `plugins/auth.ts` está declarado e tem **zero usos** (código
  morto).
- Só **15 dos 80 models** têm coluna `idCliente` (Aluno, Empresa, Plano, Atividade,
  Treino, Promocao, Usuario, PerfilAcesso, Lead, Equipamento, Fornecedor,
  ContaRecebimento, DominioCorporativo, TemaCustomizado, ClienteArquivo). Os
  outros **65 alcançam o tenant só pelo pai** (Pagamento→AlunoPlano→Aluno, etc.).
- Não há Prisma extension, middleware, tipo ou teste que **force** o escopo.

Consequência: uma rota nova que esqueça o filtro vaza dados entre academias em
silêncio. As correções de 09/2026 e desta auditoria trataram os casos
encontrados **um a um**; a causa continua de pé. Cada rota futura é uma aposta.

## O que qualquer mecanismo PRECISA preservar

Antes de escolher, três acessos cross-tenant que são **legítimos** e que uma trava
cega quebraria:

1. **Super-admin (SOLS):** opera entre tenants (criar clientes, tabelas de domínio
   globais). Precisa de bypass explícito.
2. **Lookups de auth por CPF sem tenant:** `/auth/login`, `forgot`, `register` já
   buscam por `caCPFHash` e desambiguam por domínio/senha (A-2). São `findFirst`
   deliberadamente **sem** `idCliente` — a trava não pode bloqueá-los.
3. **Catálogos globais:** `Exercicio.idEmpresa null`, `Esporte`, `Categoria`,
   `StatusPagamento`, etc. são compartilhados por desenho.

## Opções

### A. Prisma Client Extension + AsyncLocalStorage
Um `$extends({ query })` injeta `where: { idCliente }` nos models de tenant,
lendo o tenant de um `AsyncLocalStorage` populado no hook `onRequest`.

- **Prós:** transparente para os handlers; um só ponto de verdade; puro TypeScript,
  sem mexer no banco.
- **Contras:** (a) os **65 filhos sem `idCliente`** não são cobertos — exigem
  denormalizar `idCliente` ou a extensão navegar pelo pai (caro e nem sempre
  possível). (b) `findUnique` por id **não aceita** `where` composto — todos
  viram `findFirst` (mudança ampla). (c) precisa de um `runUnscoped()` explícito
  para os 3 casos legítimos acima, e esquecer o bypass quebra o super-admin/auth.
- **Custo:** M–G. **Risco:** médio (injeção errada quebra query legítima; cobertura
  parcial dá falsa sensação de segurança).

### B. Row-Level Security (RLS) no PostgreSQL
Política por tabela: `USING ("idCliente" = current_setting('app.tenant')::int)`. O
app faz `SET LOCAL app.tenant = <idCliente>` no início de cada transação/request,
com um **role de aplicação sem `BYPASSRLS`**.

- **Prós:** defesa **no banco**, independente do ORM — mesmo uma query que esqueça
  o filtro **não vaza**. É a única opção que fecha o furo de verdade.
- **Contras:** (a) os 65 filhos precisam de política via subconsulta ao pai (mais
  lenta) ou de `idCliente` denormalizado. (b) o Prisma não gerencia RLS — SQL
  manual nas migrations + garantir o `SET LOCAL` em **todo** caminho (inclusive
  jobs/scripts). (c) se o `SET` falhar ou o role ganhar `BYPASSRLS`, a proteção
  some silenciosamente — precisa de teste que prove que um role sem tenant não lê
  nada. (d) super-admin e auth-lookup precisam de um caminho com role/bypass
  próprio.
- **Custo:** G. **Risco:** médio-alto na implantação, baixo depois de estável.

### C. Denormalizar `idCliente` em todos os 80 models + extension
Adicionar `idCliente` aos 65 filhos (migration grande, com backfill) e então A ou
B cobrem tudo uniformemente.

- **Prós:** cobertura uniforme; simplifica A e B.
- **Contras:** migration enorme e arriscada; `idCliente` redundante a manter
  consistente em toda escrita (o pai e o filho não podem divergir).
- **Custo:** G–GG. **Risco:** alto (a própria migration é um vetor de dono-errado,
  como o backfill de 09/2026).

### D. Rede de proteção barata (sem trava automática)
Manter o filtro manual, mas adicionar detecção: um teste/lint que percorre os
handlers e sinaliza `prisma.<modelDeTenant>.findMany/findFirst/update/delete` sem
`idCliente` no `where`. Complementa o teste de cobertura de rotas (M-2, já feito).

- **Prós:** barato, incremental, zero risco de quebrar runtime.
- **Contras:** não **impede** o esquecimento, só o **flagra** (e análise estática de
  `where` dinâmico tem falsos negativos).
- **Custo:** P–M. **Risco:** baixo.

## Recomendação (faseada)

1. **Agora (P):** implementar **D** — um teste que varre os handlers e falha se um
   model de tenant é consultado sem `idCliente`, junto com o teste de cobertura de
   rotas do M-2. Remover o `getTenantId()` morto ou passar a usá-lo. Rede de
   proteção imediata, risco zero.
   → **FEITO (2026-09-09):** `apps/api/src/plugins/tenantScope.test.ts` flagra
   `findMany`/`count`/`aggregate`/`groupBy` de model de tenant sem `idCliente`
   (escopo estreito p/ zero falso-positivo — hoje 25/25 escopadas; provado que
   pega uma violação injetada). `getTenantId()` morto removido de `plugins/auth.ts`.
2. **Próximo trimestre (G):** implementar **B (RLS)** para os **15 models com
   `idCliente`** — a defesa forte onde ela é barata (a coluna já existe). Role de
   app sem `BYPASSRLS`, `SET LOCAL` por request, e um teste de integração que
   prova que sem `app.tenant` o role não lê nenhuma linha. Deixar os 65 filhos
   cobertos pela posse do pai nos handlers (como hoje), agora com a rede da fase 1.
3. **Depois, se o risco justificar (G):** denormalizar `idCliente` nos filhos mais
   sensíveis (Pagamento, AlunoEvolucao, AlunoBiometriaFacial) e estender a RLS a
   eles — priorizando dado financeiro e sensível, não os 65 de uma vez.

Evitar **A** como defesa principal: dá sensação de cobertura total sendo parcial
(os filhos ficam de fora), e o caso especial do bypass é fácil de esquecer.

## Decisão pendente do dono

- Apetite para RLS (fase 2): muda o modelo de conexão (role de app dedicado,
  `SET LOCAL` por request) e o processo de migration (SQL de política manual).
- Quais filhos merecem `idCliente` denormalizado (fase 3) — financeiro e biometria
  são candidatos óbvios; o resto é custo sem risco proporcional.
