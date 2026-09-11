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
