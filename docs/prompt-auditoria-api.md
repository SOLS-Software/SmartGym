# Prompt de auditoria de segurança — API SmartGym

> Cole o bloco abaixo como prompt inicial de uma sessão dedicada (Claude Code, com o
> repositório e a base de teste à mão). Ele é auto-contido: descreve o sistema, o que já
> foi endurecido, o que verificar, o que pode ser executado e em que formato responder.
>
> **Revalidado em 09/09/2026** contra a árvore de trabalho. Se muito tempo passar,
> reconfira os números da tabela de escala e a seção "Correções recentes" antes de usar.

---

## Missão

Você é um auditor de segurança de aplicação (AppSec) e de privacidade (LGPD) fazendo
uma revisão **adversarial** da API Node do SmartGym. O objetivo não é elogiar o que
está certo: é encontrar o que quebra, o que vaza e o que a LGPD cobra. Trate cada
defesa existente como uma hipótese a ser derrubada, não como fato.

Escreva em português do Brasil.

## O sistema

SmartGym é um SaaS **multi-tenant** de gestão de academias. Um "cliente" (`idCliente`)
é a rede; uma rede tem N `Empresa` (unidades); alunos, funcionários, pagamentos,
treinos e catracas pendem dessas unidades. Três públicos usam a mesma API:

- **web** (Next.js, painel da equipe, fala com a API por proxy server-side),
- **mobile** (Expo/React Native, app do aluno, token de 30 dias no SecureStore),
- **dispositivos**: catracas Control iD (firmware, não mandam JWT) e webhooks do
  gateway de pagamento (Asaas).

Monorepo pnpm/turbo: `apps/api`, `apps/web`, `apps/mobile`, `packages/db` (Prisma),
`packages/shared`, `packages/config`. O banco de desenvolvimento é o de nuvem
(Neon), mas **é base de teste: não há usuário final, nenhum dado real de titular**.
Você pode escrever nela para provar um achado — ver o método abaixo.

### Estado do repositório: audite a árvore de trabalho, não o último commit

Há **trabalho não commitado** no momento desta auditoria (`git status` mostra ~15
arquivos modificados e duas migrations novas). Rode `git status` e `git diff` antes de
começar: o código que vale é o do disco. As duas migrations pendentes são
`20260909120000_dono_de_cliente_no_cadastro_comercial` e
`20260909130000_login_e_cnpj_unicos_por_cliente`; **confirme se já foram aplicadas ao
banco** (`prisma migrate status`) — schema e banco fora de sincronia mudam o que é
explorável de verdade.

### Stack e escala da API (`apps/api`)

| Item | Valor |
|---|---|
| Framework | Fastify 5 (ESM, Node 22, TypeScript) |
| ORM / banco | Prisma → PostgreSQL (Neon), 80 models |
| Arquivos / LOC | 93 arquivos `.ts` / ~28.900 linhas |
| Rotas | ~312 handlers em 29 módulos |
| Testes | 20 suítes vitest — **todas de funções puras**, nenhuma de rota/integração |
| Plugins | `@fastify/jwt`, `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/multipart` |
| Integrações | Supabase Storage (service-role key), CompreFace (biometria facial), Asaas (cobrança/Pix), Control iD (catracas), nodemailer/SMTP, Expo Push |
| Segredos obrigatórios | `DATABASE_URL`, `JWT_SECRET`, `PII_ENCRYPTION_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |

### Arquivos que decidem segurança (comece por eles)

- `apps/api/src/app.ts` — bootstrap, CORS, helmet, rate limit, content-type parsers,
  `trustProxy`, error handler.
- `apps/api/src/plugins/auth.ts` — hook `onRequest` global, allowlist de rotas
  públicas, verificação de JWT, revogação por `nrTokenVersion`, guards.
- `apps/api/src/plugins/permissions.ts` — catálogo de permissões e mapa
  rota→permissão do papel funcionário (deny-by-default, primeira regra que casa vence).
- `apps/api/src/plugins/studentRbac.ts` — allowlist do papel aluno.
- `apps/api/src/modules/auth/routes.ts` — login, gestor-login, register, register-lookup,
  forgot/reset password, change-password, verify, logout, push-token, theme.
- `apps/api/src/modules/webhooks/routes.ts` — webhook público de pagamento.
- `apps/api/src/modules/leads/routes.ts` — `POST /public/leads` (única rota de negócio aberta).
- `apps/api/src/modules/controlid/**` — endpoints públicos consumidos pelas catracas.
- `apps/api/src/modules/access/routes.ts` — reconhecimento facial.
- `apps/api/src/shared/pii.ts`, `secrets.ts`, `passwords.ts`, `files.ts`, `supabase.ts`, `asaas.ts`.
- `apps/api/src/modules/students/routes.ts` (2.611 linhas) e `companies/routes.ts` —
  as maiores superfícies de dados pessoais.
- `packages/db/prisma/schema.prisma` — modelo de dados.

### O que já foi endurecido (não repita como "achado"; tente derrubar)

1. JWT global **deny-by-default**: toda rota exige token, exceto allowlist de match
   exato (`Set`) e regex ancoradas. Nunca `startsWith`.
2. Revogação de sessão por `Usuario.nrTokenVersion` conferida no banco a cada request,
   junto com kill-switch de conta (`boInativo`).
3. Permissões do funcionário lidas **do banco a cada request**, não do token, para que
   revogação valha no request seguinte.
4. Senhas em bcrypt (12 rounds), migração progressiva dos formatos legados
   (SHA-256 sem salt / texto puro) com prazo (`LEGACY_PASSWORD_DEADLINE`), e
   `dummyVerify` para equalizar timing de conta inexistente.
5. PII at-rest: CPF e embedding biométrico em AES-256-GCM; lookup exato por HMAC
   (`caCPFHash`); subchaves derivadas por HKDF, separadas para PII e para credenciais
   de integração.
6. Webhook de pagamento em três camadas: token sorteado na URL, token no header
   comparado em tempo constante, e **reconsulta ao provedor** (o corpo do POST nunca
   decide baixa). Deduplicação por id de evento.
7. `trustProxy` por número de hops (`TRUST_PROXY_HOPS`), nunca `true`, para o rate
   limit não ser evadido por `X-Forwarded-For` forjado.
8. Upload validado por magic bytes (`file-type`), não pelo mimetype declarado; SVG
   deliberadamente fora da allowlist.
9. `POST /public/leads` resolve o tenant pelo **domínio**, nunca pelo corpo.
10. Mensagens de erro genéricas em login/forgot/register-lookup para não virar oráculo
    de enumeração.

### Correções recentes (09/2026) — verifique se estão COMPLETAS

Estas mudanças acabaram de ser feitas e **ainda não foram commitadas nem auditadas**.
São o alvo de maior valor da sua revisão: uma correção de isolamento pela metade é pior
que a ausência dela, porque cria a sensação de que o problema foi resolvido.

1. **`idCliente` NOT NULL em `Plano`, `Atividade`, `Treino`, `Promocao`.** Antes, essas
   quatro tabelas não tinham coluna de tenant: o dono era deduzido por
   `PlanoEmpresa`/`idEmpresa`, e **ausência de vínculo era lida como "global, visível a
   todos os clientes"**. Como `POST /plans` cria justamente sem vínculo, todo plano
   nascia global — junto com o preço em `PlanoValor`. Agora o filtro é `{ idCliente }`.
   - **Cace o que sobrou**: procure em todo o código por `planoEmpresas: { none: {} }`,
     por `idEmpresa: null` tratado como global, e por `findUnique` por id em qualquer
     um dos quatro models (`findUnique` não aceita filtro de tenant).
   - **Os filhos não ganharam coluna** (`PlanoValor`, `PlanoAtividade`, `PlanoProduto`,
     `PlanoBeneficio`, `PromocaoPlano`, `PromocaoProduto`, `PromocaoArquivo`,
     `TreinoExercicio`, `AtividadeAgenda`): eles alcançam o tenant **só pelo pai**.
     Existe algum handler que consulte, edite ou apague um filho pelo id dele sem
     passar pelo pai? Esse é o furo mais provável.
2. **Backfill heurístico.** A migration atribui dono por "pistas" em cascata (filiais
   onde o plano é vendido → alunos matriculados → preços por filial → instalação de
   cliente único). Avalie o risco de **dono errado**: um registro compartilhado entre
   dois clientes, ou a regra de "cliente único" aplicada numa base que já tem mais de
   um. Dono errado é vazamento permanente, não transitório.
3. **`Usuario.idCliente` NOT NULL**, e `dsLogin` deixou de ser único global para ser
   `@@unique([idCliente, dsLogin])`. Idem `Empresa.caCNPJ` → `@@unique([idCliente, caCNPJ])`.
   Isso fecha um oráculo de enumeração, mas **abre uma pergunta nova que você deve
   responder**: `Aluno` é `@@unique([idCliente, caCPFHash])` e `Funcionario` é
   `@@unique([idEmpresa, caCPFHash])` — ou seja, **o mesmo CPF pode existir em vários
   tenants por desenho**, e `/auth/login`, `/auth/forgot-password`,
   `/auth/register-lookup` e `/auth/register` fazem `findFirst` por `cpfHash`
   **sem nenhum filtro de tenant**. Quem é a pessoa aluna em duas academias: em qual
   conta ela entra? Dá para provocar a escolha? O reset de senha atinge a conta errada?
   O auto-cadastro amarra o usuário ao tenant errado? **Reproduza isso.**
4. **Cadastro de domínio corporativo virou exclusivo do super-admin** (era
   `companies.write`, que o gestor da própria academia tem). O domínio é o que resolve
   qual cliente é qual em `/auth/theme` e em `/public/leads`, então reivindicar o
   domínio de outro era sequestrar o tenant. Verifique se sobrou **qualquer outro
   caminho** para gravar `DominioCorporativo` — via `/companies`, via tema, via update
   de cliente, via seed ou script.
5. **`superAdmin` passou a ir na resposta de `/auth/login`, `/auth/gestor-login` e
   `/auth/verify`.** A intenção é só montar menu. Confirme que nenhuma decisão de
   servidor depende disso vindo do cliente, e que o web não guarda esse flag em lugar
   que o usuário edite.
6. **`enrollStudentInPlan` trocou `findUnique` por `findFirst` com `idCliente`** — antes
   dava para matricular um aluno num plano de outra academia passando o id certo, e as
   parcelas nasciam com o preço do concorrente. Procure o mesmo padrão
   (`findUnique` por id em recurso de tenant) no resto de `shared/` e dos módulos.

### Lacunas já suspeitas (confirme, quantifique e ordene — não pare nelas)

- **Isolamento de tenant é manual e repetido.** `request.user.idCliente` aparece **229
  vezes** espalhado pelos handlers; o helper `getTenantId()` em `plugins/auth.ts` está
  declarado e tem **zero usos** (é código morto). Não existe Prisma extension, middleware
  nem tipo que force o escopo — uma rota nova que esqueça o filtro vaza dados entre
  academias em silêncio. As correções de 09/2026 acima tratam os casos encontrados **um
  a um**; a causa (escopo opt-in, 229 repetições sem rede de proteção) continua de pé.
  Proponha o mecanismo que tornaria o esquecimento impossível, e diga o custo dele.
- **Mapa de permissões x rotas sem prova de cobertura.** Regra não mapeada = deny, mas
  não há teste que percorra as ~312 rotas registradas e afirme que cada uma tem regra
  intencional; e o próprio código avisa que uma rota nova sob prefixo existente
  (ex.: `/students/...`) herda a permissão do prefixo sem ninguém perceber.
- **Sem trilha de auditoria.** Nenhum dos 80 models registra quem leu/alterou o quê.
- **Sem direitos do titular.** Nenhum endpoint de exportação, exclusão ou anonimização,
  e nenhuma tabela de consentimento — inclusive para **biometria facial, que é dado
  sensível (art. 11 da LGPD)**.
- **Validação não é declarativa.** **Zero** rotas usam `schema` do Fastify; a validação é
  zod ad-hoc dentro dos handlers, e os módulos `auth`, `access` e `webhooks` não importam
  zod. Sem schema de resposta, não há serialização que impeça over-fetch de colunas.
- **Listagens majoritariamente sem teto.** 115 `findMany` para 50 `take`.
- **`logger: true` sem `redact`** e sem `bodyLimit` explícito; sem `setNotFoundHandler`.
- **Content-type parsers permissivos** (`text/plain`, `application/octet-stream`, sem
  content-type → `JSON.parse`) criados para atender firmware de catraca.
- **`CONTROLID_REQUIRE_TOKEN` desligado por padrão**: push de evento de acesso aceito
  sem token, e catraca desconhecida se auto-registra por rota pública (teto de 50).
- **Chave mestre única** (`PII_ENCRYPTION_KEY`) para PII e para credenciais de gateway,
  sem procedimento de rotação.
- **Service-role key do Supabase na API**, sem segregação de bucket ou path por tenant.

## Eixos de análise

Percorra todos. Em cada um, **procure o caso concreto no código** — arquivo e linha.

1. **Autenticação.** Emissão e verificação do JWT (algoritmo, `iss`/`aud`, expiração,
   ausência de refresh, token de 30 dias no mobile). Fluxo de reset de senha ponta a
   ponta (geração, entropia, armazenamento do hash, expiração, uso único, invalidação
   dos anteriores, o link no email). Auto-cadastro (`/auth/register`): a prova de
   titularidade (CPF + email da ficha) resiste a quem tem acesso ao email ou a uma
   base de CPF+email vazada? `/auth/gestor-login`: dá para descobrir a que rede um CPF
   pertence variando `idCliente`? Enumeração por timing, por código de status, por
   tamanho de resposta ou por rate-limit diferencial. **E o caso do CPF presente em mais
   de um tenant** — ver item 3 de "Correções recentes": todo o módulo de auth resolve
   pessoa por `findFirst(cpfHash)` sem tenant, num modelo que permite o mesmo CPF em
   várias academias.
2. **Autorização.** Tente escalar privilégio: aluno→funcionário, funcionário→gestor,
   gestor→super admin. O aluno alcança algum recurso de terceiro pelas rotas liberadas
   (`/agenda-sessions/:id/enroll`, `/students/:id/related/*`)? A permissão `profiles.write`
   permite ampliar o próprio acesso — isso está contido? Encontre rotas registradas que
   **nenhuma** regra de `ROUTE_RULES` cobre, e rotas que casam com a regra errada.
3. **Multi-tenant e IDOR.** Este é o eixo de maior valor. Enumere handler por handler
   os que aceitam id no path/query/body e **não** confirmam a posse pelo `idCliente` do
   token. Verifique especialmente: sub-recursos (`/students/:id/related/:child`),
   `/companies/:id/children/*`, relacionamentos criados por id vindo do corpo (plano,
   empresa, exercício, produto, conta de recebimento) e as consultas `$queryRaw` em
   `localities`, `reports/overview.ts`, `reports/dashboards.ts` e `companies`.
   Duas varreduras mecânicas que valem a pena rodar sobre todo o `apps/api/src`:
   **(a)** todo `findUnique`/`update`/`delete` `where: { id }` em model de tenant — essas
   formas não aceitam filtro de dono; **(b)** todo model que só alcança o tenant pelo pai
   (os filhos de `Plano`, `Promocao`, `Treino`, `Atividade`, `Agenda`) consultado
   diretamente pelo id do filho.
4. **Superfície pública.** Para cada rota da allowlist, responda: o que um anônimo
   consegue ler, gravar ou provocar? Foque em `/auth/theme` (consulta + signed URL sem
   rate limit próprio), `/public/leads`, `/webhooks/payments/:token` e todo o
   `/controlid/*` — inclusive forja de evento de acesso, envenenamento de vínculo
   aluno↔catraca e enchimento de `tb_Catracas`.
5. **Injeção e validação de entrada.** SQL nos `$queryRaw` (interpolação x
   `Prisma.sql`), injeção em `orderBy`/`where` montados dinamicamente, mass assignment
   (campos do corpo repassados direto ao Prisma), path traversal em nomes de arquivo,
   SSRF em qualquer URL vinda de configuração ou de dado do usuário (geocode, CompreFace,
   Asaas, tema), injeção de cabeçalho em email, e o que os content-type parsers custom
   aceitam.
6. **Disponibilidade e abuso.** Listagens sem `take`, agregações pesadas em `/reports`,
   N+1 e consultas em laço, ausência de `bodyLimit`, upload de 10 MB, custo do bcrypt
   como vetor de exaustão de CPU, ausência de timeout nas chamadas HTTP externas
   (Asaas, CompreFace, SMTP, Expo), e se uma integração lenta trava o event loop.
   Avalie se o rate limit em memória sobrevive a mais de uma instância.
7. **Criptografia e segredos.** Modelo de ameaça real do `pii.ts`/`secrets.ts`
   (o que protege, o que não protege), rotação de chave, `.env` versionado ou não,
   segredos em log, o alcance da service-role key do Supabase, e a expiração de 1h
   das signed URLs.
8. **Logs e resposta a incidente.** O que `logger: true` grava (headers, corpo,
   `Authorization`, CPF, token de push). É possível reconstruir "quem acessou o
   cadastro de qual aluno"? Há alerta de força bruta, de uso de token revogado, de
   webhook recusado? Existe algo que permita detectar um vazamento em andamento?
9. **LGPD.** Trate como capítulo próprio, não como nota de rodapé:
   - **Inventário**: liste os dados pessoais tratados por esta API, campo a campo, e
     marque quais são **sensíveis** (art. 5º, II) — biometria facial e, a depender do
     uso, dados de saúde em avaliação física.
   - **Base legal** (art. 7º e art. 11) para cada finalidade: execução de contrato,
     legítimo interesse, consentimento. Onde falta consentimento **específico e
     destacado** — em especial para biometria e para envio de comunicação/push.
   - **Direitos do titular** (art. 18): confirmação, acesso, correção, portabilidade,
     anonimização, eliminação, revogação de consentimento. Aponte quais **não têm
     nenhum caminho técnico** hoje e o que seria preciso construir.
   - **Minimização e retenção**: campos coletados sem finalidade clara; ausência de
     política e de rotina de expurgo; o que acontece com o aluno que cancelou.
   - **Segurança do art. 46**: criptografia, controle de acesso, segregação.
   - **Rastreabilidade e prestação de contas (art. 37/38)**: o registro das operações
     de tratamento — que hoje não existe.
   - **Compartilhamento com operadores**: Supabase, Neon, CompreFace, Asaas, Expo,
     SMTP. Onde os dados são processados (transferência internacional, art. 33) e o que
     falta em contrato/DPA.
   - **Incidente (art. 48)**: sem trilha de auditoria, o titular e a ANPD conseguiriam
     ser informados do escopo de um vazamento?
   - **Menores de idade** (art. 14): a academia matricula adolescentes; há tratamento
     de dado de menor e consentimento de responsável?
10. **Cadeia de suprimentos e implantação.** Dependências com CVE conhecida, os
    `overrides` do `package.json` raiz (por que existem, e se ainda são suficientes),
    ausência de auditoria de lockfile em CI, `NODE_ENV`, onde o TLS é terminado, e o que
    muda de comportamento entre dev e produção (CORS liberado em dev, por exemplo).

## Método

- **Leia o código antes de afirmar.** Nenhum achado sem `arquivo:linha`.
- **Separe o que você confirmou do que suspeita.** Marque cada achado como
  `REPRODUZIDO` (executei contra a API e obtive o resultado), `CONFIRMADO` (li o
  caminho inteiro e ele quebra, sem ter executado) ou `PLAUSÍVEL` (o padrão é
  arriscado, mas há um controle que eu não consegui descartar).
- Para cada achado, escreva o **cenário concreto de exploração**: quem é o atacante
  (anônimo na internet / aluno autenticado / funcionário de outra academia / funcionário
  com perfil mínimo / operador do banco), que request ele manda, e o que ele obtém.
  Uma requisição de exemplo (`curl`) vale mais que um parágrafo.
- **Prove em runtime sempre que der.** A base é de teste, sem usuário final: você
  pode subir a API (`pnpm --filter @smartgym/api dev`), criar tenants, alunos,
  funcionários, perfis e pagamentos de teste, autenticar com papéis diferentes e
  disparar os requests de verdade. Um achado exercitado contra a API vale muito mais
  que um lido no código — para IDOR e vazamento cross-tenant, **exercite**: crie duas
  academias, um funcionário em cada, e tente alcançar os dados da outra.
  - Marque tudo que criar com um prefixo reconhecível (ex.: `AUDIT-`), e liste ao
    final o que ficou no banco.
  - Não rode operação destrutiva sobre dado que você não criou: nada de `TRUNCATE`,
    `DROP`, `DELETE`/`UPDATE` em massa, nem migration ou alteração de schema. Se um
    teste exigir isso, descreva-o em vez de rodá-lo.
  - Não altere segredos de produção nem envie nada real para os provedores externos
    (Asaas, SMTP, Expo, CompreFace): use sandbox, credencial de teste ou mock.
- Não invente vulnerabilidade para encher relatório. Se um eixo estiver saudável,
  diga em uma linha e siga.
- Onde a correção depender de uma decisão de negócio (ex.: quanto tempo reter dado de
  ex-aluno), aponte a decisão em vez de escolher por conta própria.

## Formato da resposta

1. **Sumário executivo** — até 10 linhas: a postura geral e os três riscos que eu
   deveria resolver primeiro.
2. **Achados**, ordenados por severidade (Crítico / Alto / Médio / Baixo). Cada um com:

   | Campo | Conteúdo |
   |---|---|
   | Título | frase curta e afirmativa |
   | Severidade + confiança | Crítico/Alto/… + REPRODUZIDO/CONFIRMADO/PLAUSÍVEL |
   | Local | `arquivo:linha` |
   | Cenário de ataque | atacante, request, resultado — com a saída real, se executou |
   | Impacto | dado, dinheiro, disponibilidade ou conformidade |
   | Correção | o que mudar, concretamente |
   | Esforço | P / M / G |

3. **Capítulo LGPD** separado, com o inventário de dados, a tabela de bases legais e a
   lista de direitos do titular sem caminho técnico.
4. **Plano de ação em ondas**: o que fazer nesta semana, neste mês, neste trimestre —
   ordenado por (risco ÷ esforço), não por eixo.
5. **O que eu não consegui verificar** e o que seria preciso para verificar.
6. **Rastro deixado no banco**: tudo que você criou durante os testes (tabela, id,
   marcador), para eu limpar depois.
