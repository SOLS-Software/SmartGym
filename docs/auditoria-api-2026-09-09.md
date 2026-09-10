# Auditoria adversarial da API SmartGym — 2026-09-09

Auditor: revisão AppSec + LGPD. Alvo: árvore de trabalho (não o último commit).
Migrations `...120000_dono_de_cliente...` e `...130000_login_e_cnpj_unicos...`
**confirmadas aplicadas** ao banco (`prisma migrate status`: 45 migrations, schema em
dia). Base de teste (Neon), um único cliente real (`SOLS SOFTWARE`, id 1). Criei um
segundo tenant (`AUDIT-ACADEMIA-B`, id 3) e papéis de teste para exercitar isolamento —
ver "Rastro deixado no banco".

Legenda de confiança: **REPRODUZIDO** (executei contra a API), **CONFIRMADO** (li o
caminho inteiro e ele quebra), **PLAUSÍVEL** (padrão arriscado, controle não descartado).

---

## 1. Sumário executivo

A postura de dados **em repouso** e a **higiene de autenticação** estão acima da média
para um sistema deste porte: CPF/biometria em AES-256-GCM, bcrypt com migração de legado,
revogação de sessão por versão conferida no banco a cada request, webhook de pagamento com
reconsulta ao provedor, e — o que mais importa — as correções de isolamento de 09/2026
estão **completas e consistentes** nos quatro models comerciais e em `shared/enrollment.ts`
(varri `plans`, `promotions`, `trainings`, `activities`, `students`, `leads`, `planRequests`,
`reports/overview`: nenhum resíduo de `planoEmpresas: { none: {} }` nem de "idEmpresa nulo =
global" sobrou nesses caminhos). O backfill caiu 100% na regra de "cliente único" (só há um
cliente), então **não há risco de dono-errado nesta base** — mas isso não foi testado com
dados ambíguos.

O que precisa ser resolvido primeiro, em ordem:

1. **Escalação de privilégio universal via `/auth/gestor-login` (CRÍTICO, REPRODUZIDO).**
   Qualquer funcionário — inclusive um com perfil de permissão zero — troca as próprias
   credenciais por um token `role: 'gestor'` que **pula todo o RBAC** e recebe as 38
   permissões. Não existe flag de "é gestor" no banco; o papel é auto-atribuído.
2. **Catracas: forja anônima de evento e auto-registro (ALTO, REPRODUZIDO).**
   `POST /controlid/push` é público e, com `CONTROLID_REQUIRE_TOKEN` desligado (default) e
   as catracas reais sem `caToken`/`anIpPermitido`, um anônimo na internet grava eventos de
   "acesso liberado" forjados na trilha de auditoria de qualquer catraca e enche `tb_Catracas`.
3. **CPF em múltiplos tenants tranca a pessoa para fora do login (ALTO, REPRODUZIDO).**
   `/auth/login`, `/auth/forgot-password` e `/auth/register-lookup` resolvem a pessoa por
   `findFirst(cpfHash)` sem tenant; sempre vence o menor id. Quem se cadastrou depois nunca
   loga, e um reset de senha atinge a conta do outro tenant.

Transversal: o isolamento de tenant continua **opt-in e repetido** (`request.user.idCliente`
em 229 pontos; `getTenantId()` é código morto, 0 usos; os guards `requireGestor`/
`requireEmployee`/`requireSuperAdmin` também têm 0 usos). O mapa de permissões cobre as 320
rotas hoje (rodei o teste que o projeto não tem — 0 rotas `unmapped`), mas nada impede a
próxima rota de vazar.

---

## 2. Achados

### CRÍTICO

#### C-1. Qualquer funcionário vira "gestor" com poder total, pulando o RBAC
| | |
|---|---|
| **Severidade + confiança** | Crítico · REPRODUZIDO |
| **STATUS** | ✅ **CORRIGIDO 2026-09-09** (Opção 1 — gestor respeita o RBAC do próprio perfil). Ver "Correção aplicada" ao fim do achado. |
| **Local** | `apps/api/src/modules/auth/routes.ts:562-651` (emissão) · `apps/api/src/plugins/auth.ts:150` (bypass) |

**Cenário.** O papel `gestor` não deriva de nenhum atributo do funcionário no banco — não
existe `boGestor`/`idPerfil == gerente`. O `/auth/gestor-login` só exige: CPF+senha de um
funcionário válido e `idCliente` igual ao da empresa dele (linha 609). Qualquer funcionário
sabe o próprio `idCliente` — ele volta no `/auth/login` normal. O token emitido tem
`role: 'gestor'` e a resposta traz `permissions: [...ALL_PERMISSIONS]` (linha 650). No hook
de autorização, `role === 'gestor'` **não entra** no bloco de RBAC (`auth.ts:150` só checa
`role === 'employee'`), então nenhuma permissão é verificada.

Reproduzido com o funcionário `AUDIT A Recepcao` (perfil `AUDIT-A-Minimo`, só `students.read`):

```
# via /auth/login (perfil mínimo) — negado, como esperado:
GET /access-profiles     -> 403
GET /payment-accounts    -> 403
GET /employees           -> 403
GET /reports/overview    -> 403

# MESMAS credenciais via /auth/gestor-login (idCliente=1):
#   resposta: permissions(qtd)=38, role no JWT = "gestor"
GET /access-profiles     -> 200
GET /payment-accounts    -> 200
GET /employees           -> 200
GET /reports/overview    -> 200

# e ESCRITA — criou um perfil de acesso com todas as permissões:
POST /access-profiles {"dsPerfil":"AUDIT-ESCALADO-TOTAL","permissoes":[...]} -> 201
# leu PII de todos os alunos (CPF em claro incluído):
GET /students?take=2 -> 200  (nmAluno, caCPF, anEmail, endereço...)
```

**Impacto.** Colapso do modelo de permissões dentro do tenant. Um professor, um estagiário
de recepção ou um funcionário recém-desligado cujo perfil foi zerado (mas o usuário não
inativado) lê e altera financeiro, contas de recebimento (chave Pix/gateway), folha de
funcionários, perfis de acesso e a PII de todos os alunos. É contido ao próprio tenant
(gestor-login exige credencial válida naquele `idCliente`), então não é cross-tenant — mas
anula o RBAC inteiro, que é a defesa principal do produto.

**Correção.** O papel `gestor` precisa de base no banco. Concretamente: (a) uma coluna
`Funcionario.boGestor` (ou um perfil marcado como "gestão total") e `/auth/gestor-login`
recusa quem não a tem — respondendo o mesmo 401 genérico para não virar oráculo; **ou**
(b) eliminar o papel `gestor` como bypass e fazer o "gestor" ser um perfil de acesso comum
com todas as permissões concedidas, sujeito ao mesmo hook. A opção (b) remove o caso
especial de `auth.ts:150` e faz `role` deixar de ser um nível de privilégio. Enquanto isso
não existe, `/auth/gestor-login` é uma porta de administração aberta a qualquer funcionário.
| **Esforço** | M |

**Correção aplicada (2026-09-09).** Escolhida a opção (b) — o papel `gestor` deixou de ser
bypass. Duas mudanças:
- `apps/api/src/plugins/auth.ts:150` — o RBAC passou de `role === 'employee'` para
  `role !== 'student'`: gestor e funcionário respondem ao mesmo hook, que lê as permissões do
  perfil no banco a cada request. Só `superAdmin` (SOLS, cross-tenant) mantém bypass.
- `apps/api/src/modules/auth/routes.ts` — `/auth/gestor-login` passou a incluir o
  `perfilAcesso` na consulta e a devolver `permissions`/`perfilAcesso` **reais** do perfil,
  não mais `[...ALL_PERMISSIONS]` (import removido). Alinha-se ao que `/auth/verify` já
  retornava, e ao menu do web (que já monta pelo verify).

Validação em runtime (API reiniciada): funcionário de perfil mínimo (`students.read`) via
gestor-login → **403** em `/access-profiles`, `/payment-accounts`, `/employees`,
`/reports/overview` e no `POST /access-profiles`, e **200** em `/students` (o que o perfil
concede). Gerente legítimo (perfil "Gerente", 38 permissões) → **200** em tudo e **201** ao
criar perfil (sem regressão). `pnpm --filter @smartgym/api test`: 314/314 passam; typecheck
limpo. **Atenção operacional:** com esta correção todo gestor precisa ter um perfil de acesso
que conceda o que ele deve alcançar — um "gestor" sem perfil (ou com perfil restrito) perde o
acesso amplo que o bypass dava. Na base atual os 3 gestores reais têm o perfil "Gerente"
(todas as permissões), então nenhum foi afetado; **conferir isto na produção antes do deploy.**

---

### ALTO

#### A-1. `POST /controlid/push` público: forja anônima de eventos e auto-registro de catraca
| | |
|---|---|
| **Severidade + confiança** | Alto · REPRODUZIDO |
| **STATUS** | ✅ **CORRIGIDO 2026-09-09** (Opção "exigir prova quando houver + alertar"). Ver "Correção aplicada" ao fim do achado. Refinamento pendente: teto de auto-registro ainda global (ver nota). |
| **Local** | `apps/api/src/modules/controlid/routes.ts:1459-1560` · `:526-565` (auto-registro) · `:1512` (token) |

**Cenário.** A rota está na allowlist pública (o firmware não manda JWT). A autenticação por
device tem três estados e **todos falham abertos por padrão**: `anIpPermitido` vazio ⇒ sem
restrição de IP (`:133-140`); `caToken` vazio ⇒ aceita sem token, a menos que
`CONTROLID_REQUIRE_TOKEN === 'true'` — que é **desligado por default**. Na base, as duas
catracas reais estão sem token e a id=1 também sem IP permitido. Um anônimo:

```
# 1) auto-registra uma catraca nova (enche tb_Catracas até o teto de 50):
POST /controlid/push {"device":{"serial":"AUDIT-FAKE-0001","mac":"AA:BB:CC:00:00:01"}} -> 200

# 2) forja "acesso liberado" (event=7) para user_id arbitrário:
POST /controlid/push {"device":{"serial":"AUDIT-FAKE-0001"},
  "access_logs":[{"id":987654,"time":...,"event":7,"user_id":1000013}]} -> {"persisted":1}

# 3) na CATRACA REAL (serial 0G0200/005B6D, empresa 2, sem token/IP):
POST /controlid/push {"device":{"serial":"0G0200/005B6D"},
  "access_logs":[{"event":7,"user_id":999999}]} -> {"persisted":1}
```

Confirmado no banco: `tb_CatracaEventos` ids 196–198 gravados com `boAcessoLiberado=true`,
`anIpOrigem=127.0.0.1`, ligados às catracas 3, 4 e **à catraca real id=1**. O parser
permissivo (`text/plain`) também aceita (`app.ts:85`).

**O que NÃO quebrou** (bom): `new_user_identified.fcgi` (a decisão que gira a catraca física)
exige device conhecido E escopa a busca de aluno por `idCliente` da empresa da catraca
(`online.ts:263-316`) — a porta **não abriu** para `user_id` falso (respondeu event 6).

**Impacto.** Contaminação da trilha de acesso, dos relatórios de frequência e do motor de
evasão de qualquer academia — a base sobre a qual a operação decide quem está inadimplente ou
sumido. Poluição de `tb_Catracas` (DoS de painel, teto de 50 por instalação inteira).
Não abre a porta física, mas corrompe o registro de quem entrou.

**Correção.** (a) Ligar `CONTROLID_REQUIRE_TOKEN` por padrão e provisionar `caToken` em toda
catraca (a auto-registrada nasce sem token → passa a ser recusada até ativação manual, que é
o comportamento desejado). (b) Exigir `anIpPermitido` para persistir evento, não só para
autorizar. (c) Escopar o teto de auto-registro por tenant/rede, não global. Decisão de
negócio: a rede aceita operar catraca sem token durante o provisionamento? Se sim, limitar a
janela por tempo.
| **Esforço** | M |

**Correção aplicada (2026-09-09).** Escolhida a postura "exigir prova quando houver + alertar
quando não houver" (não derruba catracas que ainda não têm token/IP). Mudanças, com helpers
compartilhados em `controlid/events.ts` (`catracaEmOperacao`, `alertarSePosturaFraca`) usados
pelos dois fluxos de device:
- **A-1a — evento só entra na trilha de catraca ativada.** `handleControlidPushRequest` e
  `handleControlidResultRequest` (`controlid/routes.ts`) passaram a descartar os eventos
  (persisted:0 + log) quando a catraca não está em operação (`idEmpresa == null` — fantasma
  auto-registrada — ou `boInativo`). Fecha o "auto-registra e despeja evento forjado". A
  metadata (`dtUltimoPush`) ainda é atualizada, para o gestor ver e reivindicar o equipamento.
- **A-1b — alerta de postura fraca.** Quando uma catraca **ativada** aceita push/identificação
  sem `caToken` **nem** `anIpPermitido` configurados, registra `WARN` nomeando a catraca. A
  exigência "quando houver" já existia (token/IP são validados quando configurados) e foi
  estendida ao modo online (`online.ts`), que tinha a mesma lacuna — lá a forja alcançava o
  **check-in de um aluno real** (bastava o `nrUsuarioCatraca` dele).

Validação em runtime (API reiniciada): (1) catraca fantasma nova e já existente
(`idEmpresa null`) e catraca inativa (`id=1`, `boInativo=true`) → **persisted:0** + log
"eventos descartados". (2) catraca AUDIT ativada sem token/IP → **persisted:1** + `WARN`
"aceita SEM prova de identidade". (3) após configurar `caToken` nela: push sem token → **401**,
com token errado → **401**, com token certo → **persisted:1**. (4) modo online: token exigido
quando configurado (401), device desconhecido e user inexistente → negado (event 6), porta não
abre. `pnpm --filter @smartgym/api test`: 314/314; typecheck limpo.

**Refinamento pendente (menor).** O auto-registro anônimo ainda cria a linha em `tb_Catracas`
(teto global de 50). Com A-1a a catraca fantasma virou inútil ao atacante (eventos
descartados), então sobra apenas poluição de painel + consumo do teto (DoS de baixo impacto,
já contido pelo rate limit de 120/min). Escopar/limitar o auto-registro por IP de origem fica
como refinamento; o gestor sempre pode cadastrar a catraca manualmente. **Ação operacional
recomendada:** provisionar `caToken` ou `anIpPermitido` nas catracas reais para a prova passar
a ser exigida — enquanto não houver, o `WARN` de postura fraca aponta quais faltam.

#### A-2. CPF em mais de um tenant: a pessoa do segundo tenant não consegue logar; reset atinge conta errada
| | |
|---|---|
| **Severidade + confiança** | Alto · REPRODUZIDO |
| **STATUS** | ✅ **CORRIGIDO 2026-09-09** (tenant pelo domínio + senha/email desambiguam). Ver "Correção aplicada" ao fim do achado. |
| **Local** | `apps/api/src/modules/auth/routes.ts:77-102` (login) · `:199-209` (forgot) · `:337-373` (lookup) |

**Cenário.** `Aluno` é `@@unique([idCliente, caCPFHash])` — o mesmo CPF pode existir em N
tenants **por desenho**. Mas todo o módulo de auth resolve a pessoa por
`findFirst({ where: { OR: [{ aluno: { caCPFHash } }, { funcionario: { caCPFHash } }] } })`
**sem filtro de tenant**, e `findFirst` sem `orderBy` devolve o menor id. Criei o mesmo CPF
(`77788899941`) como aluno no tenant 1 (usuário id 14) e no tenant 3 (usuário id 15), com
senhas diferentes:

```
POST /auth/login {"login":"77788899941","password":"SenhaTenant3#2026"} -> 401 (senha do tenant 3 recusada)
POST /auth/login {"login":"77788899941","password":"SenhaTenant1#2026"} -> 200, idCliente:1, "AUDIT DupCPF TENANT-1"
GET  /auth/register-lookup?type=student&cpf=77788899941 -> sempre a ficha do tenant 1
```

A pessoa do tenant 3 **nunca autentica** pelo app (login sempre roteia para o tenant 1);
`/auth/forgot-password` gera o token de recuperação para a conta do tenant 1; o
`register-lookup` sempre expõe o nome/e-mail mascarado do tenant 1. Se o atacante controla o
e-mail cadastrado na ficha do tenant 1, um reset dispara sobre a conta do outro tenant.

**Impacto.** Indisponibilidade de conta para titulares legítimos que treinam em duas
academias da mesma instalação; potencial de reset de senha atingindo a conta errada; o
`register-lookup` vira um de-para CPF→(nome, e-mail mascarado) do tenant de menor id. O
código já reconhece o vetor: o comentário em `students/routes.ts:458-464` descreve exatamente
o sequestro por troca de CPF e o mitiga no self-service — mas a raiz (lookup sem tenant)
permanece.

**Correção.** Decisão de negócio primeiro: **como o titular escolhe a academia no login?**
Opções: (a) login por CPF **+ seletor de academia** (como o gestor-login já faz com
`idCliente`), tornando o lookup `findFirst({ caCPFHash, idCliente })`; (b) resolver o tenant
pelo domínio de origem (como `/public/leads` e `/auth/theme` já fazem) e escopar o lookup por
ele; (c) desambiguar quando o `findFirst` retorna mais de um. Sem uma dessas, o modelo
"mesmo CPF em vários tenants" está apenas meio-implementado.
| **Esforço** | M |

**Correção aplicada (2026-09-09).** Combinação de (b) + (c): o tenant vem do **domínio de
acesso** (decisão do dono) e, entre os candidatos, a **senha/e-mail** desambiguam — o que
também cobre o app mobile, que não tem domínio (só descobre o `idCliente` pós-login).
`Usuario` já tem `idCliente` (migração 09/2026), então o escopo é direto. Um helper
`resolveTenantByDomain(caDominio)` resolve o cliente pelo `DominioCorporativo` ativo (mesma
disciplina de `/public/leads`: nunca por `idCliente` do corpo). Mudanças em
`apps/api/src/modules/auth/routes.ts` (+ `caDominio` nos tipos e no web `HomePage.tsx`):
- **`/auth/login`** — `findFirst` por CPF virou `findMany` (escopado ao cliente do domínio
  quando há um) e a senha decide qual conta: itera os candidatos e entra no primeiro cuja
  senha confere. `dummyVerify` preserva o timing quando não há candidato; `expired` (senha
  legada vencida) só decide se for a conta certa.
- **`/auth/forgot-password`** — `findMany` (escopado por domínio) + um link de recuperação
  **por conta**: cada tenant recebe o seu, resetando só a sua (antes um único e-mail ia para
  a conta de menor id).
- **`/auth/register-lookup`** e **`/auth/register`** — escopados por domínio; o `register`
  passou a `findMany` + casar a ficha **cujo e-mail confere** (a prova de titularidade), em
  vez de fixar a de menor id.
- **web** — `HomePage.tsx` envia `caDominio: window.location.hostname` no login, forgot,
  register e register-lookup. **mobile** — sem mudança: a senha desambigua.

Validação em runtime (CPF `77788899941` em tenant 1 e 3, senhas distintas; domínios de teste
`audit-a.local`→cli 1, `audit-b.local`→cli 3): (1) domínio B + senha do tenant 3 → **entra no
tenant 3** (antes: impossível); (2) domínio A + senha 1 → tenant 1; (3) domínio B + senha do
tenant 1 → **401** (escopo B não tem essa conta); (4) **sem domínio** + senha 3 → tenant 3;
(5) sem domínio + senha 1 → tenant 1; (6) senha errada → 401. register-lookup com domínio A/B
mostra a ficha do tenant certo; register sem domínio com o e-mail do tenant 3 criou a conta em
`idCliente=3` (não na de menor id). forgot-password **confirmado por leitura** (não disparado:
o SMTP configurado é de produção e o método proíbe envio externo real). `pnpm --filter
@smartgym/api test`: 314/314; typecheck da API e do web limpos.

**Nota de produto:** no web, "entrar pela página da academia X" agora **exige** ter conta na X
— um CPF que só existe na Y não loga pelo domínio da X (é o comportamento pedido). O mobile,
sem domínio, entra na conta cuja senha bate. Caso raríssimo (mesma senha em dois tenants, sem
domínio) resolve na de menor id.

#### A-3. Next.js com RCE crítico e nodemailer vulnerável; overrides de segurança prestes a sumir
| | |
|---|---|
| **Severidade + confiança** | Alto · CONFIRMADO (via `pnpm audit`) |
| **STATUS** | ✅ **CORRIGIDO 2026-09-09**: 2 críticos → 0, 58 → 32 vulns, superfície do servidor (apps/api) **limpa**. Ver "Correção aplicada". Descoberta: o bump do fastify forçou migrar a config de `trustProxy` (era vulnerável — ver nota). |
| **Local** | `apps/web` (next@15.5.21) · `apps/api` (nodemailer@9.0.3, fast-uri@3.1.4) · `package.json` (raiz) |

**Cenário.** `pnpm audit --prod`: **2 críticos, 41 altos, 15 moderados**. Os que tocam
superfície de produção: `next@15.5.21` com dois advisories **críticos** de RCE não
autenticado (otimização de imagem; variante Windows) — e o web é o proxy server-side que fala
com a API. `nodemailer@9.0.3` (patch em ≥9.1.1) com bypass de validação de domínio (entrega a
domínio do atacante) e DoS por parsing de endereço — no caminho de `/auth/forgot-password`.
`fast-uri@3.1.4` com SSRF/host-confusion (dependência do Fastify). O grosso dos 41 altos
(`@xmldom/xmldom`, `js-yaml`, `brace-expansion`, `browserslist`) está em `apps/mobile` e é
majoritariamente build-time.

Agravante de supply chain: ao subir a API, o pnpm avisa
`The "pnpm" field in package.json is no longer read by pnpm ... "pnpm.overrides" ... ignored`.
Os ~20 overrides de segurança (undici, ws, tar, fast-uri, postcss...) só sobrevivem porque
**já estão gravados no `pnpm-lock.yaml`**. Na próxima regeneração do lockfile com o pnpm
atual eles somem em silêncio, porque agora precisam morar em `pnpm-workspace.yaml`.

**Impacto.** RCE no front proxy; e-mail de reset entregável a domínio forjado; regressão
silenciosa de dezenas de pins de segurança no próximo `pnpm install` que atualize o lockfile.

**Correção.** (a) Subir `next` para a linha corrigida e `nodemailer` para ≥9.1.1. (b) Mover
o bloco `pnpm.overrides` de `package.json` para `overrides:` em `pnpm-workspace.yaml` e
regenerar o lockfile conferindo que os pins continuam. (c) Adicionar `pnpm audit` (ou
`--audit-level=high`) ao CI para travar merge. Alinhar `packageManager` (pnpm@10.33.2) com a
`dependency pnpm ^11.13.0` — hoje divergem.
| **Esforço** | M |

**Correção aplicada (2026-09-09).**
- **Bumps** (versões corrigidas confirmadas no lockfile após `pnpm install`): `next` `^15.5.24`
  → **15.5.25** (elimina os 2 RCE críticos), `nodemailer` `^9.1.1` → **9.1.1**, `fastify`
  `^5.12.1` → **5.12.3**. Os overrides apertados trouxeram `fast-uri` **3.1.7** (era 3.1.4,
  SSRF), `undici` **6.28.1**, `sharp` **0.35.4**, `brace-expansion`/`js-yaml` para as faixas
  corrigidas.
- **Overrides na moradia certa:** o bloco `pnpm.overrides` saiu do `package.json` (onde o pnpm
  10 o ignora) para `overrides:` no `pnpm-workspace.yaml`; o warning de "ignored" sumiu. A
  `dependency pnpm ^11.13.0` (erro) foi removida do `package.json` raiz — `pnpm install`
  removeu 145 pacotes por causa disso.
- **`trustProxy` (consequência do fastify 5.12 — mudança de SEGURANÇA, não só de tipo):** o
  hop-count numérico (`TRUST_PROXY_HOPS`) que o SmartGym usava **foi desabilitado no runtime**
  pelo fastify por causa de **CVE-2026-3635 / GHSA-3m5p-2c4r-xxw2** — ele não olha o endereço
  de conexão, então um atacante que alcança a origem por fora do proxy forjava `X-Forwarded-For`
  do mesmo jeito (a defesa que o item 7 do "endurecido" dava por consolidada estava, na
  verdade, furada). `app.ts` migrou para `TRUST_PROXY` = lista de **IP/CIDR do proxy** (ou
  presets `loopback,linklocal,uniquelocal`, ou `true`); vazio ⇒ `false` (seguro). Um `console.warn`
  avisa quem ainda tiver `TRUST_PROXY_HOPS` setado. `.env.example` atualizado.

Resultado (`pnpm audit --prod`): **58 → 32** vulnerabilidades, **2 críticos → 0**, **apps/api
sem nenhuma**. Validação: `pnpm --filter @smartgym/api test` 314/314; typecheck da API e do web
limpos; smoke test da API com fastify 5.12 (health 200, login OK, rate limit 10/min → 429).

**Rodada do mobile (2026-09-10): 32 → 4.** O Expo já estava no SDK 54 (o mais recente), então
o "upgrade de SDK" não era o caminho — as 31 do mobile eram transitivas do toolchain de build
(`@expo/cli`, `@expo/config-plugins`, metro), **sem superfície no runtime do app**, e eram 7
pacotes distintos em vários paths. Overrides de patch (mesma major) resolveram 5:
`browserslist` 4.28.9, `baseline-browser-mapping` 2.11.21, `nanoid` 3.3.18, `@xmldom/xmldom`
0.9.12, `decode-uri-component` 0.5.0. Validação do mobile: typecheck limpo, **jest-expo 30/30**
(exercita o transform). **Restam 3, sem correção viável:** `uuid@7` (preso ao
`@expo/config-plugins` do SDK 54 — só corrige em 11.x, salto de 4 majors que quebraria o Expo),
`image-size` (sem versão corrigida upstream), `deepmerge-ts` (db, patch só em 8.x, major
transitiva). Os três esperam o upstream (Expo/Prisma) atualizar — aceitos com justificativa.

**Ação operacional (produção atrás de proxy):** defina `TRUST_PROXY` com o IP/CIDR do
load balancer/PaaS — sem isso o `trustProxy` é `false` e o rate limit passa a agrupar todos os
clientes pelo IP do proxy (um único bucket).

**`pnpm audit` no CI — FEITO (2026-09-10).** `.github/workflows/ci.yml` roda
`pnpm audit --prod --audit-level=high` em push na master e em todo PR, travando o
merge em qualquer vulnerabilidade **nova** de produção high/critical. As 4 sem
correção viável hoje (`uuid@7`, `image-size` ×2, `deepmerge-ts`) foram listadas em
`auditConfig.ignoreGhsas` no `pnpm-workspace.yaml` — assim o gate não trava
eternamente nelas, mas volta a acusar se surgir uma nova. Reavaliar essas 4 quando
o upstream (Expo/Prisma) lançar correção; ao remover o pin, o CI já valida sozinho.

#### A-4. Sem trilha de auditoria: um vazamento é indetectável e não notificável (art. 37/48 LGPD)
| | |
|---|---|
| **Severidade + confiança** | Alto · CONFIRMADO |
| **STATUS** | ✅ **CORRIGIDO 2026-09-09** (trilha de PII + detecção `/reports/security-signals` + **alerta ativo por email** `shared/securityAlerts.ts`). **Retenção da trilha — mecanismo FEITO 2026-09-10** (`scripts/retention.ts` expurga `tb_Auditoria` além de `RETENTION_AUDITORIA_DIAS`; ver M-3 e `docs/retencao-expurgo.md`); resta o controlador definir o prazo. |
| **Local** | `packages/db/prisma/schema.prisma` (nenhum dos 80 models) |

**Cenário.** Nenhuma tabela registra quem **leu** o quê. Há `idUsuarioCadastro`/
`idUsuarioAlteracao` em alguns models (só o último a escrever, sem histórico), e `logger:
true` sem `redact` — mas o logger padrão do Fastify **não** grava corpo nem `Authorization`
(só método/url/status), então a reconstrução via log é parcial e efêmera. Não há alerta de
força bruta, de uso de token revogado, nem de webhook recusado persistido de forma
consultável.

**Impacto.** Conformidade (LGPD art. 37 — registro das operações; art. 48 — comunicação de
incidente): sem trilha, o controlador **não consegue dizer à ANPD nem ao titular o escopo de
um vazamento**. Dado o C-1 (qualquer funcionário lê toda a base de alunos), a ausência de
trilha de leitura é especialmente grave — um vazamento por dentro não deixa rastro.

**Correção.** Tabela de auditoria append-only (quem, quando, rota, recurso, tenant) alimentada
por um hook `onResponse` para as rotas que tocam PII; retenção definida por política. Decisão
de negócio: por quanto tempo reter o log de acesso. Alerta automático para os três eventos
(brute force, token revogado usado, webhook recusado).
| **Esforço** | G |

**Correção aplicada (2026-09-09).** Escopo escolhido: **dados pessoais, leitura + escrita**.
- **`model Auditoria`** (`tb_Auditoria`, migration `20260909124912_trilha_auditoria`, aplicada
  ao banco): append-only, **sem FK** para Usuario/Cliente de propósito (o registro sobrevive à
  remoção do ator e nunca é apagado em cascata). Colunas: `dtEvento`, `idUsuario`, `idCliente`,
  `cnPapel`, `cnMetodo`, `dsRota`, `nrStatus`, `anIp`, `dsResultado` — **só metadados, nunca o
  corpo/query** (a trilha não pode virar mais um depósito de PII). Índices por `dtEvento`,
  `(idCliente,dtEvento)`, `(idUsuario,dtEvento)`.
- **`plugins/audit.ts`** (com `shouldAudit` puro + teste `audit.test.ts`, 5 casos): hook
  `onResponse` global, **fire-and-forget** (a resposta já foi enviada — a trilha nunca a atrasa
  nem a derruba). Audita as rotas de titular (`/students`, `/employees`, `/leads`, `/clients`,
  `/companies/:id/children`, `/reports`, `/time-clock`, `/access/facial`, `/plan-requests`,
  `/notifications`, `/payments`, `/payment-accounts`, `/cashier`, `/controlid` de gestão), os
  eventos de credencial (`/auth/login|gestor-login|register|forgot|reset|change-password|
  logout`) e **toda tentativa negada (401/403)**, mesmo fora desses prefixos. Catálogos
  (`/plans`, `/exercises`, lookups) e `/auth/me|verify` ficam de fora para não inundar.
- **`plugins/auth.ts`** marca `request.auditReason` para a trilha distinguir um 401 de
  `sessao_revogada` / `conta_inativa` / `conta_inexistente` / `token_invalido` — o gancho para
  detectar uso de token vazado.

Validação em runtime (trilha recém-criada): `GET /students/491` → registro com `idUsuario=16,
cnPapel=gestor, 200` (**quem leu o cadastro do aluno**); `GET /employees` por perfil mínimo →
`403` com ator (**tentativa negada**); `POST /auth/login` errado → `401` anônimo (**brute
force detectável por IP+tempo**); token forjado em `/students/491` → `401` com
`dsResultado=token_invalido`. `GET /plans 200` e `/health` **não** entraram. Testes: 319/319
(21 suítes); typecheck limpo.

**Pendências (decisão de negócio, não bloqueiam a trilha):** (1) **retenção** — a coluna
`dtEvento` está indexada para o expurgo, mas por quanto tempo guardar o log de acesso é decisão
do controlador (o financeiro tem obrigação legal própria; o log de acesso, não); a rotina de
expurgo não foi automatizada. (2) **alerta ativo** — ~~hoje a detecção é forense~~ **DETECÇÃO
CONSULTÁVEL FEITA 2026-09-09**: `GET /reports/security-signals` (`modules/reports/security.ts`),
restrito ao super-admin, agrega a trilha e lista IPs em brute force (falhas de login), uso de
sessão/token revogado, acessos negados (403) por usuário e webhooks recusados. Validado em
runtime (brute force de 7 falhas de um IP detectado; 403 do não-super-admin barrado e
registrado). **Notificação ativa por email FEITA 2026-09-09**: `shared/securityAlerts.ts`,
disparado pelo hook de auditoria (fire-and-forget), envia email (SMTP do reset) em brute force
(IP cruza o limiar `SECURITY_ALERT_LOGIN_THRESHOLD` na janela) e uso de sessão revogada, com
throttle em memória. Desligado por padrão (`SECURITY_ALERT_EMAIL` vazio = no-op); validado com
SMTP inválido (gatilho dispara, nada sai).
(3) **ator no login bem-sucedido** — o registro de `POST /auth/login 200` sai com ator nulo
(no login o request ainda é anônimo); correlaciona-se por IP+tempo com o acesso seguinte, mas
gravar o `idUsuario` autenticado seria um refinamento.
| **Esforço** | G |

---

### MÉDIO

#### M-1. Isolamento de tenant é opt-in em 229 pontos, sem rede de proteção
| | |
|---|---|
| **Severidade + confiança** | Médio · CONFIRMADO |
| **STATUS** | 🟢 **FASE 1 FEITA + FASE 2 (RLS) APLICADA E PROVADA 2026-09-10**. Fase 1 (rede de proteção): `plugins/tenantScope.test.ts`; `getTenantId` removido. **Fase 2 (RLS):** role `smartgym_app` (sem BYPASSRLS) + `ENABLE RLS`/política nas 16 tabelas na base de dev, com o usuário autorizando; **isolamento provado** (sem `app.tenant` → 0; `=1` → 250 alunos; `=3` → 3; owner → 253). SQL idempotente em `packages/db/scripts/rls-tenant.sql`; detalhes e runbook em `docs/isolamento-tenant-rls.md`. **Dormant para o app** (conecta como owner/bypassrls → funciona sem mudança); **protege** quando o app usar `smartgym_app` + `SET LOCAL app.tenant` — passo de staging (muda o modelo de conexão), ainda não feito. |
| **Local** | transversal · `apps/api/src/plugins/auth.ts:197` (`getTenantId` morto) |

**Cenário.** Só 15 dos 80 models têm coluna `idCliente`; os outros 65 alcançam o tenant pelo
pai ou por `empresa.idCliente`, sempre por filtro manual repetido à mão. `getTenantId()` e os
guards `requireEmployee`/`requireGestor`/`requireSuperAdmin` têm **zero usos** (código morto).
Uma rota nova que esqueça o `where: { idCliente }` vaza entre academias sem que nada acuse.
As correções de 09/2026 fecharam os casos conhecidos um a um; a causa (escopo opt-in)
permanece.

**Impacto.** Cada rota futura é uma chance de vazamento cross-tenant silencioso. É a dívida
estrutural por trás de todos os achados de IDOR já corrigidos.

**Correção (proponho o mecanismo).** Prisma Client Extension (`$extends` com `query` hook)
que injeta `idCliente` no `where` de todo `findMany/findFirst/update/delete` para os models de
tenant, lendo o tenant de um `AsyncLocalStorage` populado no hook `onRequest`. Custo: os
models filhos (sem `idCliente`) não são cobertos automaticamente — precisam de `idCliente`
denormalizado ou de a extensão navegar pelo pai (mais caro). Alternativa mais barata e
incremental: um teste que percorre as 320 rotas e falha se um handler de tenant não
referenciar `request.user.idCliente` — não prova corretude, mas pega o esquecimento óbvio.
Alternativa mais forte e mais cara: Postgres Row-Level Security por `idCliente` com
`SET LOCAL app.tenant` por request — defesa no banco, independente do ORM.
| **Esforço** | G |

#### M-2. Sem teste de cobertura permissão×rota; prefixo herda regra em silêncio
| | |
|---|---|
| **Severidade + confiança** | Médio · CONFIRMADO |
| **STATUS** | ✅ **CORRIGIDO 2026-09-09**: teste `plugins/routeCoverage.test.ts` fixado (instancia o app real, percorre `printRoutes`, falha se alguma rota ficar `unmapped`). |
| **Local** | `apps/api/src/plugins/permissions.ts:198-307` |

**Cenário.** Rodei a varredura que o projeto não tem (extraí as 320 rotas via
`printRoutes` e apliquei `requiredPermission` a cada uma): **0 rotas `unmapped`** hoje — a
cobertura está boa **neste instante**. Mas não há teste que trave isso, e o próprio código
avisa: uma rota nova sob um prefixo existente (ex.: `/students/...`) herda a permissão do
prefixo (primeira regra que casa vence) sem ninguém perceber. Ex.: uma futura
`/students/:id/export-tudo` cairia em `students.read`, permissão trivial de conceder.

**Impacto.** Regressão silenciosa de autorização a cada rota nova.

**Correção.** Fixar como teste de CI o script de cobertura (percorrer `app.printRoutes`,
afirmar `requiredPermission !== unmapped` e que cada rota tem regra **intencional** numa lista
explícita — não só "alguma regra casou"). Já deixei o esqueleto do script rodando nesta
auditoria.
| **Esforço** | P |

**Correção aplicada (2026-09-09).** `plugins/routeCoverage.test.ts`: instancia o app real (env
de fachada, sem conectar a nada), extrai as rotas de `app.printRoutes()` e afirma, para cada
uma, que está coberta por regra intencional — pública (allowlist exportada de `auth.ts`),
alcançável pelo aluno (`isStudentAllowed`) ou mapeada a permissão (`requiredPermission !==
unmapped`). Usa o app real, não uma lista curada, para enxergar rotas novas automaticamente.
Passou verde (>200 rotas, 0 unmapped). **Plugado no CI (2026-09-10):**
`.github/workflows/ci.yml` roda os testes da API (`pnpm --filter @smartgym/api test`,
incluindo esta cobertura e a rede de tenant do M-1) e do mobile em push/PR — a
regressão de autorização passa a quebrar o build.

#### M-3. Sem direitos do titular e sem consentimento — inclusive para biometria (art. 11 e 18)
| | |
|---|---|
| **Severidade + confiança** | Médio · CONFIRMADO |
| **STATUS** | 🟢 **AMPLIADO 2026-09-09 / 2026-09-10**: exportação (art. 18) + consentimento (art. 8/11) + **anonimização** (art. 18 VI, decisão: manter financeiro) + **gate ligado** (biometria/push exigem consentimento) + **retenção/expurgo (mecanismo)** + **tela de captura (app do aluno + ficha web)**. Restam por decisão: prazos de retenção, bases legais, menores (art. 14), texto do termo. |
| **Local** | schema (nenhuma tabela de consentimento) · `students/routes.ts` (biometria facial) |

**Cenário.** Não há endpoint de exportação, eliminação, anonimização ou portabilidade, nem
tabela de consentimento. A biometria facial (`tb_AlunoBiometriasFaciais`, embedding em
AES-256-GCM — bom) é **dado sensível (art. 11)** e exige consentimento **específico e
destacado**, que não existe. Idem para push/comunicação e para os dados de avaliação física
(`vlPercentualGordura`, `vlMassaMagra`... — dado de saúde a depender do uso). Detalhe LGPD:
academias matriculam adolescentes (art. 14 — dado de menor exige consentimento do
responsável), sem tratamento previsto.

**Impacto.** Conformidade. Sem base legal registrada para a biometria e sem caminho técnico
para os direitos do art. 18.

**Correção.** Ver o Capítulo LGPD abaixo. Decisão de negócio: bases legais por finalidade e
política de retenção do ex-aluno.
| **Esforço** | G |

**Correção aplicada (2026-09-09) — núcleo técnico.**
- **Exportação (art. 18, II acesso + V portabilidade):** `GET /students/:id/lgpd-export`
  (`students/routes.ts`) reúne num JSON a ficha (CPF decifrado), planos, avaliação física,
  treinos, check-ins, pontos, avisos, solicitações, eventos de catraca e o **metadado** da
  biometria — nunca o vetor. Escopado por tenant; o próprio aluno exporta os seus (o
  `studentRbac` já libera o GET do dono), a equipe a pedido (students.read). Validado: aluno
  exporta os seus, recebe **403** ao tentar o de outro aluno.
- **Consentimento (art. 8 e art. 11):** `model Consentimento` (`tb_Consentimentos`, migration
  `20260909133852_consentimento_lgpd`), **append-only** (histórico de concessão/revogação por
  finalidade — rastreabilidade art. 37). `GET/POST /students/:id/consents`: o titular
  concede/revoga biometria/push/comunicação pelo app (`studentRbac` libera o POST do dono).
  Validado: conceder biometria (201), revogar push (201), finalidade inválida (400), GET
  devolve estado atual + histórico. Testes: 321/321; typecheck limpo.

**Ampliação (2026-09-09) — decisões do dono tomadas e implementadas:**
- **Eliminação por ANONIMIZAÇÃO (art. 18, VI)** — decisão: anonimizar mantendo o financeiro.
  `POST /students/:id/anonymize` (students.write): apaga PII e dado sensível (biometria local
  **+ no CompreFace**, avaliação física, arquivos no storage), embaralha a identidade da ficha
  e encerra as sessões, mas **preserva planos/pagamentos** (retenção fiscal). Serviços externos
  best-effort fora da transação; pendências vão para o log e a resposta. Validado: 494
  anonimizado (PII zerada); 404 para aluno de outro tenant.
- **Gate de consentimento LIGADO** — decisão: bloquear. `shared/consent.ts` + `assertConsent`
  no enroll/criação de biometria (art. 11) e filtro no envio de push (art. 8). Kill-switch
  `CONSENT_ENFORCEMENT=false` para a janela sem a tela de captura (default: ligado). Validado:
  aluno sem consentimento → biometria bloqueada; com consentimento → grava. Teste unitário do
  helper (kill-switch + estado).

**Retenção / expurgo automático — MECANISMO FEITO (2026-09-10).** O motor de expurgo em lote
existe: `apps/api/src/scripts/retention.ts` reusa a **mesma** anonimização da rota (extraída
para `apps/api/src/shared/anonymize.ts`, agora chamada pelos dois caminhos), roda em **dry-run
por padrão** (só conta/lista sem escrever), tem guardas de prazo mínimo (recusa `--aluno-dias<365`
e `--auditoria-dias<90`) e escopo por tenant/limite. Faz duas coisas: (1) anonimiza ex-alunos
inativos, ainda com PII e sem plano vigente, parados há mais que `RETENTION_ALUNO_DIAS`;
(2) expurga `tb_Auditoria` mais antiga que `RETENTION_AUDITORIA_DIAS` (em lotes por id) — isso
fecha também o resíduo de retenção da trilha do **A-4**. Provado em dry-run contra o Neon de dev
(253 alunos / 49 linhas de trilha, 0 elegíveis hoje — dado recente). Runbook e a política em
`docs/retencao-expurgo.md`. **O que resta é decisão sua:** os PRAZOS (jurídico) — o código não os
decide; os defaults (5 anos / 2 anos) são piso conservador, não recomendação legal.

**Tela de captura de consentimento — FEITA (2026-09-10).** As duas superfícies existem, então a
janela do kill-switch fechou: (1) **app do aluno** — `apps/mobile/app/(aluno)/consentimentos.tsx`
(autoatendimento do titular, toggles por finalidade, acessível pelo menu "Mais › Privacidade");
(2) **ficha da equipe (web)** — `apps/web/src/features/students/StudentConsentPanel.tsx`, montado
no `StudentRegistration` (captura na recepção com o titular presente). Ambos batem nas 3
finalidades do backend (`biometria_facial`, `push`, `comunicacao_email`), gravam `dsVersaoTermo='v1'`
(texto genérico, refinar com o jurídico) e usam o `GET/POST /students/:id/consents` já existente.
**Ação operacional:** remover qualquer `CONSENT_ENFORCEMENT=false` de produção — o gate volta a
valer (alunos sem consentimento têm biometria/push bloqueados até consentirem, que é o correto).

**Ainda por decisão de negócio (não implementado):**
- **Bases legais por finalidade** (jurídico) e **menores de idade (art. 14)** — consentimento
  do responsável para adolescentes.
- **Texto do termo por finalidade** — hoje genérico `v1`; o jurídico refina e sobe a versão.
- **Tela de captura do consentimento** no cadastro/app (o backend já aceita; enquanto não vier,
  `CONSENT_ENFORCEMENT=false` evita bloquear a operação).

#### M-4. Reset de senha por e-mail vulnerável a account-takeover se a caixa for comprometida; sem 2º fator
| | |
|---|---|
| **Severidade + confiança** | Médio · CONFIRMADO |
| **STATUS** | ⏸️ **RISCO ACEITO 2026-09-09** (decisão do dono). A parte cross-tenant foi removida pelo A-2; o resíduo (quem lê a caixa reseta a conta) é aceitável para o porte, sem MFA. Reavaliar se o financeiro do aluno passar a ser tratado como sensível. |
| **Local** | `apps/api/src/modules/auth/routes.ts:187-315` |

**Cenário.** O fluxo em si é sólido: token de 256 bits, só o SHA-256 no banco, expiração de
1h, uso único, invalidação dos anteriores, e `nrTokenVersion++` revoga sessões vivas. O
resíduo é o de sempre: quem lê a caixa do titular reseta a conta. Combinado com A-2 (lookup
sem tenant), um reset pode atingir a conta do tenant errado. O auto-cadastro (`/auth/register`)
prova titularidade por **CPF + e-mail da ficha** — resiste a quem só tem o CPF, mas **não** a
quem tem uma base vazada de CPF+e-mail (comum no Brasil) ou acesso à caixa.

**Impacto.** Comprometimento de conta individual mediante acesso ao e-mail. Sem MFA, o e-mail
é fator único.

**Correção.** É risco aceito para o porte do produto; documentar. Se o financeiro do aluno
(gerar cobrança Pix) for considerado sensível, avaliar 2º fator no app. Sanar A-2 remove a
parte cross-tenant.
| **Esforço** | M |

#### M-5. Service-role key do Supabase na API, sem segregação de bucket/path por tenant
| | |
|---|---|
| **Severidade + confiança** | Médio · PLAUSÍVEL → **REBAIXADO** (investigado 2026-09-09) |
| **STATUS** | ⚠️ **SEM FURO ATIVO** — as 15 rotas de signed URL escopam por tenant; prefixo por path fica como defesa-em-profundidade de baixa prioridade (ver nota). |
| **Local** | `apps/api/src/shared/supabase.ts` · `files.ts` |

**Cenário.** A API usa a service-role key (bypassa RLS do Storage). As URLs assinadas expiram
em 1h (bom), e o upload valida magic bytes com SVG fora da allowlist (bom). O que não
confirmei: se os paths de arquivo embutem o tenant e se um `anCaminho` adulterado no banco
poderia gerar signed URL de arquivo de outro tenant. Como todo acesso a arquivo passa por
uma consulta escopada por `idCliente` antes de assinar, o risco é indireto — mas a chave é
única e sem segregação.

**Investigação (2026-09-09).** Varri as **15** chamadas `createSignedUrl`/`download` do
`apps/api/src`: todas carregam o registro (`alunoArquivo`, `funcionarioArquivo`,
`empresaArquivo`, `promocaoArquivo`, `produtoArquivo`…) por um `findFirst` **escopado ao
tenant** — direto (`empresa: { idCliente }`) ou pelo pai (`findTenantStudent`/
`findTenantEmployee` antes), e o `anCaminho` vem sempre do banco, nunca do cliente (sem path
traversal). **Não há furo ativo de cross-tenant em arquivos.** O risco residual da
service-role key é o mesmo do M-1: uma rota FUTURA que esqueça o escopo. Prefixar todo path
por `idCliente/` continua valendo como defesa-em-profundidade, mas: (a) não corrige nenhuma
vulnerabilidade atual, e (b) exigiria migrar os arquivos já armazenados. Fica como melhoria de
baixa prioridade, subsumida pelo mecanismo do M-1.

**Impacto.** Uma falha de escopo em qualquer rota de arquivo vira leitura de mídia de outro
tenant. Raio de dano da service-role key é o storage inteiro.

**Correção.** Prefixar todo path por `idCliente/` e validar o prefixo contra o tenant do
token antes de assinar; avaliar buckets por ambiente. Confirmar que nenhum `anCaminho` vem do
cliente sem normalização (path traversal).
| **Esforço** | M |

#### M-6. `PII_ENCRYPTION_KEY` única para PII e credenciais de gateway, sem rotação
| | |
|---|---|
| **Severidade + confiança** | Médio · CONFIRMADO |
| **STATUS** | ✅ **CORRIGIDO 2026-09-09**: script de rotação `packages/db/scripts/rotate-pii-key.ts` + procedimento em `docs/rotacao-chave-pii.md`. Ver "Correção aplicada". |
| **Local** | `apps/api/src/shared/pii.ts:16-28` · `secrets.ts:20-29` |

**Cenário.** `pii.ts` e `secrets.ts` derivam subchaves distintas por HKDF (`info` diferente)
da **mesma** env mestre — bom design (quem decifra CPF não decifra token de gateway). Mas a
env é única e não há procedimento de rotação: trocar a chave exige re-encriptar tudo, e o
código não tem esse caminho. O modelo de ameaça está corretamente documentado (`secrets.ts:12`
— protege contra dump de banco, não contra quem tem a env).

**Impacto.** Sem rotação, um vazamento da env (ou de um backup que a inclua) compromete PII e
credenciais de dinheiro sem caminho de recuperação.

**Correção.** Documentar o procedimento de rotação (versionar o prefixo `enc:v1:` já ajuda —
já existe) e escrever o script de re-encriptação antes de precisar dele. Avaliar env dedicada
para credenciais de gateway (a troca é uma linha em `getKey()`, como o próprio comentário diz).
| **Esforço** | M |

**Correção aplicada (2026-09-09).** `packages/db/scripts/rotate-pii-key.ts`: script standalone
que decifra com a chave ANTIGA e re-cifra com a NOVA (as duas ao mesmo tempo, que o `pii.ts` não
suporta), e **recalcula os hashes de CPF** (que derivam da chave). Cobre `Aluno`/`Funcionario`
(`caCPF`+`caCPFHash`), `AlunoBiometriaFacial` (`anEmbedding`) e `ContaRecebimento`
(`caChavePix`, `caCredencial`). **Idempotente/retomável** (usa a auth tag do AES-GCM para pular
o já migrado). Validado: dry-run contra a base detectou 13 alunos + 6 funcionários cifrados
(decifrou com a chave real); round-trip provado isolado (re-cifra com nova chave → decifra de
volta ao original; hash rotaciona). Procedimento (backup → downtime → dry-run → `--apply` →
trocar env → validar) em `docs/rotacao-chave-pii.md`. **Pendências (decisão):** rotação sem
downtime (exigiria o `pii.ts` conhecer duas chaves) e env dedicada para credenciais de gateway
— ambas descritas no doc.

---

### BAIXO

- **B-1. `/auth/theme` público sem rate limit próprio — ✅ CORRIGIDO 2026-09-09.** Adicionado
  `themeRateLimit` (30/min por IP) na rota. Validado em runtime: lote de 35 → 429. Cobre o
  carregamento normal da página (o web chama no boot) e corta o abuso de gerar signed URLs.
- **B-2. Sem `bodyLimit` explícito e sem `setNotFoundHandler` — ✅ CORRIGIDO 2026-09-09.**
  `app.ts`: `bodyLimit: 1 MB` explícito (uploads vão por multipart, limite próprio de 10 MB) e
  `setNotFoundHandler` que responde `{message:'Recurso nao encontrado.'}` no lugar do
  `"Route GET:/x not found"`. Runtime: rota inexistente sob prefixo mapeado → 404 genérico;
  rota totalmente desconhecida → 403/401 (deny-by-default do RBAC / auth), sem enumerar.
- **B-3. Rate limit em memória não sobrevive a múltiplas instâncias (BAIXO, CONFIRMADO)** —
  `app.ts`. `@fastify/rate-limit` sem store externo: com 2+ réplicas, o limite de
  10/min do login é por instância. **NÃO corrigido** — exige infra (Redis). Só relevante ao
  escalar horizontalmente; documentar como pré-requisito desse momento.
- **B-4. `fetch` sem timeout em geocode e CompreFace — ✅ CORRIGIDO 2026-09-09.**
  `AbortSignal.timeout` adicionado: 8 s no geocode (`localities/routes.ts`) e 15 s no CompreFace
  (`compreface.ts`). Asaas e Expo Push já tinham. Sem SSRF (hosts fixos/env).
- **B-5. "Criptografia" da sessão no web usa chave embutida no bundle (BAIXO, CONFIRMADO)** —
  `apps/web/src/shared/auth/sessionUtils.ts:56`. A sessão em `localStorage` é AES-GCM com
  passphrase hardcoded no JS — é ofuscação, não segurança. O usuário pode virar o flag
  `superAdmin` no próprio storage. **Não é vulnerabilidade** porque o servidor decide tudo a
  partir do JWT assinado (`boSuperAdmin` do banco) e o item 5 de "correções recentes" está
  correto — mas o rótulo "encrypted" na chave engana. **NÃO corrigido** (cosmético): resta
  renomear/comentar como ofuscação; nunca mover decisão de servidor para esse flag.

---

## 3. Capítulo LGPD

### 3.1 Inventário de dados pessoais (por campo, marcando sensíveis)

| Categoria | Campos | Sensível (art. 5º II) |
|---|---|---|
| Identificação do titular (Aluno/Funcionário) | `nmAluno`/`nmFuncionario`, `caCPF` (cifrado), `caCPFHash`, `dtNascimento`, `anEmail`, `nrDDD`/`nrContato` | Não (CPF é pessoal, não sensível) |
| Endereço | `anCEP`, `anLogradouro`, `nrEndereco`, `anBairro`, `anComplemento`, `geoEmpresa`/`geoLocalidade` | Não |
| **Biometria facial** (`tb_AlunoBiometriasFaciais`) | `anEmbedding` (cifrado), `dsSubject`, `dsExternalImageId`, foto em `AlunoArquivo` | **SIM (art. 11)** |
| **Avaliação física** (`tb_AlunoEvolucoes`) | `vlPeso`, `vlAltura`, `vlPercentualGordura`, `vlMassaMagra`, circunferências, foto | **Provável (dado de saúde, art. 11)** conforme finalidade |
| Acesso físico | `nrUsuarioCatraca`, `tb_CatracaEventos` (quem entrou, quando, onde) | Não, mas revela rotina/presença |
| Financeiro | `tb_Pagamentos`, chave Pix e credencial de gateway do aluno/academia (cifradas) | Não (dado pessoal + segredo) |
| Autenticação | `dsLogin`, `tb_Senhas` (bcrypt), `tb_RecuperacoesSenha` (hash), `UsuarioDispositivo.caTokenPush` | Não |
| **Menores de idade** | `dtNascimento` de aluno adolescente | **Regime especial (art. 14)** |

### 3.2 Bases legais por finalidade (art. 7º e 11)

| Finalidade | Base legal provável | Situação |
|---|---|---|
| Execução do contrato de matrícula (cadastro, cobrança, plano) | Execução de contrato (art. 7º V) | OK — inerente ao serviço |
| Controle de acesso por **biometria facial** | Consentimento específico e destacado (art. 11 II *a*) | **FALTA** — não há registro de consentimento nem alternativa não-biométrica documentada |
| **Avaliação física** (dados de saúde) | Consentimento / tutela da saúde (art. 11) | **FALTA** — sem consentimento registrado |
| Envio de push e comunicação de cobrança | Legítimo interesse / consentimento | **FALTA** consentimento específico para push/marketing |
| Dado de **menor** | Consentimento do responsável (art. 14 §1º) | **FALTA** — sem fluxo |

### 3.3 Direitos do titular sem nenhum caminho técnico hoje (art. 18)

| Direito | Existe? | O que construir |
|---|---|---|
| Confirmação e acesso | Parcial (`/auth/me` só do próprio, campos limitados) | Endpoint de exportação completa dos dados do titular |
| Correção | Parcial (self-service de contato/endereço) | — |
| Portabilidade | **Não** | Exportação em formato interoperável |
| Anonimização | **Não** | Rotina de anonimização (manter histórico financeiro sem PII) |
| Eliminação | **Não** (só `boInativo`, que mantém tudo) | Fluxo de expurgo com política de retenção |
| Revogação de consentimento (biometria!) | **Não** | Revogar consentimento + apagar embedding no CompreFace |

### 3.4 Minimização, retenção, segurança, compartilhamento

- **Retenção/expurgo:** não há política nem rotina. Ex-aluno (`boInativo=true`) mantém CPF,
  biometria, avaliações e histórico indefinidamente. **Decisão de negócio pendente:** por
  quanto tempo reter cada categoria após o cancelamento (o financeiro tem obrigação legal
  própria; biometria não).
- **Segurança (art. 46):** forte em repouso (AES-256-GCM para CPF/biometria/segredos, bcrypt,
  HKDF por finalidade). Fraco em rastreabilidade (sem trilha) e em controle de acesso interno
  (C-1 anula o RBAC).
- **Operadores / transferência internacional (art. 33):** Supabase, Neon, CompreFace, Asaas,
  Expo, SMTP. Neon (`sa-east-1`) e Asaas são BR; Supabase/CompreFace/Expo podem processar fora
  do país conforme configuração. **Falta:** mapa de sub-operadores e DPA/cláusulas com cada um.
- **Incidente (art. 48):** sem trilha (A-4), o controlador não consegue determinar nem
  comunicar o escopo de um vazamento.

---

## 4. Plano de ação em ondas (por risco ÷ esforço)

**Esta semana (risco alto, esforço baixo/médio):**
1. **C-1** — travar `/auth/gestor-login` a quem tem base de gestor no banco (ou eliminar o
   bypass do papel `gestor`). É o maior risco e o esforço é médio.
2. **A-1** — ligar `CONTROLID_REQUIRE_TOKEN=true` e provisionar `caToken`/`anIpPermitido` nas
   catracas reais (config + operação, não código).
3. **A-3** — bump de `next` e `nodemailer`; mover `pnpm.overrides` para `pnpm-workspace.yaml`
   e regenerar o lockfile; adicionar `pnpm audit` ao CI. ✅ **FEITO** (incl. CI 2026-09-10).
4. **M-2** — fixar o teste de cobertura permissão×rota no CI (esqueleto já roda).
   ✅ **FEITO** — teste + CI (2026-09-10).

**Este mês (risco alto/médio, esforço médio):**
5. **A-2** — decidir o login multi-tenant (seletor de academia ou tenant por domínio) e
   escopar os lookups de auth por tenant.
6. **A-4** — trilha de auditoria append-only para rotas de PII + alertas (brute force, token
   revogado, webhook recusado).
7. **M-5 / M-6 / B-1 / B-2 / B-4** — segregação de path por tenant no Supabase; documentar
   rotação de chave; rate limit próprio no `/auth/theme`; `bodyLimit` + `setNotFoundHandler`;
   timeouts em geocode/CompreFace.

**Este trimestre (estrutural):**
8. **M-1** — mecanismo que torne o esquecimento de tenant impossível (Prisma extension com
   `AsyncLocalStorage`, ou RLS no Postgres). Custo alto, paga a dívida de todos os IDORs.
9. **M-3** — consentimento (biometria, push, menores) + endpoints de direitos do titular
   (exportação, eliminação, anonimização) + política de retenção e rotina de expurgo.

---

## 5. O que não consegui verificar

- **Backfill com dados ambíguos.** A base tem um único cliente, então o backfill caiu 100% na
  regra de "cliente único" e não exercitou as pistas heurísticas (filiais → alunos → preços).
  O risco de "dono errado" numa instalação **multi-cliente** não foi testado — seria preciso
  uma cópia da base de produção multi-tenant para validar as pistas em cascata.
- **`next@15.5.21` realmente explorável.** O `pnpm audit` sinaliza 2 críticos, mas não
  confirmei se a versão instalada já contém o patch (o advisory pode listar a faixa sem
  refletir backports). Verificar contra o advisory exato antes de tratar como RCE ativo.
- **Path traversal / signed URL cross-tenant no Supabase (M-5).** Não montei o cenário com
  `anCaminho` adulterado; exigiria escrever um path malicioso no banco e observar a assinatura.
- **Timing/enumeração fina.** Confirmei o rate limit (10/min → 429) e as mensagens genéricas,
  mas não medi diferença de timing estatística entre conta existente e inexistente sob carga.
- **CompreFace/Asaas reais.** Não disparei contra os provedores externos (instrução do
  método); a lógica do webhook foi lida, não exercitada ponta a ponta com o Asaas.

---

## 6. Rastro deixado no banco (limpar depois)

Tudo prefixado `AUDIT`. Ordem de exclusão respeitando FKs: eventos/senhas/usuários →
alunos/funcionários/perfis → planos/treinos/promoções/atividades → empresa → cliente.

| Tabela | ids | Marcador |
|---|---|---|
| `tb_Clientes` | 3 | `AUDIT-ACADEMIA-B` |
| `tb_Empresas` | 11 | `AUDIT-B-Unidade` |
| `tb_PerfilAcessos` (+ permissões) | 5, 6, 7, 8 | `AUDIT-B-Minimo`, `AUDIT-A-Minimo`, `AUDIT-ESCALADO-TOTAL` (7 criado pelo PoC C-1), `AUDIT-GER-OK` (8 criado na validação da correção C-1) |
| `tb_Funcionarios` | 4, 5, 6 | `AUDIT B Recepcao`, `AUDIT A Recepcao`, `AUDIT Gerente Real` (6 criado para validar a correção C-1) |
| `tb_Alunos` | 490, 491, 492, 493, 494, 495 | `AUDIT Aluno B/A`, `AUDIT DupCPF TENANT-1/3`, `AUDIT RegDup T1` (494, cli 1) e `AUDIT RegDup T3` (495, cli 3) — mesmo CPF `44455566619` nos dois tenants, da validação A-2 |
| `tb_Usuarios` (+ `tb_Senhas`) | 11, 12, 13, 14, 15, 16, 17 | logins `audit-*` (16 = `audit-gerente@`, C-1; 17 = `audit-reg-t3@`, criado pelo register PoC do A-2, `idCliente=3`) |
| `tb_DominiosCorporativos` | 4, 5 | `audit-a.local`→cliente 1, `audit-b.local`→cliente 3 (criados para validar a resolução por domínio no A-2) |
| `tb_Auditoria` | vários | trilha **criada pela correção A-4** (migration `20260909124912_trilha_auditoria`); registros dos testes de runtime (login, GET /students/491, 403, token_invalido, e o próprio acesso ao lgpd-export/consents). Tabela nova — pode truncar para começar limpa em produção. |
| `tb_Consentimentos` | 1, 2 | **criada pelo M-3** (migration `20260909133852_consentimento_lgpd`); 2 registros de teste (aluno 491: biometria concedida, push revogado). Tabela nova. |
| `tb_Planos` | 10 | `AUDIT-PLANO-SECRETO-B` |
| `tb_Treinos` | 6 | `AUDIT-TREINO-B` |
| `tb_Promocoes` | 6 | `AUDIT-PROMO-B` |
| `tb_Atividades` | 14 | `AUDIT-ATIVIDADE-B` |
| `tb_Catracas` | 3, 4, 5, 6 | `AUDIT-FAKE-0001/0002/0010` (3,4,5 auto-registradas, `idEmpresa null`) e `AUDIT-ATIVA-0001` (6, criada na validação A-1b: `idEmpresa=2`, tem `caToken='AUDIT-TOKEN-SECRETO'`) |
| `tb_CatracaEventos` | 196, 197, 198, 199, 200, 201, 202 | forjados: 196→cat 3, 197→cat 4, **198+199→catraca REAL id=1** (user 999999, do PoC A-1 original); 200,201,202→cat 6 AUDIT (validação A-1b, user 222222) |

Observação: os eventos 198/199 estão na **catraca real id=1** (que está `boInativo=true`) — se
houver relatório de frequência/acesso rodando sobre a empresa 2, esses dois registros forjados
(`user_id 999999`) devem ser removidos junto. Após a correção A-1, novas tentativas de forja
nessa catraca (inativa) e nas fantasmas já são descartadas.
