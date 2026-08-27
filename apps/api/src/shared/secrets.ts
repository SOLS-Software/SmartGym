import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

// Segredos de integracao at-rest: credencial de gateway e chave Pix do cliente.
//
// POR QUE NAO REUSAR pii.ts: e a mesma tecnica (AES-256-GCM) e a mesma env
// mestre, mas a SUBCHAVE e outra, derivada com `info` proprio via HKDF. Um CPF e
// uma credencial que movimenta dinheiro tem raios de dano diferentes, e separar
// as chaves custa uma linha: quem consegue decifrar CPF nao decifra token, e
// vice-versa. Trocar por uma env dedicada depois e mudar `getKey()` aqui e
// rodar um script de re-encriptacao — nenhum outro arquivo sabe da derivacao.
//
// O QUE ISTO NAO PROTEGE: quem tem a env mestre le tudo. A defesa aqui e contra
// vazamento do BANCO (dump, backup, replica de leitura), que e o cenario
// realista — nao contra quem ja esta dentro do servidor.

const ENC_PREFIX = 'enc:v1:';

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;
  const master = process.env.PII_ENCRYPTION_KEY;
  if (!master || master.length < 32) {
    throw new Error('PII_ENCRYPTION_KEY deve ser definida com pelo menos 32 caracteres.');
  }
  // Salt e info proprios: mesma env mestre, chave derivada DIFERENTE da de PII.
  _key = Buffer.from(hkdfSync('sha256', master, 'smartgym-secret-v1', 'integracao', 32));
  return _key;
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENC_PREFIX + Buffer.concat([iv, ciphertext, tag]).toString('base64');
}

/**
 * Decifra um segredo guardado.
 *
 * Lanca se o valor nao estiver cifrado, em vez de devolver o texto como veio: um
 * segredo em claro no banco e um defeito, e devolve-lo em silencio faria o
 * sistema seguir funcionando por cima do defeito ate alguem auditar.
 */
export function decryptSecret(value: string): string {
  if (!isEncryptedSecret(value)) {
    throw new Error('Valor nao esta cifrado.');
  }
  const combined = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
  const iv = combined.subarray(0, 12);
  const tag = combined.subarray(combined.length - 16);
  const ciphertext = combined.subarray(12, combined.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * O que a tela pode mostrar: os ultimos 4 caracteres, nada mais.
 *
 * Existe para a rota de leitura NUNCA devolver o segredo inteiro. O operador
 * precisa reconhecer qual credencial esta cadastrada — nao precisa le-la, e a
 * leitura e justamente o que transforma um 403 esquecido em vazamento.
 */
export function maskSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  let plain: string;
  try {
    plain = isEncryptedSecret(value) ? decryptSecret(value) : value;
  } catch {
    // Cifrado com outra chave (env trocada, restore de backup antigo): a tela
    // precisa dizer que existe algo ali, sem fingir que sabe o que e.
    return '••••';
  }
  if (plain.length <= 4) return '••••';
  return `••••${plain.slice(-4)}`;
}

/**
 * Mascara de chave Pix: mostra o suficiente para o operador reconhecer a chave
 * sem expor o valor. Cada tipo esconde uma parte diferente porque cada um tem
 * um formato — mascarar um e-mail como se fosse CPF nao ajuda ninguem.
 */
export function maskPixKey(
  value: string | null | undefined,
  tipo: string | null | undefined,
): string | null {
  if (!value) return null;
  let plain: string;
  try {
    plain = isEncryptedSecret(value) ? decryptSecret(value) : value;
  } catch {
    return '••••';
  }

  if (tipo === 'email') {
    const at = plain.lastIndexOf('@');
    if (at <= 0) return maskSecret(plain);
    return `${plain.slice(0, 2)}•••${plain.slice(at)}`;
  }

  if (tipo === 'cpf' || tipo === 'cnpj' || tipo === 'telefone') {
    // So os ultimos digitos, como banco e maquininha ja fazem.
    return `•••${plain.slice(-4)}`;
  }

  // Aleatoria (UUID) e o resto: comeco e fim, que e o que se confere de bater.
  if (plain.length <= 12) return maskSecret(plain);
  return `${plain.slice(0, 4)}••••${plain.slice(-4)}`;
}
