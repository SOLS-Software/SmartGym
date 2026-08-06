// Reenvia a ilustracao dos exercicios de UMA cena, depois de corrigir o desenho.
// Uso: npx tsx reenviar-ilustracao.mts <cena> [<cena> ...]
// Inativa o gif antigo (soft delete) antes de subir o novo, porque o nome do
// arquivo e o mesmo e o gerador pula duplicata.

import sharp from 'sharp';
import { createSigner } from 'fast-jwt';
import { montarSvg, CENAS, quadrosDaCena } from './cenas.mts';
import { MAPA } from './mapa.mts';

const BASE = 'http://127.0.0.1:3333';
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET ausente.');

const sign = createSigner({ key: secret, expiresIn: 60 * 60 * 1000 });
const token = sign({
  sub: 10,
  role: 'employee',
  idAluno: null,
  idFuncionario: 3,
  idCliente: 1,
  superAdmin: true,
  tv: 0,
});

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function req(method: string, path: string, init: RequestInit = {}): Promise<{ status: number; data: any }> {
  for (let tentativa = 0; ; tentativa += 1) {
    await espera(260);
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
      const pausa = (Number(res.headers.get('retry-after')) || 35) * 1000;
      console.log(`    rate limit — aguardando ${Math.round(pausa / 1000)}s`);
      await espera(pausa);
      continue;
    }
    return { status: res.status, data };
  }
}

const cenasAlvo = process.argv.slice(2);
if (cenasAlvo.length === 0) throw new Error('Informe ao menos uma cena.');
for (const c of cenasAlvo) if (!CENAS[c]) throw new Error(`Cena desconhecida: ${c}`);

const ids = cenasAlvo.flatMap((c) => MAPA[c] ?? []);
console.log('cenas:', cenasAlvo.join(', '));
console.log('exercícios afetados:', ids.join(', '));

const catalogo = await req('GET', '/exercises?limit=1000&includeCover=true');
const porId = new Map<number, any>();
for (const e of catalogo.data) porId.set(e.id, e);

const slug = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

const erros: string[] = [];
let reenviados = 0;

for (const id of ids) {
  const exercicio = porId.get(id);
  if (!exercicio) {
    erros.push(`${id}: não encontrado`);
    continue;
  }
  const cena = cenasAlvo.find((c) => (MAPA[c] ?? []).includes(id))!;
  const nomeArquivo = `${slug(exercicio.dsExercicio)}.gif`;

  // Inativa a versao antiga
  const arquivos = await req('GET', `/exercises/${id}/files`);
  for (const f of arquivos.data as any[]) {
    if (f.dsArquivo !== nomeArquivo) continue;
    const del = await req('DELETE', `/exercises/${id}/files/${f.id}`);
    if (del.status !== 200) erros.push(`${id} delete ${f.id}: ${del.status}`);
  }

  const areas = exercicio.areas.map((a: any) => a.dsAreaCorporal).join(' · ');
  const total = quadrosDaCena(cena);
  const quadros = await Promise.all(
    Array.from({ length: total }, (_, q) =>
      sharp(Buffer.from(montarSvg(cena, q, exercicio.dsExercicio, areas))).png().toBuffer(),
    ),
  );
  // Cenas longas correm um pouco mais rapido para o ciclo nao ficar arrastado.
  const intervalo = total > 2 ? 850 : 1100;
  const gif = await sharp(quadros, { join: { animated: true } })
    .gif({ loop: 0, delay: Array(total).fill(intervalo) })
    .toBuffer();

  const form = new FormData();
  form.append('file', new Blob([gif], { type: 'image/gif' }), nomeArquivo);
  const upload = await req('POST', `/exercises/${id}/files`, { body: form });

  if (upload.status !== 201) {
    erros.push(`${id} ${exercicio.dsExercicio}: ${upload.status} ${JSON.stringify(upload.data)}`);
    continue;
  }
  reenviados += 1;
  console.log(`  ${String(id).padStart(2)} ${exercicio.dsExercicio.padEnd(24)} ${cena.padEnd(16)} ${gif.length} bytes`);
}

// Confere que a capa de cada um passou a ser o arquivo novo
console.log('\n=== CAPAS ===');
for (const id of ids) {
  const arquivos = await req('GET', `/exercises/${id}/files`);
  const ativos = arquivos.data as any[];
  console.log(`  ${id}: ${ativos.length} arquivo(s) ativo(s) -> ${ativos.map((f) => f.dsArquivo).join(', ')}`);
}

console.log('\nreenviados:', reenviados);
if (erros.length > 0) {
  console.log('ERROS:');
  for (const e of erros) console.log('  ', e);
} else {
  console.log('sem erros');
}
