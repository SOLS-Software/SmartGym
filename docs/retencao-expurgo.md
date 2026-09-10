# Retenção e expurgo de dados (LGPD art. 15/16 + trilha de auditoria)

> **STATUS (2026-09-10): MECANISMO PRONTO E PROVADO em dry-run.** O motor de
> expurgo em lote existe (`apps/api/src/scripts/retention.ts`), reusa a mesma
> anonimização da rota (`shared/anonymize.ts`) e roda em **dry-run por padrão**.
> Validado contra o Neon de dev: 253 alunos / 49 linhas de trilha, **0 elegíveis**
> hoje (dado de teste recente — nenhum ex-aluno parado há 5 anos, trilha só de
> set/2026). **Falta a decisão do controlador: os PRAZOS de retenção** (abaixo).

## O que a LGPD cobra aqui

- **Art. 15/16 — término do tratamento e eliminação:** terminada a finalidade
  (o aluno saiu e não há obrigação legal que justifique manter a identidade), o
  dado pessoal deve ser **eliminado**. A ação **por titular** já existe
  (`POST /students/:id/anonymize`). Faltava o processo que roda a política em
  **lote**, periodicamente, sem depender de alguém pedir.
- **Retenção da trilha de auditoria (resíduo do A-4):** `tb_Auditoria` guarda
  metadados de acesso (rota, status, IP, ator — nunca corpo/PII). Ela não pode
  crescer para sempre; a retenção deve ser **proporcional à finalidade**
  (detecção/investigação de incidente), então as linhas antigas expiram.

## A decisão que é sua (controlador/jurídico)

O código **não** decide os prazos — eles são uma escolha jurídica do controlador.
Dois números:

| Parâmetro | O que controla | Default (piso) |
|---|---|---|
| `RETENTION_ALUNO_DIAS` | Há quanto tempo o ex-aluno precisa estar inativo para ser anonimizado | **1825** (5 anos) |
| `RETENTION_AUDITORIA_DIAS` | Idade máxima das linhas da trilha antes do expurgo | **730** (2 anos) |

> Os defaults são um **piso conservador**, alinhado a prazos fiscais comuns —
> **não são recomendação jurídica**. O ideal: mapear a base legal de cada
> finalidade (o financeiro tem retenção fiscal própria — por isso a anonimização
> **preserva** planos/pagamentos) e definir estes números com o jurídico.

## O que o expurgo de aluno faz (e o que preserva)

Reusa `anonymizeStudent` (mesma lógica da rota, decisão "manter financeiro"):
apaga PII e dado sensível (biometria local **+ CompreFace**, avaliação física,
arquivos), embaralha a identidade da ficha e encerra o acesso, mas **preserva**
planos e pagamentos (agora ligados a um titular sem identidade). Irreversível.

**Critério de elegibilidade (conservador, para nunca pegar aluno ativo):** a
ficha precisa estar **inativa** (`boInativo`), **ainda com PII** (não anonimizada
antes), **parada** (`dtAlteracao`) há mais que `RETENTION_ALUNO_DIAS`, e **sem
nenhum plano vigente** (nenhum `AlunoPlano` ativo e não encerrado). `dtAlteracao`
é um piso: só toca fichas que não mudam há anos. O controlador pode refinar o
sinal (ex.: último check-in) se quiser algo mais fino.

## Guardas de segurança

- **Dry-run é o padrão.** Sem `--apply`, o script só **conta e lista amostras** —
  não escreve nada. Sempre rode dry-run primeiro e confira os números.
- **Prazo mínimo:** recusa `--aluno-dias < 365` e `--auditoria-dias < 90` (evita
  apagar dado recente por engano/fat-finger).
- **`--apply` explícito** (ou `RETENTION_APPLY=true`) para escrever de verdade.
- **NUNCA rode `--apply` contra a base compartilhada de dev** (é dado de teste,
  mas o hábito é a proteção). Rode `--apply` só contra produção, com backup.
- **Expurgo da trilha em lotes por id** (não um `DELETE` gigante) para não travar
  a tabela inteira.

## Como rodar

Na pasta `apps/api`:

```bash
# 1) DRY-RUN (sempre primeiro) — só conta/lista, nada muda:
pnpm exec tsx --env-file-if-exists ../../.env --env-file-if-exists ../../packages/db/.env \
  src/scripts/retention.ts

# 2) Escopos e prazos:
#    --only=alunos | auditoria | all   (default all)
#    --tenant=<id>                     (default: todos os tenants)
#    --limit=<n>                       (default 500 alunos por rodada)
#    --aluno-dias=<n> / --auditoria-dias=<n>   (ou via env RETENTION_*)
#    --skip-external                   (não tocar CompreFace/storage agora)
pnpm exec tsx ... src/scripts/retention.ts --only=auditoria --auditoria-dias=730

# 3) APLICAR de verdade (produção, com backup — NUNCA no dev):
RETENTION_ALUNO_DIAS=1825 RETENTION_AUDITORIA_DIAS=730 \
  pnpm exec tsx ... src/scripts/retention.ts --apply
```

## Agendamento (produção)

Rodar periodicamente (ex.: mensal) como **cron/Task Scheduler no servidor da API**
ou um job agendado do provedor — apontando para o `DATABASE_URL` de **produção**.
Não é o CI (`.github/workflows/ci.yml`): o CI valida código com env de fachada e
**não** toca banco real. Sugestão de cadência: `--only=auditoria` mensal (barato)
e `--only=alunos` mensal ou trimestral, sempre com dry-run revisado antes de ligar
o `--apply` automático.

## Ainda em aberto (decisão de negócio, fora deste mecanismo)

- **Bases legais por finalidade** e o mapa de retenção fino (o financeiro já é
  preservado; o resto segue a política que o jurídico definir).
- **Menores de idade (art. 14)** — consentimento do responsável; não é retenção,
  é captura/base legal (ver `docs/auditoria-api-2026-09-09.md`, M-3).
