# Rotação da chave de criptografia (`PII_ENCRYPTION_KEY`)

Uma única chave mestre protege, via subchaves HKDF: **CPF** (Aluno/Funcionário),
**embedding biométrico** (AlunoBiometriaFacial) e as **credenciais de gateway/Pix**
(ContaRecebimento). O código (`apps/api/src/shared/pii.ts`, `secrets.ts`) conhece
**uma** chave por vez — o prefixo `enc:v1:` é a versão do **formato**, não da chave.

Rotacionar (chave comprometida, higiene periódica, troca de operador) exige
**re-cifrar tudo com a nova chave** e **recalcular os hashes de CPF** (`caCPFHash`
deriva da chave — muda junto, senão o login por CPF quebra). O script
`packages/db/scripts/rotate-pii-key.ts` faz isso.

## Quando rotacionar

- **Imediato:** suspeita de vazamento da env/`.env`, de backup, ou de um
  operador que teve acesso e saiu.
- **Periódico:** decisão do controlador (ex.: anual). É decisão de negócio; o
  mecanismo já existe.

## Procedimento (com janela de parada)

O app só decifra com a chave da env vigente, então a troca exige downtime curto.

1. **Backup do banco** (`pg_dump` / snapshot do Neon). Sem isto não há volta.
2. **Gere a nova chave** (≥ 32 caracteres, aleatória). Ex.:
   `openssl rand -base64 48`.
3. **Pare a API** (downtime começa).
4. **Ensaie com dry-run** (não escreve — só conta o que seria migrado):
   ```
   cd packages/db
   PII_ENCRYPTION_KEY_OLD="<chave atual>" \
   PII_ENCRYPTION_KEY_NEW="<chave nova>" \
     pnpm exec tsx scripts/rotate-pii-key.ts
   ```
5. **Aplique** (re-cifra e recalcula hashes):
   ```
   PII_ENCRYPTION_KEY_OLD="<chave atual>" \
   PII_ENCRYPTION_KEY_NEW="<chave nova>" \
     pnpm exec tsx scripts/rotate-pii-key.ts --apply
   ```
   Seguro de repetir: se morrer no meio, rode de novo — usa a auth tag do
   AES-256-GCM para pular o que já migrou.
6. **Troque `PII_ENCRYPTION_KEY`** para a **nova** no ambiente da API (e em
   qualquer outro serviço que a use).
7. **Suba a API** (downtime termina).
8. **Valide:** login por CPF de um aluno e de um funcionário; abrir uma ficha com
   biometria; ler uma conta de recebimento (Pix/credencial mascarada). Se algo
   não decifra, a env ainda aponta para a chave antiga — reveja o passo 6.
9. **Descarte a chave antiga** com segurança só depois de validar.

## O que o script cobre

| Model | Campos | Subchave |
|---|---|---|
| `Aluno`, `Funcionario` | `caCPF` (cifrado) + `caCPFHash` (recalculado) | PII (`smartgym-pii-v1`) |
| `AlunoBiometriaFacial` | `anEmbedding.enc` | PII |
| `ContaRecebimento` | `caChavePix`, `caCredencial` | segredo (`smartgym-secret-v1`) |

## Limitações e melhorias futuras (achado M-6)

- **Downtime:** o modelo atual (uma chave por env) exige parada. Uma versão sem
  downtime precisaria o `pii.ts`/`secrets.ts` conhecerem **duas** chaves ao mesmo
  tempo (decifrar com qualquer uma, cifrar com a nova, e buscar CPF pelos dois
  hashes durante a transição). É mais código no caminho quente do login; só vale
  se a frequência de rotação justificar.
- **Chave dedicada para credenciais de gateway:** hoje PII e segredos de gateway
  derivam da mesma env (subchaves distintas). Separar em uma env própria reduz o
  raio de dano, mas a troca também exige re-cifrar as contas — mesmo mecanismo
  deste script, apontado para os campos de `ContaRecebimento`.
