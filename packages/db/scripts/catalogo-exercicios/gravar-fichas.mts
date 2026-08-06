import { createSigner } from 'fast-jwt';
import { FICHAS } from './fichas.mts';

const BASE = 'http://127.0.0.1:3333';
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET ausente.');

const sign = createSigner({ key: secret, expiresIn: 2 * 60 * 60 * 1000 });
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

// A API limita 300 req/min por IP (app.ts). O intervalo mantem a carga abaixo
// disso e o retry cobre a sobra, lendo o retry-after que o fastify-rate-limit
// devolve no header.
const INTERVALO_MS = 260;

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  for (let tentativa = 0; ; tentativa += 1) {
    await espera(INTERVALO_MS);
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (res.status === 429 && tentativa < 5) {
      const retryAfter = Number(res.headers.get('retry-after') ?? 0);
      const pausa = (Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 35) * 1000;
      console.log(`    rate limit em ${method} ${path} — aguardando ${Math.round(pausa / 1000)}s`);
      await espera(pausa);
      continue;
    }

    return { status: res.status, data };
  }
}

const chave = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

console.log('fichas:', FICHAS.length);

// ---------------------------------------------------------------------------
// Conferencia de nomes: a ficha so e gravada se o nome bater com o do banco.
// ---------------------------------------------------------------------------

const catalogo = await api('GET', '/exercises?limit=1000');
const porId = new Map<number, { id: number; dsExercicio: string; boInativo: boolean }>();
for (const e of catalogo.data as Array<{ id: number; dsExercicio: string; boInativo: boolean }>) {
  porId.set(e.id, e);
}

const divergentes: string[] = [];
const semRegistro: number[] = [];
for (const ficha of FICHAS) {
  const atual = porId.get(ficha.id);
  if (!atual) {
    semRegistro.push(ficha.id);
    continue;
  }
  if (chave(atual.dsExercicio) !== chave(ficha.nome)) {
    divergentes.push(`${ficha.id}: banco="${atual.dsExercicio}" ficha="${ficha.nome}"`);
  }
}

if (semRegistro.length > 0) console.log('SEM REGISTRO NO BANCO:', semRegistro.join(', '));
if (divergentes.length > 0) {
  console.log('NOMES DIVERGENTES:');
  for (const d of divergentes) console.log('  ', d);
  throw new Error('Abortado: ficha não bate com o nome no banco.');
}

const ativosSemFicha = [...porId.values()]
  .filter((e) => !e.boInativo && e.id !== 1 && !FICHAS.some((f) => f.id === e.id))
  .map((e) => `${e.id} ${e.dsExercicio}`);
if (ativosSemFicha.length > 0) console.log('ATIVOS SEM FICHA:', ativosSemFicha.join(' | '));

// ---------------------------------------------------------------------------
// Areas corporais e equipamentos referenciados pelas fichas
// ---------------------------------------------------------------------------

const listaAreas = await api('GET', '/body-areas?limit=1000');
const areaPorNome = new Map<string, number>();
for (const a of listaAreas.data as Array<{ id: number; dsAreaCorporal: string }>) {
  areaPorNome.set(chave(a.dsAreaCorporal), a.id);
}

const areasFaltando = [...new Set(FICHAS.flatMap((f) => f.areas))].filter((n) => !areaPorNome.has(chave(n)));
if (areasFaltando.length > 0) throw new Error(`Áreas inexistentes: ${areasFaltando.join(', ')}`);

const listaEquip = await api('GET', '/equipments?limit=1000');
const equipPorNome = new Map<string, number>();
for (const e of listaEquip.data as Array<{ id: number; nmEquipamento: string | null; idCliente: number | null }>) {
  // So considera o catalogo global — nao reaproveita equipamento do tenant.
  if (e.nmEquipamento && e.idCliente === null) equipPorNome.set(chave(e.nmEquipamento), e.id);
}

console.log('\n=== EQUIPAMENTOS DE CATALOGO ===');
for (const nome of [...new Set(FICHAS.flatMap((f) => f.equipamentos))].sort()) {
  if (equipPorNome.has(chave(nome))) {
    console.log(`  ja existe: ${equipPorNome.get(chave(nome))} ${nome}`);
    continue;
  }
  const criado = await api('POST', '/equipments', {
    nmEquipamento: nome,
    boInativo: 0,
    boCatalogoGlobal: true,
  });
  if (criado.status !== 201) throw new Error(`Falha ao criar equipamento ${nome}: ${JSON.stringify(criado.data)}`);
  const registro = criado.data as { id: number };
  equipPorNome.set(chave(nome), registro.id);
  console.log(`  criado:    ${registro.id} ${nome}`);
}

// ---------------------------------------------------------------------------
// Gravacao das fichas
// ---------------------------------------------------------------------------

console.log('\n=== FICHAS ===');
let gravadas = 0;
let vinculosArea = 0;
let vinculosEquip = 0;
const erros: string[] = [];

for (const ficha of FICHAS) {
  const instrucao = `${ficha.descricao}\n\nComo executar:\n${ficha.passos
    .map((p, i) => `${i + 1}. ${p}`)
    .join('\n')}`;

  const put = await api('PUT', `/exercises/${ficha.id}`, {
    idEmpresa: null,
    dsExercicio: ficha.nome,
    dsInstrucao: instrucao,
    boInativo: 0,
  });
  if (put.status !== 200) {
    erros.push(`${ficha.id} ${ficha.nome} PUT ${put.status} ${JSON.stringify(put.data)}`);
    continue;
  }
  gravadas += 1;

  for (const nome of ficha.areas) {
    const res = await api('POST', `/exercises/${ficha.id}/areas`, { idAreaCorporal: areaPorNome.get(chave(nome)) });
    if (res.status === 201) vinculosArea += 1;
    else if (res.status !== 409) erros.push(`${ficha.id} area ${nome} ${res.status} ${JSON.stringify(res.data)}`);
  }

  for (const nome of ficha.equipamentos) {
    const res = await api('POST', `/exercises/${ficha.id}/equipment`, { idEquipamento: equipPorNome.get(chave(nome)) });
    if (res.status === 201) vinculosEquip += 1;
    else if (res.status !== 409) erros.push(`${ficha.id} equip ${nome} ${res.status} ${JSON.stringify(res.data)}`);
  }

  console.log(
    `  ${String(ficha.id).padStart(2)} ${ficha.nome.padEnd(30)} areas: ${ficha.areas.length}  equip: ${ficha.equipamentos.length}`,
  );
}

console.log('\n=== RESUMO ===');
console.log('exercícios gravados:', gravadas, 'de', FICHAS.length);
console.log('vínculos de área criados:', vinculosArea);
console.log('vínculos de equipamento criados:', vinculosEquip);
if (erros.length > 0) {
  console.log('ERROS:');
  for (const e of erros) console.log('  ', e);
} else {
  console.log('sem erros');
}
