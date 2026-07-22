import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Prisma } from '@smartgym/db';
import { prisma } from '../../shared/prisma.js';
import { normalizeLocalidadePayload, assertValidId } from '../../shared/normalize.js';
import type { LocalidadePayload } from '../../shared/api-types.js';

// tb_Localidades tem a coluna "geoLocalidade" (PostGIS geometry), que o Prisma
// mapeia como Unsupported e nao consegue ler/escrever pelo client normal.
// Por isso essas rotas usam SQL raw para todas as operacoes de leitura/escrita.

type LocalidadeRow = {
  id: number;
  idEmpresa: number | null;
  nmLocalidade: string;
  dsLocalidade: string;
  cnLocalidadeTP: number;
  latitude: number;
  longitude: number;
  dtCadastro: Date;
  dtAlteracao: Date;
  boInativo: number;
};

const SELECT_COLUMNS = Prisma.sql`
  id, "idEmpresa", "nmLocalidade", "dsLocalidade", "cnLocalidadeTP",
  ST_Y("geoLocalidade") as latitude, ST_X("geoLocalidade") as longitude,
  "dtCadastro", "dtAlteracao", "boInativo"
`;

const listQuerySchema = z.object({
  search: z.string().max(200).optional(),
  limit: z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    z.coerce.number().int().optional(),
  ),
});

const geocodeBodySchema = z.object({
  cep: z.string().max(20).optional(),
  logradouro: z.string().max(200).optional(),
  numero: z.string().max(20).optional(),
  bairro: z.string().max(120).optional(),
  cidade: z.string().max(120).optional(),
  estado: z.string().max(60).optional(),
});

type GeocodePayload = {
  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
};

export async function registerLocalityRoutes(app: FastifyInstance) {
  // Isolamento de tenant: Localidade pertence ao cliente via Empresa.idCliente.
  // A leitura do registro usa o client normal (sem a coluna geo) so para checagem.
  async function findTenantLocality(id: number, idCliente: number) {
    return prisma.localidade.findFirst({
      where: { id, empresa: { idCliente } },
      select: { id: true },
    });
  }

  // Garante que a empresa informada no payload pertence ao tenant (400 se nao).
  async function assertCompanyInTenant(idEmpresa: number, idCliente: number) {
    const company = await prisma.empresa.findFirst({
      where: { id: idEmpresa, idCliente },
      select: { id: true },
    });
    if (!company) throw new Error('Empresa nao pertence ao cliente.');
  }

  // Rota global de proposito: apenas consulta o servico externo de geocoding,
  // nao le nem escreve dados de tenant.
  app.post<{
    Body: GeocodePayload;
  }>('/localities/geocode', async (request, reply) => {
    try {
      const parsedBody = geocodeBodySchema.safeParse(request.body);
      if (!parsedBody.success) return reply.code(400).send({ message: 'Parametros invalidos.' });
      const { cep, logradouro, numero, bairro, cidade, estado } = parsedBody.data;
      const street = [numero?.trim(), logradouro?.trim()].filter(Boolean).join(' ');

      if (!street && !cep?.trim()) {
        return reply.code(400).send({ message: 'Informe ao menos o CEP ou o logradouro.' });
      }

      const url = new URL('https://nominatim.openstreetmap.org/search');
      if (street) url.searchParams.set('street', street);
      if (bairro?.trim()) url.searchParams.set('county', bairro.trim());
      if (cidade?.trim()) url.searchParams.set('city', cidade.trim());
      if (estado?.trim()) url.searchParams.set('state', estado.trim());
      if (cep?.trim()) url.searchParams.set('postalcode', cep.trim());
      url.searchParams.set('country', 'Brasil');
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '1');
      url.searchParams.set('countrycodes', 'br');
      url.searchParams.set('addressdetails', '0');

      const response = await fetch(url, {
        headers: { 'User-Agent': 'SmartGym/1.0 (contato@smartgym.app)' },
      });

      if (!response.ok) {
        throw new Error('Erro ao consultar o servico de geolocalizacao.');
      }

      const results = (await response.json()) as NominatimResult[];
      const result = results[0];

      if (!result) {
        return reply.code(404).send({ message: 'Endereco nao encontrado. Ajuste o pino manualmente no mapa.' });
      }

      return {
        latitude: Number(result.lat),
        longitude: Number(result.lon),
        displayName: result.display_name,
      };
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao buscar coordenadas.',
      });
    }
  });

  app.get<{
    Querystring: { search?: string };
  }>('/localities', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const parsedQuery = listQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) return reply.code(400).send({ message: 'Parametros invalidos.' });
    const search = parsedQuery.data.search?.trim();
    const take = Math.min(Math.max(parsedQuery.data.limit ?? 1000, 1), 1000);

    const searchFilter = search
      ? Prisma.sql` AND "nmLocalidade" ILIKE ${`%${search}%`}`
      : Prisma.empty;

    return prisma.$queryRaw<LocalidadeRow[]>(Prisma.sql`
      SELECT ${SELECT_COLUMNS} FROM "tb_Localidades"
      WHERE "idEmpresa" IN (SELECT id FROM "tb_Empresas" WHERE "idCliente" = ${idCliente})${searchFilter}
      ORDER BY "nmLocalidade" ASC
      LIMIT ${take}
    `);
  });

  app.post<{
    Body: LocalidadePayload;
  }>('/localities', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const data = normalizeLocalidadePayload(request.body);
      await assertCompanyInTenant(data.idEmpresa, idCliente);
      const rows = await prisma.$queryRaw<LocalidadeRow[]>(Prisma.sql`
        INSERT INTO "tb_Localidades"
          ("idEmpresa", "nmLocalidade", "dsLocalidade", "cnLocalidadeTP", "geoLocalidade", "dtAlteracao", "boInativo")
        VALUES (${data.idEmpresa}, ${data.nmLocalidade}, ${data.dsLocalidade}, ${data.cnLocalidadeTP},
          ST_SetSRID(ST_MakePoint(${data.longitude}, ${data.latitude}), 4326), now(), ${data.boInativo})
        RETURNING ${SELECT_COLUMNS}
      `);
      return reply.code(201).send(rows[0]);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar localidade.',
      });
    }
  });

  app.put<{
    Params: { id: string };
    Body: LocalidadePayload;
  }>('/localities/:id', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Localidade invalida.');
      const current = await findTenantLocality(id, idCliente);
      if (!current) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const data = normalizeLocalidadePayload(request.body);
      await assertCompanyInTenant(data.idEmpresa, idCliente);

      const rows = await prisma.$queryRaw<LocalidadeRow[]>(Prisma.sql`
        UPDATE "tb_Localidades"
        SET "idEmpresa" = ${data.idEmpresa}, "nmLocalidade" = ${data.nmLocalidade},
            "dsLocalidade" = ${data.dsLocalidade}, "cnLocalidadeTP" = ${data.cnLocalidadeTP},
            "geoLocalidade" = ST_SetSRID(ST_MakePoint(${data.longitude}, ${data.latitude}), 4326),
            "dtAlteracao" = now(), "boInativo" = ${data.boInativo}
        WHERE id = ${id}
        RETURNING ${SELECT_COLUMNS}
      `);

      if (!rows[0]) {
        return reply.code(404).send({ message: 'Localidade nao encontrada.' });
      }

      return rows[0];
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao atualizar localidade.',
      });
    }
  });

  app.patch<{
    Params: { id: string };
    Body: { boInativo?: number };
  }>('/localities/:id/status', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Localidade invalida.');
      const current = await findTenantLocality(id, idCliente);
      if (!current) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const boInativo = toBool(request.body.boInativo);

      const rows = await prisma.$queryRaw<LocalidadeRow[]>(Prisma.sql`
        UPDATE "tb_Localidades" SET "boInativo" = ${boInativo}, "dtAlteracao" = now()
        WHERE id = ${id}
        RETURNING ${SELECT_COLUMNS}
      `);

      if (!rows[0]) {
        return reply.code(404).send({ message: 'Localidade nao encontrada.' });
      }

      return rows[0];
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status da localidade.' });
    }
  });
}
