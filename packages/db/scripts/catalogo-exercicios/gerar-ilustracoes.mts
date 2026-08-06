import sharp from 'sharp';
import { createSigner } from 'fast-jwt';
import { montarSvg, CENAS, quadrosDaCena } from './cenas.mts';
import { MAPA } from './mapa.mts';

const BASE = 'http://127.0.0.1:3333';
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET ausente.');

const sign = createSigner({ key: secret, expiresIn: 3 * 60 * 60 * 1000 });
const token = sign({
  sub: 10,
  role: 'employee',
  idAluno: null,
  idFuncionario: 3,
  idCliente: 1,
  superAdmin: true,
  tv: 0,
});

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const INTERVALO_MS = 260;

async function req(method: string, path: string, init: RequestInit = {}): Promise<{ status: number; data: any }> {
  for (let tentativa = 0; ; tentativa += 1) {
    await espera(INTERVALO_MS);
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      method,
      headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    if (res.status === 429 && tentativa < 5) {
      const retryAfter = Number(res.headers.get('retry-after') ?? 0);
      const pausa = (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 35) * 1000;
      console.log(`    rate limit — aguardando ${Math.round(pausa / 1000)}s`);
      await espera(pausa);
      continue;
    }
    return { status: res.status, data };
  }
}

const api = (method: string, path: string, body?: unknown) =>
  req(method, path, body ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {});

// ---------------------------------------------------------------------------
// Exercicio -> cena do padrao de movimento
// ---------------------------------------------------------------------------

const cenaPorExercicio = new Map<number, string>();
for (const [cena, ids] of Object.entries(MAPA)) {
  if (!CENAS[cena]) throw new Error(`Cena inexistente no mapa: ${cena}`);
  for (const id of ids) {
    if (cenaPorExercicio.has(id)) throw new Error(`Exercício ${id} mapeado duas vezes.`);
    cenaPorExercicio.set(id, cena);
  }
}
console.log('exercícios mapeados:', cenaPorExercicio.size);

// ---------------------------------------------------------------------------
// Catalogo: nome e areas de cada exercicio (o subtitulo da arte sai daqui)
// ---------------------------------------------------------------------------

const catalogo = await api('GET', '/exercises?limit=1000&includeCover=true');
const porId = new Map<number, { id: number; dsExercicio: string; boInativo: boolean; areas: Array<{ dsAreaCorporal: string }> }>();
for (const e of catalogo.data) porId.set(e.id, e);

const ativosSemCena = [...porId.values()].filter((e) => !e.boInativo && e.id !== 1 && !cenaPorExercicio.has(e.id));
if (ativosSemCena.length > 0) {
  throw new Error(`Ativos sem cena: ${ativosSemCena.map((e) => `${e.id} ${e.dsExercicio}`).join(' | ')}`);
}

const slug = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

// ---------------------------------------------------------------------------
// Geracao e upload
// ---------------------------------------------------------------------------

let enviados = 0;
let pulados = 0;
const erros: string[] = [];

for (const [id, cena] of [...cenaPorExercicio.entries()].sort((a, b) => a[0] - b[0])) {
  const exercicio = porId.get(id);
  if (!exercicio) {
    erros.push(`${id}: não encontrado no catálogo`);
    continue;
  }

  const nomeArquivo = `${slug(exercicio.dsExercicio)}.gif`;

  const existentes = await api('GET', `/exercises/${id}/files`);
  if (Array.isArray(existentes.data) && existentes.data.some((f: any) => f.dsArquivo === nomeArquivo)) {
    console.log(`  ${String(id).padStart(2)} ${exercicio.dsExercicio.padEnd(28)} já tem ${nomeArquivo}`);
    pulados += 1;
    continue;
  }

  const areas = exercicio.areas.map((a) => a.dsAreaCorporal).join(' · ');
  const total = quadrosDaCena(cena);
  const quadros = await Promise.all(
    Array.from({ length: total }, (_, q) =>
      sharp(Buffer.from(montarSvg(cena, q, exercicio.dsExercicio, areas))).png().toBuffer(),
    ),
  );
  const intervalo = total > 2 ? 850 : 1100;
  const gif = await sharp(quadros, { join: { animated: true } })
    .gif({ loop: 0, delay: Array(total).fill(intervalo) })
    .toBuffer();

  const form = new FormData();
  form.append('file', new Blob([gif], { type: 'image/gif' }), nomeArquivo);
  const upload = await req('POST', `/exercises/${id}/files`, { body: form });

  if (upload.status !== 201) {
    erros.push(`${id} ${exercicio.dsExercicio}: ${upload.status} ${JSON.stringify(upload.data)}`);
    console.log(`  ${String(id).padStart(2)} ${exercicio.dsExercicio.padEnd(28)} FALHOU ${upload.status}`);
    continue;
  }

  enviados += 1;
  console.log(
    `  ${String(id).padStart(2)} ${exercicio.dsExercicio.padEnd(28)} ${cena.padEnd(18)} ${String(gif.length).padStart(6)} bytes`,
  );
}

console.log('\n=== RESUMO ===');
console.log('enviados:', enviados);
console.log('já existiam:', pulados);
if (erros.length > 0) {
  console.log('ERROS:');
  for (const e of erros) console.log('  ', e);
} else {
  console.log('sem erros');
}
