# Relatório de QA — SmartGym Web

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
C:\Dev\SmartGym\apps\api\src\modules\companies\routes.ts:391:42
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
Existe `formatCep()` em `@smartgym/shared` que não é usado no formulário de aluno.

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

## Pendência de limpeza

Registro de teste criado com autorização, **não removido**:

- Tabela `Empresa`, **id 6**, `QA-CLAUDE-LIMITES` (registro com os dados truncados que
  serviram de prova do A1 — logradouro cortado em 150, número `ABCDEFGHIJ`, UF `9Z`).
- Tabela `Empresa`, **id 9**, `QA-CLAUDE-SUCESSO` (criado na verificação do A3).

```sql
DELETE FROM "tb_Empresas" WHERE id IN (6, 9);
```

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
