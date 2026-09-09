// Rotacao da chave mestre de criptografia (PII_ENCRYPTION_KEY) — achado M-6.
//
// POR QUE ESTE SCRIPT EXISTE: uma unica chave protege CPF, biometria e as
// credenciais de gateway/Pix, e o codigo (pii.ts / secrets.ts) so conhece UMA
// chave por vez. Se essa chave vaza, nao ha caminho de troca — este script e
// esse caminho. Ele decifra tudo com a chave ANTIGA e re-cifra com a NOVA, e
// recalcula os HASHES de CPF (que derivam da chave, entao mudam junto).
//
// FORMATO x CHAVE: o prefixo `enc:v1:` e a versao do FORMATO, nao da chave — ele
// NAO muda aqui. O que muda e a chave usada; por isso a troca exige janela de
// parada (o app so conhece a chave da env vigente).
//
// PROCEDIMENTO (ver docs/rotacao-chave-pii.md):
//   1. Backup do banco.
//   2. Parar a API (downtime — o app so decifra com a env vigente).
//   3. Rodar com --apply passando as duas chaves (ver env abaixo).
//   4. Trocar PII_ENCRYPTION_KEY para a nova no ambiente.
//   5. Subir a API e validar (login por CPF, abrir biometria, ler conta Pix).
//
// SEGURO DE REPETIR: usa a auth tag do AES-256-GCM para saber o que ja migrou —
// se um valor decifra com a chave NOVA, foi pulado. Se o script morre no meio,
// rode de novo: retoma de onde parou.
//
// Uso (na pasta packages/db):
//   PII_ENCRYPTION_KEY_OLD=<atual> PII_ENCRYPTION_KEY_NEW=<nova> \
//     pnpm exec tsx scripts/rotate-pii-key.ts            # dry-run (so conta)
//   ...adicione --apply para escrever de verdade.

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { PrismaClient } from '../src/index.js';

const ENC_PREFIX = 'enc:v1:';
const APPLY = process.argv.includes('--apply');

const OLD = process.env.PII_ENCRYPTION_KEY_OLD ?? '';
const NEW = process.env.PII_ENCRYPTION_KEY_NEW ?? '';
if (OLD.length < 32 || NEW.length < 32) {
  console.error(
    'Defina PII_ENCRYPTION_KEY_OLD e PII_ENCRYPTION_KEY_NEW com pelo menos 32 caracteres cada.',
  );
  process.exit(1);
}
if (OLD === NEW) {
  console.warn(
    'AVISO: OLD == NEW. O script re-cifra com a MESMA chave (novos IVs) — util so para ensaiar o processo, nao rotaciona nada de fato.',
  );
}

// Subchaves espelhando pii.ts (PII) e secrets.ts (credenciais), parametrizadas
// pela chave mestre para o script conhecer as DUAS ao mesmo tempo.
function derivePiiKeys(master: string) {
  return {
    enc: Buffer.from(hkdfSync('sha256', master, 'smartgym-pii-v1', 'enc', 32)),
    mac: Buffer.from(hkdfSync('sha256', master, 'smartgym-pii-v1', 'mac', 32)),
  };
}
function deriveSecretKey(master: string) {
  return Buffer.from(hkdfSync('sha256', master, 'smartgym-secret-v1', 'integracao', 32));
}

function encrypt(encKey: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, ciphertext, tag]).toString('base64');
}
function decrypt(encKey: Buffer, value: string): string {
  const combined = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
  const iv = combined.subarray(0, 12);
  const tag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(12, combined.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', encKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
function hmac(macKey: Buffer, digits: string): string {
  return createHmac('sha256', macKey).update(digits).digest('hex');
}

const oldPii = derivePiiKeys(OLD);
const newPii = derivePiiKeys(NEW);
const oldSecret = deriveSecretKey(OLD);
const newSecret = deriveSecretKey(NEW);

// Re-cifra um valor tolerando repeticao: se ele ja decifra com a chave NOVA, ja
// foi migrado — devolve null (nada a fazer). Se decifra com a ANTIGA, devolve o
// texto claro para o chamador re-cifrar (e recalcular hash, quando houver).
function planReencrypt(
  value: string | null | undefined,
  oldEnc: Buffer,
  newEnc: Buffer,
): { plain: string } | null {
  if (!value || !value.startsWith(ENC_PREFIX)) return null; // vazio / nao cifrado
  try {
    decrypt(newEnc, value);
    return null; // ja migrado
  } catch {
    /* segue: precisa migrar */
  }
  return { plain: decrypt(oldEnc, value) };
}

const prisma = new PrismaClient();
const stats: Record<string, { pendentes: number; migrados: number }> = {};
function tick(model: string, migrou: boolean) {
  stats[model] ??= { pendentes: 0, migrados: 0 };
  stats[model].pendentes += 1;
  if (migrou) stats[model].migrados += 1;
}

// --- Aluno / Funcionario: caCPF (enc) + caCPFHash (mac) --------------------
for (const model of ['aluno', 'funcionario'] as const) {
  const rows = await (prisma[model] as { findMany: (a: unknown) => Promise<Array<{ id: number; caCPF: string | null }>> }).findMany({
    where: { caCPF: { startsWith: ENC_PREFIX } },
    select: { id: true, caCPF: true },
  });
  for (const row of rows) {
    const plan = planReencrypt(row.caCPF, oldPii.enc, newPii.enc);
    if (!plan) continue;
    tick(model, APPLY);
    if (APPLY) {
      await (prisma[model] as { update: (a: unknown) => Promise<unknown> }).update({
        where: { id: row.id },
        data: { caCPF: encrypt(newPii.enc, plan.plain), caCPFHash: hmac(newPii.mac, plan.plain) },
      });
    }
  }
}

// --- AlunoBiometriaFacial: anEmbedding = { enc: 'enc:v1:...' } -------------
{
  const rows = await prisma.alunoBiometriaFacial.findMany({ select: { id: true, anEmbedding: true } });
  for (const row of rows) {
    const emb = row.anEmbedding as { enc?: unknown } | null;
    const enc = emb && typeof emb === 'object' && typeof emb.enc === 'string' ? emb.enc : null;
    const plan = planReencrypt(enc, oldPii.enc, newPii.enc);
    if (!plan) continue;
    tick('alunoBiometriaFacial', APPLY);
    if (APPLY) {
      await prisma.alunoBiometriaFacial.update({
        where: { id: row.id },
        data: { anEmbedding: { enc: encrypt(newPii.enc, plan.plain) } },
      });
    }
  }
}

// --- ContaRecebimento: caChavePix + caCredencial (secrets.ts) --------------
{
  const rows = await prisma.contaRecebimento.findMany({
    select: { id: true, caChavePix: true, caCredencial: true },
  });
  for (const row of rows) {
    const pix = planReencrypt(row.caChavePix, oldSecret, newSecret);
    const cred = planReencrypt(row.caCredencial, oldSecret, newSecret);
    if (!pix && !cred) continue;
    tick('contaRecebimento', APPLY);
    if (APPLY) {
      await prisma.contaRecebimento.update({
        where: { id: row.id },
        data: {
          ...(pix ? { caChavePix: encrypt(newSecret, pix.plain) } : {}),
          ...(cred ? { caCredencial: encrypt(newSecret, cred.plain) } : {}),
        },
      });
    }
  }
}

console.log(APPLY ? '=== ROTACAO APLICADA ===' : '=== DRY-RUN (nada escrito; use --apply) ===');
for (const [model, s] of Object.entries(stats)) {
  console.log(`  ${model}: ${s.pendentes} pendente(s) de rotacao${APPLY ? `, ${s.migrados} migrado(s)` : ''}`);
}
if (Object.keys(stats).length === 0) {
  console.log('  Nada a rotacionar (tudo ja esta na chave nova, ou nao ha dado cifrado).');
}

await prisma.$disconnect();
