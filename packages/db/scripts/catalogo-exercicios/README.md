# Catálogo global de exercícios

Scripts que preencheram e mantêm o catálogo global de exercícios
(`tb_Exercicios` com `idEmpresa` nulo): descrição, passo a passo, áreas
corporais, equipamentos e a ilustração de cada exercício.

Tudo é gravado **pela API**, não direto no banco — assim as regras de validação,
tenant e RBAC valem também para a carga.

## Arquivos

| arquivo | o que é |
|---|---|
| `fichas.mts` | Dados. Uma ficha por exercício: descrição, passos, áreas e equipamentos. |
| `cenas.mts` | Dados. As 23 cenas de ilustração, cada uma desenhada em SVG por quadro. |
| `mapa.mts` | Dados. Qual cena cada exercício usa. |
| `gravar-fichas.mts` | Grava as fichas (texto, áreas, equipamentos). |
| `gerar-ilustracoes.mts` | Gera e sobe a ilustração de todos os exercícios mapeados. |
| `reenviar-ilustracao.mts` | Regera e sobe só os exercícios de uma cena. Use ao corrigir um desenho. |

## Como rodar

A API precisa estar no ar (`pnpm --filter @smartgym/api dev`). Use
`127.0.0.1`, não `localhost`: a API escuta em `0.0.0.0` e `localhost` resolve
para `::1`, que dá `ECONNREFUSED`.

Da raiz do repositório:

```bash
npx tsx --env-file=.env packages/db/scripts/catalogo-exercicios/gravar-fichas.mts
```

```bash
npx tsx --env-file=.env packages/db/scripts/catalogo-exercicios/gerar-ilustracoes.mts
```

```bash
npx tsx --env-file=.env packages/db/scripts/catalogo-exercicios/reenviar-ilustracao.mts abdominal-solo
```

Os três são **idempotentes**: `PUT` sobrescreve, vínculo repetido volta 409 e o
gerador pula exercício que já tem `.gif` com o mesmo nome. Rodar de novo é
seguro. `reenviar-ilustracao.mts` é a exceção proposital — ele inativa o gif
antigo antes de subir o novo, porque o nome do arquivo é o mesmo.

Os scripts espaçam as chamadas em 260 ms e fazem retry no 429: a API limita
300 requisições por minuto por IP.

## Sobre o token

Nenhum usuário tem `boSuperAdmin` no banco, e manter o catálogo global exige
essa permissão. Os scripts assinam um JWT localmente com o `JWT_SECRET` do
`.env`, carregando a claim `superAdmin`, para o usuário 10
(`teste.admin@example.com`). Nenhum privilégio é alterado no banco.

Isso **não** é uma escalada de privilégio: quem tem o `JWT_SECRET` já pode
assinar qualquer token. Se preferir o caminho normal, marque `boSuperAdmin` em
um usuário real, faça login e troque a assinatura local pelo token da sessão.

## Corrigindo uma ilustração

1. Ajuste a cena em `cenas.mts`.
2. Rode `reenviar-ilustracao.mts <cena>`.

Convenção de orientação das figuras (errar nisso já causou dois bugs, está
documentada no topo de `cenas.mts`): quase toda figura em pé ou sentada olha
para a **esquerda** — a ponta do pé aponta para a esquerda e a perna dobra para
a direita. A exceção é o `afundo`. Figura deitada de costas tem a cabeça à
esquerda e quadril → joelho → pé sempre para a direita.

Exercícios da mesma família compartilham cena (as 8 roscas de bíceps usam uma
só). Para desmembrar, crie a cena nova, aponte o id em `mapa.mts` e reenvie as
duas cenas afetadas.
