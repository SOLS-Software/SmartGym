# Dados de demonstração

Popula o banco com uma academia sintética plausível, para exercitar as abas
**Relatórios** e **Dashboards** com volume de verdade.

## Por que existe

Os painéis analíticos foram construídos contra um banco com 7 alunos, 15
check-ins e zero leads. Isso valida a **forma** dos indicadores, não o
**comportamento**: o funil nunca renderizou com conteúdo, a coorte nunca teve
uma safra grande, o aging nunca teve as quatro faixas povoadas e nenhuma
consulta foi medida sob carga.

## Uso

```bash
# prévia — não grava nada, só diz o que faria
pnpm --filter @smartgym/db exec tsx scripts/demo/semear.mts

# grava
pnpm --filter @smartgym/db exec tsx scripts/demo/semear.mts --confirmar

# desfaz
pnpm --filter @smartgym/db exec tsx scripts/demo/limpar.mts --confirmar
```

Os dois scripts imprimem o **host do banco alvo** antes de qualquer escrita.
Confira essa linha: o banco de desenvolvimento deste projeto é a nuvem, e é
compartilhado.

`DEMO_ID_CLIENTE` escolhe o tenant (padrão: 1).

## O contrato da marca

Tudo que o seed cria carrega `[DEMO]` no nome. O que não tem nome próprio
(pagamento, check-in, inscrição) pende por chave estrangeira de algo que tem.
É isso que permite a `limpar.mts` devolver o banco ao estado anterior.

Verificado em execução: depois de semear e limpar, as oito tabelas afetadas
voltaram exatamente à contagem original.

| tabela | antes | depois do seed | depois da limpeza |
|---|---|---|---|
| alunos | 7 | 247 | 7 |
| matrículas | 7 | 247 | 7 |
| check-ins | 15 | 7 548 | 15 |
| pagamentos | 40 | 2 234 | 40 |
| leads | 0 | 200 | 0 |
| atividades | 7 | 10 | 7 |
| turmas | 313 | 457 | 313 |
| inscrições | 25 | 1 452 | 25 |

## O que é simulado

Nada é uniforme, porque distribuição uniforme produz painel bonito e inútil —
todo horário com o mesmo movimento, todo motivo de cancelamento com a mesma
fatia. Cada dimensão tem a forma aproximada do que uma academia real produz:

- **Horário de check-in** — dois picos (manhã e fim de tarde) com vale ao
  meio-dia; domingo quase vazio.
- **Admissão** — sazonal, com janeiro e setembro fortes.
- **Evasão** — concentrada nos primeiros 90 dias, que é o que dá sentido à
  tabela de coorte.
- **Inadimplência** — cauda longa, para as quatro faixas do aging existirem.
- **Ocupação de aula** — varia por modalidade, com presença menor onde sobra
  vaga.

A semente do gerador é fixa (`SEMENTE` em `semear.mts`): o mesmo comando produz
o mesmo banco, então um número estranho num painel pode ser reproduzido.

## Limites

É uma imitação plausível, **não** a realidade. Serve para validar legibilidade,
desempenho e casos de borda dos indicadores. Não serve para concluir nada sobre
o negócio.

Não gera CPF: `caCPF` fica vazio e `caCPFHash` nulo. O campo é PII criptografada
e nenhum indicador o consulta — inventar CPF exigiria a chave de criptografia
aqui dentro em troca de nada. O efeito colateral é que aluno de demonstração não
faz login, o que também é desejável.

Cada aluno tem exatamente uma matrícula. Histórico de renovação (cancelou e
voltou) não é simulado.

## Lookups usados

Ids fixos conferidos no banco. Se o seed de domínio mudar, ajuste em
`semear.mts`:

- `StatusPagamento` — 1 Pendente, 2 Pago
- `FormaPagamento` — 1 Pix, 2 Dinheiro, 3 Débito, 4 Crédito
- `TipoCheckIn` — 1 Catraca, 2 Manual, 3 Aplicativo
- `MotivoCancelamento` — 1 a 9
- `Plano` — 3, 4, 5, 6
