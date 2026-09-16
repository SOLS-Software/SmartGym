import { prisma } from './prisma.js';

// Resolucao control-plane de TENANT pelo dominio de acesso.
//
// É o "quem é o tenant" que PRECEDE a escolha da conexao no multi-tenancy de
// dados (docs/multi-tenancy-dados.md): dominio -> idCliente -> getTenantDb.
// E ja e o mesmo criterio que o login usa (achado A-2). Le
// tb_DominiosCorporativos, que e CONTROL PLANE (vive no banco padrao/bootstrap,
// nunca no banco dedicado de um tenant) — por isso usa o `prisma` padrao.
//
// Tenant vem do DOMINIO (window.location.hostname no web), nunca de um idCliente
// no corpo. O mesmo CPF pode ter ficha em varios tenants; sem o tenant, o lookup
// por CPF caia sempre na conta de menor id. Retorna null quando o dominio nao vem
// (app mobile, que nao tem dominio) ou nao casa nenhum cliente ativo — nesse caso
// o chamador desambigua por outro criterio (senha).

// Normalizacao do dominio (pura): trim + lowercase. Vazio/espacos => '' (o
// chamador trata como "sem tenant").
export function normalizeDomain(caDominio: string | undefined): string {
  return (caDominio ?? '').trim().toLowerCase();
}

export async function resolveTenantByDomain(caDominio: string | undefined): Promise<number | null> {
  const url = normalizeDomain(caDominio);
  if (!url) return null;
  const dominio = await prisma.dominioCorporativo.findFirst({
    where: { urlDominio: url, boAtivo: true },
    select: { idCliente: true },
  });
  return dominio?.idCliente ?? null;
}

// Resolucao control-plane de TENANT pela CHAVE DE ENDERECO DO DISPOSITIVO.
//
// Mesmo papel do dominio, para quem nao tem dominio: a catraca. O firmware nao
// manda JWT e se identifica pelo `caSerial`, que mora em tb_Catracas — tabela de
// APLICACAO. Com banco por cliente, procurar o serial exigiria saber antes de
// quem ele e. A saida foi notar que o ENDERECO do servidor e configuravel no
// equipamento e que o firmware ANEXA o proprio endpoint ao caminho digitado
// (dai as rotas /controlid, /controlid/push e /controlid/push/push, tres bases
// ja vistas em campo): o caminho e nosso, e carrega a chave.
//
// A chave vive em tb_Clientes — que JA e control-plane. Nao ha de-para
// serial->cliente a manter em dia, entao nao ha o que derivar.
const CHAVE_RE = /^[a-f0-9]{32,64}$/;

/** Chave valida em formato? Barra varredura antes de tocar o banco. */
export function isChaveDispositivo(chave: string | undefined): boolean {
  return CHAVE_RE.test((chave ?? '').trim().toLowerCase());
}

export async function resolveTenantByDeviceKey(
  chave: string | undefined,
): Promise<number | null> {
  const valor = (chave ?? '').trim().toLowerCase();
  if (!isChaveDispositivo(valor)) return null;
  const cliente = await prisma.cliente.findFirst({
    where: { caChaveDispositivo: valor, boInativo: false },
    select: { id: true },
  });
  return cliente?.id ?? null;
}
