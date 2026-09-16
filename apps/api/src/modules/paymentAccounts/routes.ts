// Contas de recebimento: por onde a academia recebe o dinheiro do aluno.
//
// A conta e do CLIENTE. O dinheiro vai direto do aluno para a conta dele e o
// SmartGym so faz a ponte — nada aqui movimenta valor, e essa e a razao de o
// modulo existir separado: manter o dinheiro fora do nosso fluxo.
//
// REGRA QUE GOVERNA O ARQUIVO INTEIRO: nenhuma rota de LEITURA devolve segredo.
// A credencial e a chave Pix saem sempre mascaradas. O valor em claro so existe
// no momento da gravacao e dentro de quem for emitir a cobranca — nunca no
// caminho de volta para o browser. Uma leitura que devolve o segredo transforma
// qualquer permissao mal configurada em vazamento de credencial.
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@smartgym/db';
import { z } from 'zod';
import { prisma } from '../../shared/prisma.js';
import { assertValidId, optionalNumber } from '../../shared/normalize.js';
import { clientErrorMessage } from '../../shared/errors.js';
import { encryptSecret, maskPixKey, maskSecret } from '../../shared/secrets.js';

const PROVEDORES = ['pix_manual', 'asaas', 'mercadopago'] as const;
const AMBIENTES = ['sandbox', 'producao'] as const;
const TIPOS_CHAVE_PIX = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria'] as const;

const upsertSchema = z.object({
  dsConta: z.string().min(2).max(120),
  cnProvedor: z.enum(PROVEDORES),
  cnAmbiente: z.enum(AMBIENTES).optional(),
  idEmpresa: z.union([z.number(), z.string()]).nullish(),
  chavePix: z.string().max(200).nullish(),
  cnTipoChavePix: z.enum(TIPOS_CHAVE_PIX).nullish(),
  nmBeneficiario: z.string().max(25).nullish(),
  dsCidade: z.string().max(15).nullish(),
  credencial: z.string().max(400).nullish(),
  boPadrao: z.boolean().optional(),
});

/**
 * O que a API devolve. Note o que NAO esta aqui: `caChavePix` e `caCredencial`
 * em claro. Esta funcao e o unico ponto de saida do modulo, entao esquecer a
 * mascara exigiria mexer aqui de proposito.
 */
function toResponse(conta: {
  id: number;
  idCliente: number;
  idEmpresa: number | null;
  dsConta: string;
  cnProvedor: string;
  cnAmbiente: string;
  caChavePix: string | null;
  cnTipoChavePix: string | null;
  nmBeneficiario: string | null;
  dsCidade: string | null;
  caCredencial: string | null;
  caTokenWebhook: string | null;
  boPadrao: boolean;
  boInativo: boolean;
  dtCadastro: Date;
  empresa?: { id: number; dsEmpresa: string } | null;
}) {
  return {
    id: conta.id,
    idCliente: conta.idCliente,
    idEmpresa: conta.idEmpresa,
    empresa: conta.empresa ?? null,
    dsConta: conta.dsConta,
    cnProvedor: conta.cnProvedor,
    cnAmbiente: conta.cnAmbiente,
    cnTipoChavePix: conta.cnTipoChavePix,
    nmBeneficiario: conta.nmBeneficiario,
    dsCidade: conta.dsCidade,
    boPadrao: conta.boPadrao,
    boInativo: conta.boInativo,
    dtCadastro: conta.dtCadastro,
    // Mascarados: o operador reconhece o que esta cadastrado sem conseguir ler.
    chavePixMascarada: maskPixKey(conta.caChavePix, conta.cnTipoChavePix),
    credencialMascarada: maskSecret(conta.caCredencial),
    // Booleanos em vez dos valores: a tela precisa saber se ja existe algo
    // cadastrado para decidir se pede o campo, e isso nao exige o segredo.
    temChavePix: conta.caChavePix !== null,
    temCredencial: conta.caCredencial !== null,
    // O caminho do webhook, para a academia colar no painel do provedor. E um
    // endereco de capacidade: quem o tem consegue POSTAR eventos. Sai so para
    // quem ja tem billing.read — a mesma permissao que le a conta.
    caminhoWebhook: conta.caTokenWebhook ? `/webhooks/payments/${conta.caTokenWebhook}` : null,
    urlWebhook:
      conta.caTokenWebhook && urlPublicaDaApi()
        ? `${urlPublicaDaApi()}/webhooks/payments/${conta.caTokenWebhook}`
        : null,
    // O mesmo token vai no header que o provedor manda de volta. E o segredo
    // que a academia cola no campo "token de autenticacao" do painel.
    tokenWebhook: conta.caTokenWebhook,
  };
}

const SELECT = {
  id: true,
  idCliente: true,
  idEmpresa: true,
  dsConta: true,
  cnProvedor: true,
  cnAmbiente: true,
  caChavePix: true,
  cnTipoChavePix: true,
  nmBeneficiario: true,
  dsCidade: true,
  caCredencial: true,
  caTokenWebhook: true,
  boPadrao: true,
  boInativo: true,
  dtCadastro: true,
  empresa: { select: { id: true, dsEmpresa: true } },
} as const;

/**
 * Endereco publico DESTA API, para montar a URL do webhook.
 *
 * Precisa vir do ambiente porque quem chama o webhook e o provedor, direto na
 * API — nao o navegador, que so conhece o proxy do site. Ausente, a tela mostra
 * so o caminho e explica o que prefixar; inventar um host aqui produziria uma
 * URL errada que a academia colaria no painel e passaria semanas sem eventos.
 */
function urlPublicaDaApi(): string | null {
  const url = (process.env.API_PUBLIC_URL ?? '').trim().replace(/\/+$/, '');
  return url || null;
}

/**
 * Endereco secreto do webhook desta conta.
 *
 * 32 bytes em base64url dao 43 caracteres — dentro do padrao aceito pela rota
 * publica e longo o bastante para nao ser adivinhado. Gerado no servidor e
 * nunca escolhido pelo operador: token que alguem digita e token fraco.
 */
function novoTokenWebhook(): string {
  return randomBytes(32).toString('base64url');
}

/** Digitos, para CPF/CNPJ/telefone. */
function onlyDigits(value: string) {
  return value.replace(/\D/g, '');
}

/**
 * Normaliza a chave conforme o tipo e recusa o que o Pix nao aceita.
 *
 * Validar aqui e o que impede a conta de ficar cadastrada e so falhar no dia
 * da primeira cobranca — que e o pior momento possivel para descobrir que a
 * chave estava errada.
 */
function normalizePixKey(chave: string, tipo: string): string {
  const valor = chave.trim();

  if (tipo === 'cpf') {
    const digitos = onlyDigits(valor);
    if (digitos.length !== 11) throw new Error('CPF da chave Pix deve ter 11 digitos.');
    return digitos;
  }
  if (tipo === 'cnpj') {
    const digitos = onlyDigits(valor);
    if (digitos.length !== 14) throw new Error('CNPJ da chave Pix deve ter 14 digitos.');
    return digitos;
  }
  if (tipo === 'telefone') {
    const digitos = onlyDigits(valor);
    if (digitos.length < 10 || digitos.length > 11) {
      throw new Error('Telefone da chave Pix deve ter DDD e numero.');
    }
    // O Pix exige o telefone no formato internacional (+55...).
    return `+55${digitos}`;
  }
  if (tipo === 'email') {
    const email = valor.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 77) {
      throw new Error('E-mail da chave Pix invalido.');
    }
    return email;
  }
  // Aleatoria: o Banco Central emite UUID v4.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)) {
    throw new Error('Chave aleatoria deve ser o UUID gerado pelo banco.');
  }
  return valor.toLowerCase();
}

/**
 * Monta os campos de segredo a gravar.
 *
 * Campo ausente no corpo = NAO MEXE no que esta gravado. E o que permite editar
 * o nome da conta sem reenviar a credencial — e, como a leitura devolve so a
 * mascara, exigir o reenvio significaria perder o segredo em toda edicao.
 */
function buildSecretData(body: z.infer<typeof upsertSchema>) {
  const data: Record<string, unknown> = {};

  if (body.chavePix !== undefined) {
    const chave = (body.chavePix ?? '').trim();
    if (!chave) {
      data.caChavePix = null;
      data.cnTipoChavePix = null;
    } else {
      const tipo = body.cnTipoChavePix;
      if (!tipo) throw new Error('Informe o tipo da chave Pix.');
      data.caChavePix = encryptSecret(normalizePixKey(chave, tipo));
      data.cnTipoChavePix = tipo;
    }
  }

  if (body.credencial !== undefined) {
    const credencial = (body.credencial ?? '').trim();
    data.caCredencial = credencial ? encryptSecret(credencial) : null;
  }

  return data;
}

/**
 * So uma conta padrao por escopo (rede ou filial).
 *
 * Sem isto, duas contas marcadas como padrao fariam a emissao de cobranca
 * escolher por ordem de id — que e o mesmo que escolher ao acaso, com dinheiro.
 */
async function clearOtherDefaults(
  transaction: Prisma.TransactionClient,
  idCliente: number,
  idEmpresa: number | null,
  exceptId?: number,
) {
  await transaction.contaRecebimento.updateMany({
    where: {
      idCliente,
      idEmpresa,
      boPadrao: true,
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    data: { boPadrao: false },
  });
}

export async function registerPaymentAccountRoutes(app: FastifyInstance) {
  app.get('/payment-accounts', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    try {
      const contas = await request.tenantDb.contaRecebimento.findMany({
        where: { idCliente },
        select: SELECT,
        // Rede primeiro (idEmpresa nulo), depois por filial. `nulls: 'first'` e
        // explicito porque o Postgres ordena nulo por ULTIMO em ASC — sem isto
        // a conta que vale para todas as unidades apareceria no fim da lista.
        orderBy: [{ idEmpresa: { sort: 'asc', nulls: 'first' } }, { dsConta: 'asc' }],
      });
      return contas.map(toResponse);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao listar as contas de recebimento.'),
      });
    }
  });

  app.post<{ Body: unknown }>('/payment-accounts', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    const parsed = upsertSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: 'Dados invalidos.' });

    try {
      const idEmpresa = optionalNumber(parsed.data.idEmpresa) ?? null;
      if (idEmpresa) {
        const empresa = await request.tenantDb.empresa.findFirst({
          where: { id: idEmpresa, idCliente },
          select: { id: true },
        });
        if (!empresa) return reply.code(404).send({ message: 'Empresa nao encontrada.' });
      }

      const segredos = buildSecretData(parsed.data);

      const conta = await prisma.$transaction(async (transaction) => {
        if (parsed.data.boPadrao) {
          await clearOtherDefaults(transaction, idCliente, idEmpresa);
        }
        return transaction.contaRecebimento.create({
          data: {
            idCliente,
            idEmpresa,
            dsConta: parsed.data.dsConta.trim(),
            cnProvedor: parsed.data.cnProvedor,
            cnAmbiente: parsed.data.cnAmbiente ?? 'producao',
            nmBeneficiario: parsed.data.nmBeneficiario?.trim() || null,
            dsCidade: parsed.data.dsCidade?.trim() || null,
            boPadrao: parsed.data.boPadrao ?? false,
            // So provedor com webhook ganha endereco. Pix manual nao recebe
            // evento de ninguem, e um token ali seria uma porta sem porteiro.
            caTokenWebhook: parsed.data.cnProvedor === 'pix_manual' ? null : novoTokenWebhook(),
            idUsuarioCadastro: request.user.sub,
            ...segredos,
          },
          select: SELECT,
        });
      });

      return reply.code(201).send(toResponse(conta));
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao cadastrar a conta de recebimento.'),
      });
    }
  });

  app.put<{ Params: { id: string }; Body: unknown }>(
    '/payment-accounts/:id',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

      const parsed = upsertSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ message: 'Dados invalidos.' });

      try {
        const id = Number(request.params.id);
        assertValidId(id, 'Conta invalida.');

        const atual = await request.tenantDb.contaRecebimento.findFirst({
          where: { id, idCliente },
          select: { id: true, caTokenWebhook: true },
        });
        if (!atual) return reply.code(404).send({ message: 'Registro nao encontrado.' });

        const idEmpresa = optionalNumber(parsed.data.idEmpresa) ?? null;
        if (idEmpresa) {
          const empresa = await request.tenantDb.empresa.findFirst({
            where: { id: idEmpresa, idCliente },
            select: { id: true },
          });
          if (!empresa) return reply.code(404).send({ message: 'Empresa nao encontrada.' });
        }

        const segredos = buildSecretData(parsed.data);

        const conta = await prisma.$transaction(async (transaction) => {
          if (parsed.data.boPadrao) {
            await clearOtherDefaults(transaction, idCliente, idEmpresa, id);
          }
          return transaction.contaRecebimento.update({
            where: { id },
            data: {
              idEmpresa,
              dsConta: parsed.data.dsConta.trim(),
              cnProvedor: parsed.data.cnProvedor,
              cnAmbiente: parsed.data.cnAmbiente ?? 'producao',
              nmBeneficiario: parsed.data.nmBeneficiario?.trim() || null,
              dsCidade: parsed.data.dsCidade?.trim() || null,
              boPadrao: parsed.data.boPadrao ?? false,
              // Conta que vira gateway ganha endereco de webhook agora. O
              // existente NAO e regerado: a academia ja o colou no painel do
              // provedor, e troca-lo em silencio derrubaria os eventos.
              ...(parsed.data.cnProvedor !== 'pix_manual' && !atual.caTokenWebhook
                ? { caTokenWebhook: novoTokenWebhook() }
                : {}),
              idUsuarioAlteracao: request.user.sub,
              ...segredos,
            },
            select: SELECT,
          });
        });

        return toResponse(conta);
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao atualizar a conta de recebimento.'),
        });
      }
    },
  );

  // Inativar, nao apagar: a conta pode estar referenciada por pagamentos ja
  // emitidos, e o extrato precisa continuar dizendo por onde aquele dinheiro
  // foi cobrado.
  app.patch<{ Params: { id: string }; Body: { boInativo?: boolean } }>(
    '/payment-accounts/:id/status',
    async (request, reply) => {
      const idCliente = request.user.idCliente;
      if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

      try {
        const id = Number(request.params.id);
        assertValidId(id, 'Conta invalida.');

        const atual = await request.tenantDb.contaRecebimento.findFirst({
          where: { id, idCliente },
          select: { id: true },
        });
        if (!atual) return reply.code(404).send({ message: 'Registro nao encontrado.' });

        const boInativo = request.body?.boInativo === true;

        const conta = await request.tenantDb.contaRecebimento.update({
          where: { id },
          data: {
            boInativo,
            // Conta inativa nao pode seguir sendo a padrao: a proxima cobranca
            // sairia por uma conta que alguem desligou de proposito.
            ...(boInativo ? { boPadrao: false } : {}),
            idUsuarioAlteracao: request.user.sub,
          },
          select: SELECT,
        });

        return toResponse(conta);
      } catch (error) {
        return reply.code(400).send({
          message: clientErrorMessage(error, 'Erro ao alterar o status da conta.'),
        });
      }
    },
  );
}
