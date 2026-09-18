# Relatório de QA — SOLSFIT Web

**Data:** 2026-08-04
**Escopo:** 23 módulos do painel web, testados no navegador em 1280x800 (desktop) e 375x812 (mobile).
**Ambiente:** localhost:3000 + API localhost:3333, apontando para o banco Neon (nuvem).

---

## Resumo

| Item | Gravidade | Status |
|---|---|---|
| A1 — Truncamento silencioso no servidor | Alta | Corrigido e verificado |
| A2 — Erro cru do Prisma exposto | Alta | Corrigido e verificado |
| A3 — Salvar sem feedback | Alta | **Retratado** — erro de medição minha |
| A4 — Endereço sem limite | Alta | Corrigido |
| M1 — CPF quebrando na grid | Média | Corrigido e verificado |
| M2 — Calendário da Empresa em mobile | Média | Corrigido e verificado |
| M3 — CEP sem máscara em Matrículas | Média | Corrigido e verificado |
| M4 — Telefone em dois formatos | Média | Corrigido |
| M5 — CNPJ cru na grid de Fornecedores | Média | Corrigido |
| B1 — Senha do login sem limite | Baixa | **Não corrigir** — proposital |
| B2 — Email do cadastro maior que o banco | Baixa | Corrigido |
| B3 — UF aceita dígito | Baixa | Corrigido |
| B4 — Alvo de toque do menu | Baixa | **Retratado** — falso positivo |
| B5 — Campos numéricos sem faixa | Baixa | Corrigido |
| B6 — Busca sem limite | Baixa | Corrigido |

### Retratações

**A3** — reportei que salvar não dava feedback e não atualizava a lista. Em teste
controlado o fluxo de sucesso funciona: HTTP 201, toast "Empresa salva com sucesso.",
drawer fecha e a grid vai de 5 para 6 linhas. O que me enganou: `.registration-drawer`
continua no DOM depois de fechado, e o toast some sozinho antes da minha verificação.

**B4** — o botão de menu mede 37x37px, acima do mínimo de 24px. A medição de 37x12
pegou o elemento durante a animação de abertura.

**B1** — mantido de propósito: não expor o limite da senha na tela de login.

---

## ALTA

### A1 — Truncamento silencioso de dados no servidor

A API corta o texto para caber na coluna em vez de rejeitar. O usuário salva, recebe sucesso, e o dado
foi mutilado sem aviso.

**Evidência (registro criado no teste, empresa id 6):**

| Campo | Digitado | Gravado |
|---|---|---|
| `anLogradouro` | 261 caracteres | 150 (cortado no meio da palavra) |
| `nrEndereco` | `ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890` | `ABCDEFGHIJ` |
| `anUF` | `9Z` | `9Z` (UF inválida aceita) |

**Origem:** `apps/api/src/shared/normalize.ts:144` e `:190` — `optionalTrimmed(...).slice(0, maxLength)`.
Afeta Empresa e Fornecedor.

**Correção sugerida:** validar e devolver erro 400 com mensagem por campo, em vez de `slice`.

---

### A2 — Erro cru do Prisma exposto na tela

Ao salvar empresa com CNPJ duplicado, a UI exibe a exceção completa do Prisma, incluindo o caminho
absoluto do servidor e o código-fonte da rota:

```
Invalid `tx.empresa.create()` invocation in
C:\Dev\SOLSFIT\apps\api\src\modules\companies\routes.ts:391:42
  388 const data = normalizeCompanyPayload({ ...request.body, idCliente });
  ...
Unique constraint failed on the fields: (`caCNPJ`)
```

Dois problemas: vazamento de estrutura interna e mensagem inútil para o usuário
(o correto seria "Já existe uma empresa com este CNPJ").

**Correção sugerida:** mapear `PrismaClientKnownRequestError` code `P2002` para mensagem de negócio;
nunca repassar `error.message` do Prisma ao cliente.

---

### A3 — RETRATADO

Ver a seção "Retratações" no resumo. O fluxo de sucesso funciona corretamente.

---

### A4 — Campos de endereço sem limite nenhum

`AddressLocationPicker.tsx` renderiza Logradouro, Número, Bairro e Cidade **sem `maxLength`**
(só CEP e UF têm). Usado em **Empresas** e **Localidades**.

| Campo | Limite na UI | Coluna no banco |
|---|---|---|
| `addressLogradouro` | nenhum | `VarChar(150)` |
| `addressNumero` | nenhum | `VarChar(10)` |
| `addressBairro` | nenhum | `VarChar(100)` |
| `addressCidade` | nenhum | `VarChar(100)` |

Confirmado na tela: 261 caracteres aceitos no Logradouro, 36 no Número.

Contraste: **Fornecedores** tem os mesmos campos com os limites corretos (150/10/100/100) — ou seja,
existem dois componentes de endereço divergentes no sistema.

---

## MÉDIA

### M1 — CPF quebra em duas linhas em toda grid

`.product-row` usa `grid-template-columns: minmax(0, 1fr) 6.875rem 6.875rem`
([data-grid.css:194](apps/web/src/shared/styles/data-grid.css:194)). Com root de 14px isso dá 96px fixos,
e CPF formatado precisa de 98–110px. **7 de 7 linhas** da grid de Matrículas quebram, enquanto a coluna
de nome recebe 841px ociosos.

**Correção sugerida:** trocar as colunas fixas por `max-content` ou aumentar para ~8rem.

---

### M2 — Calendário da Empresa corta conteúdo em mobile

Em 375px, `main#conteudo-principal` tem `scrollWidth` 552 contra `clientWidth` 375 com `overflow-x: hidden`:
**177px inalcançáveis**. Os botões de filtro "Atividades" e "Promoções" ficam cortados na borda direita
sem nenhuma forma de rolar até eles.

---

### M3 — CEP sem máscara em Matrículas

Campo `anCEP` do cadastro de aluno: `maxLength=8`, placeholder "Somente numeros", exibe `01234567`.
Em Empresas, Localidades e Fornecedores o mesmo dado usa máscara `00000-000` (`maxLength=9`).
Existe `formatCep()` em `@solsfit/shared` que não é usado no formulário de aluno.

---

### M4 — Telefone com dois formatos diferentes

| Módulo | Formato | Máscara |
|---|---|---|
| Matrículas, Profissionais | `00000-0000` | sim |
| Empresas, Fornecedores | `999999999` | não |

Mesmo dado, duas experiências. Na grid de Fornecedores o telefone aparece como `(11) 999998888`
(parênteses sem hífen), num terceiro formato.

---

### M5 — CNPJ sem máscara na grid de Fornecedores

A grid exibe `11444777000161` cru. Em Empresas a mesma coluna sai formatada (`61.336.668/0001-07`).
Além de inconsistente, o valor cru estoura os 96px da coluna e quebra em duas linhas.

---

## BAIXA

### B1 — Senha do login sem limite

Campo `password` da tela de login: sem `maxLength` e sem `required` no HTML.
Na aba "Criar cadastro" a mesma senha é limitada a 20 (`maxLength=20`, hint "6 a 20 caracteres, com número").

### B2 — Email do cadastro público aceita mais que o banco

`registerEmail` tem `maxLength=255`; a coluna `anEmail` é `VarChar(100)`.

### B3 — UF aceita dígito

Campo UF aceita `9Z` (faz uppercase, mas não restringe a letras nem valida contra as 27 UFs).

### B4 — RETRATADO

Ver a seção "Retratações" no resumo. O botão mede 37x37px.

### B5 — Campos numéricos sem faixa

| Campo | min | max |
|---|---|---|
| `nrEndereco` (Matrículas) | — | — |
| `equipmentNumber` (Equipamentos) | — | — |

`nrEndereco` aceitou `-99999999999999999999` (21 caracteres, negativo) e o HTML considerou válido.
Já `qtEstoque` e `periodAmount` têm `min=0` corretamente.

### B6 — Campo de busca sem limite

Os campos "Pesquisar" das grids não têm `maxLength`.

---

## Verificado e OK

- **Máscara de CPF** (login, cadastro público, Matrículas, Profissionais): filtra não-dígitos, formata e
  trava em 14. Testada com letras, símbolos e colagem.
- **Máscara de CNPJ** (Clientes, Empresas, Fornecedores): correta, 18 caracteres.
- **Telefone**: aceita colagem de `98765-4321` corretamente.
- **Promoções**: `% desconto` tem `min=0`/`max=100` e o navegador rejeita 999; valor tem `step=0.01`.
  (Minha varredura estática inicial acusou ausência desses atributos — era falso positivo, o DOM real os tem.)
- **Limites que batem com o banco**: nome de aluno/funcionário/plano/treino/produto/exercício (255),
  email de aluno e funcionário (100), contato (9 dígitos), instruções de exercício (2000 sobre coluna `Text`).
- **Layout**: nenhum scroll horizontal na página em nenhum módulo, desktop ou mobile.
  Todos os campos de formulário têm `<label>` associado.
- **Menu lateral em mobile**: tem `overflow-y: auto` e rola até o último item.

---

## Perfil ALUNO — rodada 2026-08-05

Testado com o usuário `Caio Dev` (aluno 2), em 1280x800 e 375x812.

### Layout — limpo

As 10 telas do aluno (Painel, Meu Treino, Exercícios, Matrícula, Planos, Promoções,
Pontuações, Atividades, Agendas, Calendário) passaram nos dois tamanhos: nenhum scroll
horizontal, nada estourando a viewport, nenhum corte de conteúdo, nenhum alvo de toque
abaixo de 24px, todos os campos com label.

O menu esconde corretamente Montar Treino, Montagem de Agenda, Calendário Empresa,
Treino e Relatórios.

| Item | Gravidade | Status |
|---|---|---|
| S1 — Aluno não consegue cancelar inscrição (403) | Alta | Corrigido e verificado |
| S2 — Aluno não consegue se inscrever pelo Calendário (403) | Alta | Corrigido e verificado |
| S3 — Botão de inscrever/cancelar aparecia em aula de hoje (409) | Média | Corrigido e verificado |
| S4 — Categoria vazia virava um "-" solto | Baixa | Corrigido e verificado |

### S1/S2 — RBAC barrava inscrição e cancelamento pela agenda

`studentRbac.ts` é deny-by-default e liberava só `POST /students/:id/activity-schedules/enroll`.
As telas de Calendário e Agenda usam outra família de rota — `/agenda-sessions/:id/enroll`
e `/agenda-sessions/:id/unenroll` — que não estava na allowlist. Resultado: o aluno se
inscrevia pela tela de Atividades e **nunca conseguia cancelar**; o botão "Cancelar inscrição"
existia e sempre respondia `403 {"message":"Acesso nao autorizado."}`.

**Correção:** as duas rotas entraram na allowlist. Como o dono da inscrição vem no **corpo**
(`idAluno`) e o RBAC só enxerga método e caminho, liberar a rota sozinha permitiria a um
aluno mexer na inscrição de outro. A posse passou a ser resolvida no handler
(`resolveEnrollmentOwner`, `modules/agendas/routes.ts`): para o papel aluno o `idAluno` do
corpo é **ignorado** e vale o do token. Funcionário e gestor continuam podendo agir em nome
de terceiros.

**Verificação no navegador:**

| Requisição | Antes | Depois |
|---|---|---|
| `POST /agenda-sessions/220/enroll` | 403 | 201 |
| `DELETE /agenda-sessions/220/unenroll` | 403 | 200 "Inscrição cancelada com sucesso." |
| `POST .../enroll` com `idAluno: 999` no corpo | — | 201 gravando **`idAluno: 2`** (o do token) |

### S3 — Botão aparecia para aula que a API recusa

A API recusa inscrever e cancelar em aula com data **igual ou anterior** a hoje (409).
`StudentCalendarView.tsx` calculava `isPast` com `<`, então nas aulas **de hoje** mostrava
os botões e o aluno só descobria a recusa depois de clicar. `AgendaView.tsx` já usava `<=`.
Alinhado ao servidor.

### S4 — Categoria vazia

`StudentActivitiesView.tsx` renderizava `<b>-</b>` no meio do card quando a aula não tinha
categoria — 36 das 87 sessões do período. O elemento agora só existe quando há categoria
(mesmo padrão do `StudentCalendarView`). Confirmado nos dois casos: some nas Zumba (sem
categoria) e continua aparecendo nas JiuJitsu ("Sub 20").

### Não são bugs

- Botão "Inscrever nas aulas" `disabled` com 0 selecionados — comportamento correto.
- Checkbox de 13x13px dentro de um `<label>` de 908x94px: o alvo real é a linha inteira.
- Truncamento de evento no calendário: `text-overflow: ellipsis` proposital, com o detalhe
  completo no painel lateral.
- "Dois DELETE por clique": artefato da minha própria instrumentação (`window.fetch`
  embrulhado várias vezes). Com interceptador limpo é 1 requisição.

### Observação de UX (não corrigido)

Inscrever-se acontece em **Atividades**, cancelar fica em **Calendário**. As duas metades da
mesma ação estão em telas diferentes.

---

## Auditoria de UX — perfil aluno, 2026-08-05

Rodada focada em o que é pouco intuitivo ou conceitualmente errado, não em bugs de layout.

| Item | Gravidade | Status |
|---|---|---|
| U1 — Painel exibia dados falsos (rotas 404 engolidas) | Alta | Corrigido e verificado |
| U2 — Pontuações inacessível ao aluno (403) | Alta | Corrigido e verificado |
| U3 — "Pago em" preenchido em cobrança pendente | Média | Corrigido e verificado |
| U4 — Vocabulário de admin no app do aluno | Média | Corrigido e verificado |
| U5 — Exercícios: mural de placeholders | Média | Corrigido e verificado |
| U6 — Grid do último treino quebrava em ~900px | Média | Corrigido e verificado |
| U7 — Regra do mesmo dia escondia o botão sem explicar | Baixa | Corrigido e verificado |
| U8 — Acentuação inconsistente | Baixa | Corrigido |
| U9 — Campos vazios em planos de terceiros | Baixa | Corrigido |
| U10 — "Nenhuma atividade vinculada" dizia o oposto | Baixa | Corrigido |

### U1 — O painel do aluno mostrava dados falsos

`StudentDashboard` chamava `students/:id/children/plans` e `children/check-ins`. O padrão
`children/` é das rotas de **empresa**; para aluno é `related/`. As duas voltavam 404, o
`if (res.ok)` engolia o erro e a tela renderizava lista vazia.

Um aluno com plano ativo e 5 check-ins via **"Nenhum plano ativo"** e **zero** em todos os
contadores — contradizendo a tela de Matrícula ("Plano ativo"), o Meu Treino (último treino
em 13/07) e a notificação exibida na mesma tela ("faz 22 dias desde seu último treino").

Depois da correção: `Simple Plan`, 5 check-ins total, 0 no mês (o último foi em julho) e
0 dias seguidos — tudo coerente entre si.

### U2 — Pontuações nunca funcionou

A tela chama `/companies` e `/companies/:id/children/points`; nenhuma das duas estava na
allowlist do aluno, então abria com a mensagem crua **"Acesso nao autorizado."** Ambas
entraram na allowlist — são dados da própria academia, filtrados por `idCliente` na rota,
sem exposição de outro aluno. Agora a tela carrega o seletor de filial e mostra o estado
vazio correto.

### U3 — Pagamentos

A base tem parcelas com `dsStatusPagamento = "Pendente"` e `dtPagamento` preenchida, e a
tela exibia "Pago em 20/06/2026" ao lado do badge "Pendente". Agora a data de pagamento só
aparece em cobrança efetivamente paga; `dtVencimento` nulo virou "A definir" em vez de "-";
e cobrança vencida ganhou badge próprio (`danger`), separada da que ainda vai vencer.
O resumo passou de "2 pendente(s)" para "2 cobranças em aberto".

### U4 — Vocabulário

O aluno via um grupo de menu **"ALUNOS"** e a trilha "ALUNOS / MATRÍCULA". Os grupos foram
escritos para a operação e o app do aluno reaproveita a lista. `getMenuGroupLabel` traduz
só para o papel aluno: ALUNOS → MINHA CONTA, ATIVIDADE → AULAS. Os `section-label` das
telas exclusivas do aluno acompanharam.

### U5 — Exercícios

86 exercícios em cards de ~190px, dos quais ~85% era um placeholder cinza idêntico —
nenhum exercício tem capa cadastrada. Sem capa a faixa da foto agora encolhe para uma tarja
de 1,75rem: o card cai para 71px e cabem ~10 por tela no lugar de 2. Com capa cadastrada o
card continua exatamente como era.

**Correção de uma afirmação minha:** eu disse que o modelo não tinha campo de imagem. Tem —
`coverImageUrl` (via arquivos do exercício) e `areas` (área corporal). O layout não estava
errado; ele degrada mal com a base vazia.

### U6 — Grid do último treino

`.my-training-last-grid` usava 4 colunas fixas e o card divide a linha com o de "Iniciar
treino". Em ~900px com o menu aberto sobravam 262px → colunas de 48px, e "Superior" saía
quebrado como "Su/pe/rio/r". O breakpoint de 1 coluna só agia abaixo de 760px, deixando
toda a faixa intermediária quebrada — que minhas varreduras anteriores (1280 e 375) não
cobriram. Agora usa `auto-fit`.

### U7 — Regra do mesmo dia

Na rodada anterior eu escondi o botão nas aulas de hoje. Some sem explicar. Agora "ontem" e
"hoje" são casos distintos: aula passada não mostra nada, aula de hoje mostra "Não é
possível cancelar no dia da aula" / "Inscrições encerradas para hoje". Aplicado no
Calendário e na Agenda.

### Não corrigido — decisão de produto

- **Três telas para a mesma coisa** (Atividades, Agendas, Calendário), com inscrição em duas
  e cancelamento em uma. Unificar muda a navegação do app.
- **Planos sem CTA**: dá para ver "Best Plan · R$ 250 · Disponível" e não há como contratar
  ou pedir troca. Precisa de fluxo no servidor.
- **Acesso rápido duplica o menu** no desktop — mas em mobile o menu fica atrás do
  hambúrguer, onde os atalhos têm valor. Mantido.

### Observação de ambiente

`GET /students/2/files/2/url` responde 400 `{"message":"fetch failed"}`: o storage de
arquivos não está acessível neste ambiente, então a foto do aluno não carrega e a tela cai
para as iniciais. É infraestrutura, não código.

---

## Auditoria de UX — perfil profissional, 2026-08-05

Testado com usuário funcionário (`idFuncionario 1`) em 375px, 903px e 1440px.

| Item | Gravidade | Status |
|---|---|---|
| P1 — Montagem de Agenda: coluna STATUS invisível em qualquer largura | Alta | Corrigido e verificado |
| P2 — Montagem de Treino: 141px (903px) e 326px (375px) cortados | Alta | Corrigido e verificado |
| P3 — Painel e Relatórios discordavam do mesmo número | Média | Corrigido e verificado |
| P4 — Dois cards para quase o mesmo número | Média | Corrigido e verificado |
| P5 — Menu e título com nomes diferentes na mesma tela | Média | Corrigido e verificado |
| P6 — Rótulo de seção contradizia o grupo do menu | Média | Corrigido e verificado |
| P7 — Títulos em dois padrões | Baixa | Corrigido e verificado |
| P8 — Montagem de Treino listava aluno inativo sem filtro | Baixa | Corrigido e verificado |
| P9 — Paginação sem acento | Baixa | Corrigido |
| P10 — Telefone em dois campos (DDD + número) | Baixa | Corrigido e verificado |

### P1/P2 — Conteúdo inalcançável nas telas de fluxo

As linhas em `trainings.css` usavam mínimos **fixos**: `.workout-student-row` pedia
`minmax(16rem…) minmax(9rem…) minmax(14rem…) 7rem` = **46rem (644px)** de mínimo num
container de 554px. `minmax` com mínimo fixo não encolhe, e `.product-table` herda
`overflow: hidden` de `app-card` (que existe para arredondar cantos na animação) — então
o excedente não virava rolagem, sumia.

| Tela | 375px | 903px | 1440px |
|---|---|---|---|
| Montagem de Treino | 326px perdidos | 141px | ok |
| Montagem de Agenda | ok | 293px | 163px |

Em Montagem de Agenda a coluna **STATUS estava 100% fora da tela** em qualquer largura.

Correções: mínimos passaram a `minmax(0, Nfr)` (as células já têm `text-overflow:
ellipsis`, então truncam limpo); `.activity-schedule-activity-row` declarava uma 4ª faixa
de 7rem que nenhuma linha preenche, desperdiçando 98px de um painel de 381px; o breakpoint
de `.schedule-assembly-layout` subiu de 900px para 1100px, porque com o menu aberto uma
janela de 903px deixa só 556px para as duas colunas; e `.product-table` ganhou
`overflow-x: auto` como rede de segurança — as colunas de dados são fixas de propósito
(cada linha é um grid independente, dimensionar por conteúdo desalinha cabeçalho e dados),
então quando não cabe, a saída correta é rolar, não sumir.

As grades de cadastro (`RegistrationGrid`) já usavam `minmax(0, 1fr)` e passavam limpas —
o padrão certo existia na casa e não estava sendo usado nas telas de fluxo.

### P3/P4 — KPIs do Painel

"Planos ativos: 9" contava `/plans`, o **catálogo** da academia, não as matrículas. Com 7
alunos cadastrados o número não podia significar o que o gestor lê, e contradizia o
Relatório ("Matrículas ativas: 6") a um clique de distância. O número está certo; o rótulo
é que mentia — agora é "Planos no catálogo".

Não virou contagem de matrículas porque não existe rota agregada: o Relatório busca aluno
a aluno em pool, caro demais para a tela de entrada.

"Total de alunos: 7" ao lado de "Alunos ativos: 6" eram dois cards para quase o mesmo
número, ambos levando para Matrículas. Virou "Alunos inativos", que é o dado que faltava —
o total continua sendo a soma, visível na própria tela. Os três rótulos ganharam
concordância de número.

### P5/P6/P7 — Nomes e rótulos

- O menu dizia "Montar Treino" e a tela se intitulava "MONTAGEM DE TREINO", os dois
  visíveis ao mesmo tempo. O rótulo exibido virou "Montagem de Treino" (a chave interna
  continua `Montar Treino`, usada no roteamento), alinhando com o irmão "Montagem de Agenda".
- Rótulo de seção passou a ser sempre o grupo do menu: Painel e Relatórios → "Início"
  (era "Painel" e "Gestão"), Pontuações → "Alunos" (era "Fidelidade"), Localidades →
  "Equipamentos" (era "Localidades").
- Padrão de título: **"CADASTRO DE X"** nas telas de cadastro (Matrículas e Compras
  ganharam o prefixo que faltava), substantivo puro nas de consulta e fluxo (Agendas,
  Calendário, Montagem de Treino/Agenda, Relatórios).

### P8 — Alunos inativos em Montagem de Treino

Apareciam misturados aos ativos, sem filtro. Agora o padrão é só ativos, com um
"Mostrar inativos (N)" na barra da grade — o contador mostra quantos estão ocultos.

### P10 — Telefone

DDD e número eram dois campos, com validação cruzada entre eles ("Informe o DDD do
contato" / "Informe o contato") — regras que só existiam porque a divisão permite um estado
inválido no meio do preenchimento. Viraram um campo só, com máscara `(11) 96796-7158` e uma
regra única. O banco continua com `nrDDD` e `nrContato` separados; `splitDddPhone` divide na
hora de salvar e `joinDddPhone` junta ao carregar. Aplicado em Profissionais e Matrículas,
para não criar uma inconsistência nova.

### Não corrigido — são dados, não código

- **"Recepicionista"** no seletor de Cargo (visível em todo cadastro de funcionário).
  Confirmei que não está no código: é registro do domínio de cargos, corrigível pela própria
  tela de Domínios.
- Os registros de teste listados na seção de limpeza abaixo — inclusive um aluno chamado
  "Sessão não identificada. Faça login novamente.", que é uma mensagem de erro salva como
  nome, e o "Plano QA Teste" e o "Plano Sem Frequência" duplicado, que inflavam o KPI do P3.

---

## Pendência de limpeza

Registro de teste criado com autorização, **não removido**:

- Tabela `Empresa`, **id 6**, `QA-CLAUDE-LIMITES` (registro com os dados truncados que
  serviram de prova do A1 — logradouro cortado em 150, número `ABCDEFGHIJ`, UF `9Z`).
- Tabela `Empresa`, **id 9**, `QA-CLAUDE-SUCESSO` (criado na verificação do A3).

```sql
DELETE FROM "tb_Empresas" WHERE id IN (6, 9);
```

Inscrição de teste do aluno 2 na agenda 219 (Aula Zumba de 05/08), criada na rodada
anterior. **Não removida**: a aula caiu para "hoje" e a regra de negócio impede cancelar
no dia — corretamente. Só sai por SQL:

```sql
UPDATE "tb_AlunoAtividadeAgendas" SET "boInativo" = true WHERE id = 23;
```

As inscrições 24 e 25 (agenda 220, criadas na verificação desta rodada) já foram
canceladas pela própria tela — estão com `boInativo = true`, que é o estado normal de
qualquer inscrição cancelada.

Observação: a base já continha outros registros aparentemente de teste anteriores
(`__QA_GEO__`, `teste do gustinha`, aluno `Sessão não identificada. Faça login novamente.`).

---

## Método

- Auditoria em DOM ao vivo: atributos reais de cada controle (`maxLength`, `inputMode`, `min`/`max`/`step`,
  `label`), detecção de overflow/clipping por comparação `scrollWidth`/`clientWidth` e medição da largura
  natural do texto contra a largura disponível da célula.
- Testes de digitação e colagem reais nos campos com máscara.
- Um teste de submit autorizado, com interceptação de `fetch` para capturar a resposta da API.
- Cruzamento dos limites da UI contra `packages/db/prisma/schema.prisma`.
