import { toBool } from '../../shared/normalize.js';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@solsfit/db';
import { z } from 'zod';
import { Prisma } from '@solsfit/db';
import { normalizeLocalidadePayload, assertValidId } from '../../shared/normalize.js';
import type { LocalidadePayload } from '../../shared/api-types.js';
import { clientErrorMessage } from '../../shared/errors.js';

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

/**
 * Monta a consulta ao Nominatim. Pura e testavel sem rede — pelo mesmo motivo
 * de shouldAudit e requiredPermission: e uma REGRA, e a regra aqui ja errou uma
 * vez em silencio.
 *
 * O BAIRRO NAO ENTRA, E ISSO E O CONSERTO.
 *
 * A versao anterior mandava o bairro no parametro `county`. Parece razoavel e
 * nao e: no Nominatim `county` e divisao ADMINISTRATIVA, nao bairro. Quando o
 * bairro nao casa com nenhum county do OpenStreetMap — que e quase sempre, no
 * Brasil — a busca estruturada nao ignora o parametro: ela devolve VAZIO. O
 * endereco existia, a rua existia, e mesmo assim a tela dizia "endereco nao
 * encontrado".
 *
 * Reproduzido com o CEP 06401-160 (Av. Henriqueta Mendes Guerra, Vila Sao
 * Joao, Barueri): com `county=Vila Sao Joao` a resposta e `[]`; sem ele, acha
 * na hora. Colar o bairro numa busca em texto livre tem o mesmo efeito, entao
 * nao adianta trocar o formato da consulta — o bairro tem de sair.
 *
 * O campo continua sendo ACEITO no corpo da requisicao porque o formulario o
 * envia junto com o resto do endereco; ele so nao vai para o servico.
 */
export function montarBuscaNominatim(params: {
  street?: string;
  city?: string;
  state?: string;
  postalcode?: string;
}): URL {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  if (params.street) url.searchParams.set('street', params.street);
  if (params.city) url.searchParams.set('city', params.city);
  if (params.state) url.searchParams.set('state', params.state);
  if (params.postalcode) url.searchParams.set('postalcode', params.postalcode);
  url.searchParams.set('country', 'Brasil');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'br');
  url.searchParams.set('addressdetails', '0');
  return url;
}

type NominatimResult = {

  lat: string;
  lon: string;
  display_name: string;
};

type ViaCepResult = {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
};

export async function registerLocalityRoutes(app: FastifyInstance) {
  // Isolamento de tenant: Localidade pertence ao cliente via Empresa.idCliente.
  // A leitura do registro usa o client normal (sem a coluna geo) so para checagem.
  async function findTenantLocality(db: PrismaClient, id: number, idCliente: number) {
    return db.localidade.findFirst({
      where: { id, empresa: { idCliente } },
      select: { id: true },
    });
  }

  // Garante que a empresa informada no payload pertence ao tenant (400 se nao).
  async function assertCompanyInTenant(db: PrismaClient, idEmpresa: number, idCliente: number) {
    const company = await db.empresa.findFirst({
      where: { id: idEmpresa, idCliente },
      select: { id: true },
    });
    if (!company) throw new Error('Empresa nao pertence ao cliente.');
  }

  /**
   * Uma consulta ao Nominatim. Devolve o primeiro resultado, ou null.
   * A montagem da URL — e a razao de o bairro ficar de fora — esta em
   * montarBuscaNominatim.
   */
  async function consultarNominatim(params: {
    street?: string;
    city?: string;
    state?: string;
    postalcode?: string;
  }): Promise<NominatimResult | null> {
    const response = await fetch(montarBuscaNominatim(params), {
      headers: { 'User-Agent': 'SOLSFIT/1.0 (contato@solsfit.app)' },
      // Sem timeout, um Nominatim lento segura a conexao (e uma do pool) por
      // tempo indefinido. 8s e folgado para geocodificacao.
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      throw new Error('Erro ao consultar o servico de geolocalizacao.');
    }

    const results = (await response.json()) as NominatimResult[];
    return results[0] ?? null;
  }

  // Rota global de proposito: apenas consulta o servico externo de geocoding,
  // nao le nem escreve dados de tenant.
  app.post<{
    Body: GeocodePayload;
  }>('/localities/geocode', async (request, reply) => {
    try {
      const parsedBody = geocodeBodySchema.safeParse(request.body);
      if (!parsedBody.success) return reply.code(400).send({ message: 'Parametros invalidos.' });
      // O BAIRRO E DESCARTADO DE PROPOSITO — ver a nota em consultarNominatim.
      const { cep, logradouro, numero, cidade, estado } = parsedBody.data;
      const street = [numero?.trim(), logradouro?.trim()].filter(Boolean).join(' ');

      if (!street && !cep?.trim()) {
        return reply.code(400).send({ message: 'Informe ao menos o CEP ou o logradouro.' });
      }

      // Duas tentativas, da mais precisa para a mais tolerante.
      //
      // A primeira pede a rua na cidade. Se o OpenStreetMap nao tiver aquele
      // logradouro — acontece em rua nova e em loteamento recente —, a busca
      // estruturada devolve VAZIO, sem explicar. A segunda pergunta so pelo
      // CEP, que poe o pino no quarteirao certo e deixa o resto para o arrasto
      // no mapa. Errar por 200 metros e melhor que nao marcar nada.
      //
      // A segunda so acontece quando a primeira falha, entao o caso comum
      // continua sendo uma requisicao so ao Nominatim.
      let result = await consultarNominatim({
        street,
        city: cidade?.trim(),
        state: estado?.trim(),
        postalcode: cep?.trim(),
      });

      if (!result && cep?.trim()) {
        result = await consultarNominatim({ postalcode: cep.trim() });
      }

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
        message: clientErrorMessage(error, 'Erro ao buscar coordenadas.'),
      });
    }
  });

  // Mesma natureza da rota de geocoding: consulta servico externo, nao le nem
  // escreve dado de tenant.
  //
  // POR QUE ELA EXISTE. O painel consultava o ViaCEP direto do navegador. Isso
  // colide com a CSP da propria aplicacao, que tem `connect-src 'self'` — o
  // browser so fala com o proxy same-origin. O tiro sai pela culatra no
  // diagnostico: o console rotula o bloqueio como erro de rede/CORS, e o
  // ViaCEP nao tem culpa nenhuma (ele responde `Access-Control-Allow-Origin: *`
  // para qualquer origem). Quem barra e a pagina, nao o servico.
  //
  // Trazer a chamada para ca alinha o CEP ao geocoding, que ja era servidor, e
  // mantem a CSP intacta — a alternativa seria abrir `connect-src` para um host
  // externo, afrouxando a regra para todo o painel por causa de um campo.
  app.get<{ Params: { cep: string } }>('/localities/cep/:cep', async (request, reply) => {
    try {
      const digits = (request.params.cep ?? '').replace(/\D/g, '');
      if (digits.length !== 8) {
        return reply.code(400).send({ message: 'Informe um CEP valido.' });
      }

      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
        // Mesmo motivo do geocoding: servico externo lento nao pode segurar a
        // conexao (e uma do pool) por tempo indefinido.
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error('Erro ao consultar o servico de CEP.');
      }

      const data = (await response.json()) as ViaCepResult;

      // CEP inexistente volta como 200 com `{"erro": ...}`, e o valor ora e o
      // booleano `true`, ora a string `"true"`. Tratar so o booleano faria um
      // CEP invalido virar endereco em branco preenchido por cima do que o
      // usuario ja tinha digitado.
      if (data.erro === true || String(data.erro) === 'true') {
        return reply.code(404).send({ message: 'CEP nao encontrado.' });
      }

      return {
        cep: data.cep ?? '',
        logradouro: data.logradouro ?? '',
        bairro: data.bairro ?? '',
        cidade: data.localidade ?? '',
        estado: data.uf ?? '',
      };
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao consultar o CEP.'),
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

    return request.tenantDb.$queryRaw<LocalidadeRow[]>(Prisma.sql`
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
      await assertCompanyInTenant(request.tenantDb, data.idEmpresa, idCliente);
      const rows = await request.tenantDb.$queryRaw<LocalidadeRow[]>(Prisma.sql`
        INSERT INTO "tb_Localidades"
          ("idEmpresa", "nmLocalidade", "dsLocalidade", "cnLocalidadeTP", "geoLocalidade", "dtAlteracao", "boInativo")
        VALUES (${data.idEmpresa}, ${data.nmLocalidade}, ${data.dsLocalidade}, ${data.cnLocalidadeTP},
          ST_SetSRID(ST_MakePoint(${data.longitude}, ${data.latitude}), 4326), now(), ${data.boInativo})
        RETURNING ${SELECT_COLUMNS}
      `);
      return reply.code(201).send(rows[0]);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao criar localidade.'),
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
      const current = await findTenantLocality(request.tenantDb, id, idCliente);
      if (!current) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const data = normalizeLocalidadePayload(request.body);
      await assertCompanyInTenant(request.tenantDb, data.idEmpresa, idCliente);

      const rows = await request.tenantDb.$queryRaw<LocalidadeRow[]>(Prisma.sql`
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
        message: clientErrorMessage(error, 'Erro ao atualizar localidade.'),
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
      const current = await findTenantLocality(request.tenantDb, id, idCliente);
      if (!current) return reply.code(404).send({ message: 'Registro nao encontrado.' });
      const boInativo = toBool(request.body.boInativo);

      const rows = await request.tenantDb.$queryRaw<LocalidadeRow[]>(Prisma.sql`
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
