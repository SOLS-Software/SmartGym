import type { FastifyInstance } from 'fastify';
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

const SELECT_COLUMNS = `
  id, "idEmpresa", "nmLocalidade", "dsLocalidade", "cnLocalidadeTP",
  ST_Y("geoLocalidade") as latitude, ST_X("geoLocalidade") as longitude,
  "dtCadastro", "dtAlteracao", "boInativo"
`;

export async function registerLocalityRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { search?: string };
  }>('/localities', async (request) => {
    const search = request.query.search?.trim();

    if (search) {
      return prisma.$queryRawUnsafe<LocalidadeRow[]>(
        `SELECT ${SELECT_COLUMNS} FROM "tb_Localidades" WHERE "nmLocalidade" ILIKE $1 ORDER BY "nmLocalidade" ASC`,
        `%${search}%`,
      );
    }

    return prisma.$queryRawUnsafe<LocalidadeRow[]>(
      `SELECT ${SELECT_COLUMNS} FROM "tb_Localidades" ORDER BY "nmLocalidade" ASC`,
    );
  });

  app.post<{
    Body: LocalidadePayload;
  }>('/localities', async (request, reply) => {
    try {
      const data = normalizeLocalidadePayload(request.body);
      const rows = await prisma.$queryRawUnsafe<LocalidadeRow[]>(
        `INSERT INTO "tb_Localidades"
           ("idEmpresa", "nmLocalidade", "dsLocalidade", "cnLocalidadeTP", "geoLocalidade", "dtAlteracao", "boInativo")
         VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), now(), $7)
         RETURNING ${SELECT_COLUMNS}`,
        data.idEmpresa,
        data.nmLocalidade,
        data.dsLocalidade,
        data.cnLocalidadeTP,
        data.longitude,
        data.latitude,
        data.boInativo,
      );
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
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Localidade invalida.');
      const data = normalizeLocalidadePayload(request.body);

      const rows = await prisma.$queryRawUnsafe<LocalidadeRow[]>(
        `UPDATE "tb_Localidades"
         SET "idEmpresa" = $1, "nmLocalidade" = $2, "dsLocalidade" = $3, "cnLocalidadeTP" = $4,
             "geoLocalidade" = ST_SetSRID(ST_MakePoint($5, $6), 4326), "dtAlteracao" = now(), "boInativo" = $7
         WHERE id = $8
         RETURNING ${SELECT_COLUMNS}`,
        data.idEmpresa,
        data.nmLocalidade,
        data.dsLocalidade,
        data.cnLocalidadeTP,
        data.longitude,
        data.latitude,
        data.boInativo,
        id,
      );

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
    try {
      const id = Number(request.params.id);
      assertValidId(id, 'Localidade invalida.');
      const boInativo = Number(request.body.boInativo ?? 0);

      const rows = await prisma.$queryRawUnsafe<LocalidadeRow[]>(
        `UPDATE "tb_Localidades" SET "boInativo" = $1, "dtAlteracao" = now()
         WHERE id = $2
         RETURNING ${SELECT_COLUMNS}`,
        boInativo,
        id,
      );

      if (!rows[0]) {
        return reply.code(404).send({ message: 'Localidade nao encontrada.' });
      }

      return rows[0];
    } catch {
      return reply.code(400).send({ message: 'Erro ao alterar status da localidade.' });
    }
  });
}
