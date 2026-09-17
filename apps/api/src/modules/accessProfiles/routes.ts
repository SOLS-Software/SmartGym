import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@smartgym/db';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { assertValidId } from '../../shared/normalize.js';
import { toBool } from '../../shared/normalize.js';
import { clientErrorMessage } from '../../shared/errors.js';
import { PERMISSION_DOMAINS, isPermissionKey } from '../../plugins/permissions.js';
import { ensureDefaultProfiles } from '../../shared/accessProfiles.js';

const profileBodySchema = z.object({
  dsPerfil: z.string().min(1).max(100),
  permissoes: z.array(z.string().max(60)).max(200).optional(),
  boInativo: z.union([z.boolean(), z.number(), z.string()]).nullish(),
});

const statusBodySchema = z.object({
  boInativo: z.union([z.boolean(), z.number(), z.string()]),
});

export async function registerAccessProfileRoutes(app: FastifyInstance) {
  async function findTenantProfile(db: PrismaClient, id: number, idCliente: number) {
    return db.perfilAcesso.findFirst({ where: { id, idCliente }, select: { id: true, boPadrao: true } });
  }

  // Catalogo de permissoes que a tela de perfis renderiza. Vem do servidor (e
  // nao de uma copia no web) para a tela nunca oferecer uma permissao que o
  // RBAC nao conhece — a lista e a MESMA que o hook de auth aplica.
  app.get('/access-profiles/permissions', async () => {
    return PERMISSION_DOMAINS.map((domain) => ({
      key: domain.key,
      label: domain.label,
      description: domain.description,
      permissions: [
        { key: `${domain.key}.read`, action: 'read', label: 'Ver' },
        { key: `${domain.key}.write`, action: 'write', label: 'Editar' },
      ],
    }));
  });

  app.get('/access-profiles', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    // Semeadura preguicosa: clientes criados antes desta feature (e, agora,
    // clientes cadastrados pelo painel do provedor, que so toca control-plane)
    // nao teriam perfil nenhum e a tela abriria vazia, sem caminho obvio.
    //
    // O CLIENT E O DO TENANT, nao o central. tb_PerfisAcesso e tabela de
    // APLICACAO: com banco por cliente, semear no central gravaria no lugar
    // errado enquanto o findMany logo abaixo le do banco do cliente — a tela
    // continuaria vazia e a semeadura se repetiria a cada abertura, inflando o
    // central com linhas que ninguem le. E a "duas verdades" do rollout.
    //
    // Este acesso escapou do medidor (tenantRolloutScan) porque o client viaja
    // como ARGUMENTO de funcao, e a varredura procura `prisma.<model>`.
    await ensureDefaultProfiles(request.tenantDb, idCliente);

    const profiles = await request.tenantDb.perfilAcesso.findMany({
      where: { idCliente },
      orderBy: [{ boInativo: 'asc' }, { dsPerfil: 'asc' }],
      include: {
        permissoes: { select: { cnPermissao: true } },
        _count: { select: { funcionarios: true } },
      },
    });

    return profiles.map((profile) => ({
      id: profile.id,
      dsPerfil: profile.dsPerfil,
      boPadrao: profile.boPadrao,
      boInativo: profile.boInativo,
      dtCadastro: profile.dtCadastro,
      permissoes: profile.permissoes.map((item) => item.cnPermissao),
      qtFuncionarios: profile._count.funcionarios,
    }));
  });

  app.post<{ Body: unknown }>('/access-profiles', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
    const parsed = profileBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: 'Dados invalidos.' });

    try {
      const permissions = sanitizePermissions(parsed.data.permissoes);
      const profile = await request.tenantDb.perfilAcesso.create({
        data: {
          // O tenant vem SEMPRE do token — nunca do body.
          idCliente,
          dsPerfil: parsed.data.dsPerfil.trim(),
          boInativo: toBool(parsed.data.boInativo),
          permissoes: { create: permissions.map((cnPermissao) => ({ cnPermissao })) },
        },
      });
      return reply.code(201).send(profile);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao criar perfil de acesso.'),
      });
    }
  });

  app.put<{ Params: { id: string }; Body: unknown }>(
    '/access-profiles/:id',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      const parsed = profileBodySchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ message: 'Dados invalidos.' });

      try {
        const id = Number(request.params.id);
        assertValidId(id, 'Perfil invalido.');
        const current = await findTenantProfile(request.tenantDb, id, idCliente);
        if (!current) return reply.code(404).send({ message: 'Registro nao encontrado.' });

        const permissions = sanitizePermissions(parsed.data.permissoes);

        // Substituicao completa do conjunto, dentro de uma transacao: o corpo
        // representa o estado final da matriz de caixas da tela. Aplicar em
        // duas etapas soltas deixaria uma janela com o perfil sem permissao
        // nenhuma — e o RBAC le do banco a cada request.
        return await prisma.$transaction(async (transaction) => {
          await transaction.perfilAcessoPermissao.deleteMany({ where: { idPerfilAcesso: id } });
          return transaction.perfilAcesso.update({
            where: { id },
            data: {
              dsPerfil: parsed.data.dsPerfil.trim(),
              boInativo: toBool(parsed.data.boInativo),
              permissoes: { create: permissions.map((cnPermissao) => ({ cnPermissao })) },
            },
            include: { permissoes: { select: { cnPermissao: true } } },
          });
        });
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao atualizar perfil de acesso.'),
        });
      }
    },
  );

  app.patch<{ Params: { id: string }; Body: unknown }>(
    '/access-profiles/:id/status',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });
      const parsed = statusBodySchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ message: 'Dados invalidos.' });

      try {
        const id = Number(request.params.id);
        assertValidId(id, 'Perfil invalido.');
        const current = await findTenantProfile(request.tenantDb, id, idCliente);
        if (!current) return reply.code(404).send({ message: 'Registro nao encontrado.' });

        const inativo = toBool(parsed.data.boInativo);

        // Inativar um perfil derruba o acesso de todo mundo que esta nele (o
        // hook trata perfil inativo como perfil ausente). Avisar aqui e melhor
        // do que o gerente descobrir pela recepcao ligando.
        if (inativo) {
          const employees = await request.tenantDb.funcionario.count({
            where: { idPerfilAcesso: id, boInativo: false },
          });
          if (employees > 0) {
            return reply.code(400).send({
              message: `Este perfil esta em uso por ${employees} funcionario(s). Mova-os para outro perfil antes de inativar.`,
            });
          }
        }

        return await request.tenantDb.perfilAcesso.update({ where: { id }, data: { boInativo: inativo } });
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao atualizar status do perfil.'),
        });
      }
    },
  );
}

// Descarta chaves que nao existem no catalogo. Sem isto, um corpo com
// 'financeiro.total' gravaria uma linha que nenhuma rota consulta — permissao
// fantasma, que confunde auditoria depois.
function sanitizePermissions(values: string[] | undefined): string[] {
  if (!values) return [];
  return [...new Set(values.filter(isPermissionKey))];
}
