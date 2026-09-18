import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { prisma } from '../../shared/prisma.js';
import {
  normalizeRegisterCpf,
  normalizeRegisterLogin,
  normalizeRegisterPassword,
} from '../../shared/normalize.js';
import { HASH_TYPE_BCRYPT, dummyVerify, hashPassword, verifyPassword } from '../../shared/passwords.js';
import { cpfHash, decryptCpfValue } from '../../shared/pii.js';
import { TOKEN_EXPIRY_MOBILE, TOKEN_EXPIRY_WEB } from '../../plugins/auth.js';
import { PROVIDER_SETUP_PERMISSIONS } from '../../plugins/permissions.js';
import { getSupabaseClient, getSupabaseConfig, getClientSupabaseConfig } from '../../shared/supabase.js';
import { getStudentAccessStatus } from '../../shared/studentAccess.js';
import { getTenantDb } from '../../shared/tenantDataSource.js';
import { resolveTenantByDomain } from '../../shared/tenantResolver.js';
import type {
  ForgotPasswordPayload,
  LoginPayload,
  RegisterLookupQuery,
  RegisterPayload,
  ThemeQuery,
  VerifySessionQuery,
} from '../../shared/api-types.js';
import { clientErrorMessage } from '../../shared/errors.js';
import { isExpoPushToken } from '../../shared/push.js';

// Mascara o email cadastrado para exibicao no auto-cadastro: mostra o
// suficiente para o titular reconhecer a propria caixa ("jo***@gm***.com")
// sem entregar o endereco a quem so descobriu o CPF. O endereco completo e
// exigido em /auth/register e conferido no servidor — ou seja, o CPF sozinho
// (dado nada secreto no Brasil) deixa de bastar para criar a conta.
export function maskEmail(email: string | null | undefined): string {
  const value = (email ?? '').trim();
  const at = value.lastIndexOf('@');
  if (at <= 0) return '';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const domainName = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : '';
  const keep = (text: string) => (text.length <= 2 ? text.slice(0, 1) : text.slice(0, 2));
  return `${keep(local)}***@${keep(domainName)}***${tld}`;
}

type ProfileWithPermissions = {
  id: number;
  dsPerfil: string;
  boInativo: boolean;
  permissoes: { cnPermissao: string }[];
};

// Permissoes concedidas pelo perfil do funcionario. Perfil ausente ou inativo
// = lista vazia, exatamente o que o hook de auth aplica no servidor.
function employeePermissions(profile: ProfileWithPermissions | null): string[] {
  if (!profile || profile.boInativo) return [];
  return profile.permissoes.map((item) => item.cnPermissao);
}

function describeProfile(profile: ProfileWithPermissions | null) {
  return profile ? { id: profile.id, dsPerfil: profile.dsPerfil, boInativo: profile.boInativo } : null;
}

// resolveTenantByDomain foi extraido para shared/tenantResolver.ts: e o "quem e
// o tenant" control-plane que tambem precede a escolha de conexao no
// multi-tenancy de dados (docs/multi-tenancy-dados.md). O login continua usando
// exatamente o mesmo criterio (achado A-2).

/**
 * Cria a identidade central (usuario + senha) numa transacao SO do central.
 *
 * `caCPFHash` entra aqui porque e a CHAVE DE LOGIN: sem ela gravada agora, a
 * conta nasceria invisivel para o /auth/login, que procura por ela. Ver
 * shared/loginKey.ts.
 */
async function criarConta(args: {
  idCliente: number;
  idAluno?: number;
  idFuncionario?: number;
  nome: string;
  dsLogin: string;
  caCPFHash: string;
  senhaHash: string;
}) {
  const user = await prisma.$transaction(async (tx) => {
    const criado = await tx.usuario.create({
      data: {
        idCliente: args.idCliente,
        idAluno: args.idAluno ?? null,
        idFuncionario: args.idFuncionario ?? null,
        dsLogin: args.dsLogin,
        caCPFHash: args.caCPFHash,
        boInativo: false,
      },
    });
    await tx.senha.create({
      data: {
        idUsuario: criado.id,
        dsSenha: args.senhaHash,
        cnTipoHash: HASH_TYPE_BCRYPT,
        boTrocaObrigatoria: false,
      },
    });
    return criado;
  });
  return { id: user.id, name: args.nome, login: user.dsLogin };
}

/**
 * Carrega o PERFIL da pessoa no banco do cliente dela.
 *
 * A identidade (login, senha, tenant) e central; o perfil — nome, contato,
 * situacao e o vinculo com o perfil de acesso — e dado do cliente. Enquanto
 * tudo dividia um banco, um `include` resolvia os dois de uma vez; com banco
 * por cliente sao duas consultas, e esta e a segunda.
 *
 * `ativo` distingue "a conta existe" de "a pessoa ainda e aluna/funcionaria
 * daqui": a ficha desativada tranca o acesso mesmo com a conta central viva.
 */
async function carregarPerfil(
  idCliente: number | null,
  alvo: { idAluno?: number | null; idFuncionario?: number | null },
): Promise<{
  nome: string | null;
  email: string | null;
  ativo: boolean;
  idEmpresa: number | null;
  perfilAcesso: ProfileWithPermissions | null;
}> {
  const vazio = { nome: null, email: null, ativo: false, idEmpresa: null, perfilAcesso: null };
  if (!idCliente) return vazio;
  const db = await getTenantDb(idCliente);

  if (alvo.idAluno) {
    const aluno = await db.aluno.findUnique({
      where: { id: alvo.idAluno },
      select: { nmAluno: true, anEmail: true, boInativo: true },
    });
    if (!aluno) return vazio;
    return {
      nome: aluno.nmAluno,
      email: aluno.anEmail,
      ativo: !aluno.boInativo,
      idEmpresa: null,
      perfilAcesso: null,
    };
  }

  if (alvo.idFuncionario) {
    const funcionario = await db.funcionario.findUnique({
      where: { id: alvo.idFuncionario },
      select: {
        nmFuncionario: true,
        anEmail: true,
        boInativo: true,
        idEmpresa: true,
        perfilAcesso: {
          select: {
            id: true,
            dsPerfil: true,
            boInativo: true,
            permissoes: { select: { cnPermissao: true } },
          },
        },
      },
    });
    if (!funcionario) return vazio;
    return {
      nome: funcionario.nmFuncionario,
      email: funcionario.anEmail,
      ativo: !funcionario.boInativo,
      idEmpresa: funcionario.idEmpresa,
      perfilAcesso: funcionario.perfilAcesso ?? null,
    };
  }

  return vazio;
}

/**
 * Marca do cliente da sessao — as cores que o aplicativo veste depois do login.
 *
 * VAI NA RESPOSTA DO LOGIN, e nao numa rota propria, pelo mesmo motivo do
 * idEmpresa: e dado de SESSAO. A rota que ja existia, GET /clients/:id/theme,
 * cai sob a regra de permissao do prefixo /clients, que exige `companies.read`.
 * Um ALUNO nao tem permissao nenhuma, entao tomava 403 e ficava para sempre com
 * as cores padrao — que e exatamente o defeito que isto conserta. Aqui nao ha
 * permissao para acertar: quem recebe a marca e quem acabou de provar que
 * pertence ao cliente.
 *
 * O WEB NAO USA ISTO. La a marca chega por /auth/theme, resolvida pelo HOSTNAME
 * antes mesmo do login — o navegador ja sabe de qual academia e a pagina. O
 * aplicativo nao tem hostname; ele so descobre a academia quando alguem entra.
 * Mesma tabela (tb_ClientesMarcas), dois caminhos, porque as duas pontas
 * descobrem o tenant de formas diferentes.
 */
async function carregarMarca(idCliente: number | null) {
  if (!idCliente) return null;
  const marca = await prisma.clienteMarca.findUnique({
    where: { idCliente },
    select: {
      idCliente: true,
      corPrimaria: true,
      corSecundaria: true,
      corAcentuacao: true,
      corTexto: true,
      corFundo: true,
      fontePrincipal: true,
      fonteSecundaria: true,
      tamanhoBase: true,
      espacamentoPadrao: true,
      raioCardBorder: true,
      boModoEscuro: true,
      anCaminhoLogo: true,
      cliente: {
        select: {
          dsCliente: true,
          // Dominio ATIVO da academia, para o app saber onde mora a politica de
          // privacidade dela. Preferindo o proprio dominio ao subdominio nosso:
          // quando a academia tem endereco proprio, e o dela que o aluno
          // reconhece — e e para ele que a politica aponta.
          dominios: {
            where: { boAtivo: true },
            select: { urlDominio: true },
            orderBy: { boSubdominio: 'asc' },
            take: 1,
          },
        },
      },
    },
  });
  if (!marca) return null;

  const { anCaminhoLogo, cliente, ...cores } = marca;

  // URL ASSINADA do logo, com validade de uma hora.
  //
  // O arquivo mora num bucket PRIVADO do provedor; nao ha endereco publico para
  // guardar no banco. A assinatura vence, e o app fica com um endereco morto se
  // a sessao passar de uma hora aberta — mas o /auth/verify do boot renova, e o
  // pior caso e a tela aparecer sem o logo, nunca um erro. Trocar isso por
  // bucket publico seria expor o material de marca de todos os clientes para
  // economizar uma assinatura.
  //
  // Falha de storage NAO derruba o login: quem nao consegue entrar por causa de
  // uma imagem tem um problema muito maior que a imagem.
  let logoUrl: string | null = null;
  if (anCaminhoLogo) {
    try {
      const config = getClientSupabaseConfig();
      const { data } = await getSupabaseClient()
        .storage.from(config.bucket)
        .createSignedUrl(anCaminhoLogo, 3600);
      logoUrl = data?.signedUrl ?? null;
    } catch {
      /* sem logo a tela usa so o nome; nao vale derrubar a entrada */
    }
  }

  // Endereco da politica de privacidade DESTA academia. Montado aqui porque so
  // o servidor conhece o dominio dela: o aplicativo nao tem hostname, e sem
  // isto a tela de privacidade teria de apontar para um endereco fixo que nao
  // seria o da academia de quem esta lendo.
  const dominio = cliente?.dominios?.[0]?.urlDominio ?? null;

  return {
    ...cores,
    dsCliente: cliente?.dsCliente ?? null,
    logoUrl,
    urlPrivacidade: dominio ? `https://${dominio}/privacidade` : null,
    urlExclusaoConta: dominio ? `https://${dominio}/excluir-conta` : null,
  };

}

export async function registerAuthRoutes(app: FastifyInstance) {
  // Limites restritos de rate limit para endpoints de autenticacao (anti brute
  // force / enumeracao). O limite global de 300/min continua valendo no resto.
  const authRateLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };
  const lookupRateLimit = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } };
  // /auth/theme e publica e gera signed URL do Supabase a cada acerto de dominio.
  // Sem teto proprio ela so respondia ao limite global de 300/min. 30/min por IP
  // cobre o carregamento normal da pagina (o web chama no boot) e corta o abuso
  // de gerar signed URLs em massa.
  const themeRateLimit = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  app.post<{
    Body: LoginPayload;
  }>('/auth/login', authRateLimit, async (request, reply) => {
    try {
      const cpf = normalizeRegisterCpf(request.body.login);
      const password = request.body.password ?? '';

      // Tenant pelo dominio de acesso (web); null no mobile. Quando resolve um
      // cliente, o lookup por CPF e escopado a ele — e assim que "entrar pela
      // pagina da academia X" so alcanca a conta da academia X, e nao a de outro
      // tenant que por acaso tem o mesmo CPF.
      const idClienteDominio = await resolveTenantByDomain(request.body.caDominio);

      // Todos os usuarios com aquele CPF (aluno OU funcionario), escopados ao
      // cliente do dominio quando ha um. O mesmo CPF pode ter conta em varios
      // tenants (Aluno e @@unique([idCliente, caCPFHash])); a SENHA desambigua
      // qual e a conta de quem esta entrando — o findFirst por CPF de antes
      // caia sempre na de menor id e trancava quem se cadastrou depois. Ordem
      // estavel para o desempate (mesma senha em dois tenants, caso rarissimo)
      // ser deterministico.
      const candidatos = await prisma.usuario.findMany({
        where: {
          boInativo: false,
          ...(idClienteDominio ? { idCliente: idClienteDominio } : {}),
          // Chave de login da identidade CENTRAL. Antes o filtro atravessava
          // para tb_Alunos/tb_Funcionarios — um JOIN que deixa de existir com
          // banco por cliente, porque quem esta entrando ainda nao disse de
          // qual academia e. Ver shared/loginKey.ts.
          caCPFHash: cpfHash(cpf),
        },
        orderBy: { id: 'asc' },
      });

      // Procura a conta cuja senha confere. `expired` (senha certa, mas formato
      // legado ja vencido — ver LEGACY_PASSWORD_DEADLINE) so importa se for a
      // conta certa: guardamos e so usamos se nenhuma outra autenticar.
      let autenticado:
        | { user: (typeof candidatos)[number]; senhaId: number | null; needsRehash: boolean }
        | null = null;
      let expirouAlguma = false;
      for (const candidato of candidatos) {
        const senha = await prisma.senha.findFirst({
          where: { idUsuario: candidato.id, boInativo: false },
          orderBy: { dtCadastro: 'desc' },
        });
        const { valid, needsRehash, expired } = await verifyPassword(password, senha);
        if (expired) {
          expirouAlguma = true;
          continue;
        }
        if (valid) {
          autenticado = { user: candidato, senhaId: senha?.id ?? null, needsRehash };
          break;
        }
      }

      if (!autenticado) {
        // Timing: sem nenhum candidato, ainda gastamos um bcrypt para nao vazar
        // existencia de conta (aqui a iteracao acima nao rodou nenhum verify).
        if (candidatos.length === 0) {
          await dummyVerify(password);
        }
        // Senha certa mas em formato legado vencido: orienta a redefinir. So
        // dispara com a senha correta, entao nao vira oraculo de enumeracao.
        if (expirouAlguma) {
          return reply.code(403).send({
            message: 'Por seguranca, redefina sua senha em "Esqueci minha senha".',
          });
        }
        throw new Error('Usuario ou senha invalidos.');
      }

      const user = autenticado.user;

      // Rehash progressivo: registros legados (SHA-256 ou texto puro) sao
      // regravados com bcrypt no proprio login, sem acao do usuario.
      if (autenticado.needsRehash && autenticado.senhaId) {
        await prisma.senha.update({
          where: { id: autenticado.senhaId },
          data: { dsSenha: await hashPassword(password), cnTipoHash: HASH_TYPE_BCRYPT },
        });
      }

      // Tenant do usuario: gravado em Usuario.idCliente desde 09/2026. Antes
      // era deduzido a cada login por funcionario.empresa/aluno, o que deixava
      // sem tenant o funcionario ainda sem filial vinculada.
      const idCliente = user.idCliente;
      const token = app.jwt.sign(
        {
          sub: user.id,
          role: user.idAluno ? 'student' : 'employee',
          idAluno: user.idAluno,
          idFuncionario: user.idFuncionario,
          idCliente,
          superAdmin: user.boSuperAdmin || undefined,
          tv: user.nrTokenVersion,
          // Mesma leitura que decide a validade do token logo abaixo: o que nao
          // se declara `mobile` e tratado como navegador. Nao ha adivinhacao
          // nova aqui — so o registro de uma decisao que ja era tomada.
          cli: request.body.client === 'mobile' ? 'mobile' : 'web',
        },
        { expiresIn: request.body.client === 'mobile' ? TOKEN_EXPIRY_MOBILE : TOKEN_EXPIRY_WEB },
      );

      // Segunda consulta: o perfil, no banco do cliente (ver carregarPerfil).
      const perfil = await carregarPerfil(idCliente, {
        idAluno: user.idAluno,
        idFuncionario: user.idFuncionario,
      });

      // Ficha desativada tranca o acesso mesmo com a conta central viva: quem
      // deixou de ser aluno ou funcionario da academia nao entra.
      if (!perfil.ativo) {
        throw new Error('Usuario ou senha invalidos.');
      }

      const dbTenant = idCliente ? await getTenantDb(idCliente) : prisma;

      return {
        token,
        id: user.id,
        idAluno: user.idAluno,
        idFuncionario: user.idFuncionario,
        // Filial do funcionario. O app da equipe precisa dela para gravar venda
        // e treino em nome de uma unidade, e pedi-la por GET /companies exigiria
        // companies.read — permissao que a recepcao nao tem por que ter. A
        // unidade da PROPRIA pessoa e dado da sessao, e nao listagem de
        // cadastro. Aluno nao tem filial fixa: vem nulo.
        idEmpresa: perfil.idEmpresa,
        idCliente,
        // Cores da academia. O app nao tem hostname para perguntar antes.
        theme: await carregarMarca(idCliente),
        login: user.dsLogin,
        name: perfil.nome ?? user.dsLogin,
        type: user.idAluno ? 'student' : 'employee',
        // Operacao interna (SOLS). Vai para o cliente pelo mesmo motivo das
        // permissoes: montar a tela. Quem barra de verdade e o servidor.
        superAdmin: user.boSuperAdmin || undefined,
        // Permissoes efetivas do perfil. O web usa para montar o menu; a
        // AUTORIZACAO de verdade continua no servidor, a cada request (o hook
        // de auth le do banco). Aluno nao tem perfil: lista vazia.
        perfilAcesso: describeProfile(perfil.perfilAcesso),
        permissions: employeePermissions(perfil.perfilAcesso),
        // Informational only — login itself is not blocked by plan/payment
        // status; the frontend decides how to react (banner, restrict screens).
        studentAccess: user.idAluno
          ? await getStudentAccessStatus(dbTenant, user.idAluno)
          : null,
      };
    } catch (error) {
      // Mensagem generica sempre: nao vazar detalhes internos (ex.: erro de
      // banco) nem diferenciar usuario inexistente de senha errada.
      request.log.warn(error);
      return reply.code(401).send({ message: 'Usuario ou senha invalidos.' });
    }
  });

  app.post<{
    Body: ForgotPasswordPayload;
  }>('/auth/forgot-password', authRateLimit, async (request, reply) => {
    // Resposta generica em todos os cenarios (CPF inexistente, sem email ou
    // falha de envio): impede enumeracao de CPFs cadastrados.
    const genericResponse = {
      email: '',
      message: 'Se o CPF estiver cadastrado, voce recebera um email com instrucoes.',
    };

    try {
      const cpf = normalizeRegisterCpf(request.body.cpf);
      const idClienteDominio = await resolveTenantByDomain(request.body.caDominio);

      // Todas as contas com aquele CPF (escopadas ao cliente do dominio quando
      // ha um). O mesmo CPF pode ter conta em varios tenants: cada uma recebe
      // SEU proprio link, que reseta so ela. Antes, o findFirst mandava um unico
      // email para a conta de menor id — e o reset atingia o tenant errado.
      const contas = await prisma.usuario.findMany({
        where: {
          boInativo: false,
          ...(idClienteDominio ? { idCliente: idClienteDominio } : {}),
          // Chave de login da identidade CENTRAL. Antes o filtro atravessava
          // para tb_Alunos/tb_Funcionarios — um JOIN que deixa de existir com
          // banco por cliente, porque quem esta entrando ainda nao disse de
          // qual academia e. Ver shared/loginKey.ts.
          caCPFHash: cpfHash(cpf),
        },
      });

      if (contas.length === 0) {
        return reply.send(genericResponse);
      }

      const webAppUrl = (process.env.WEB_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      } as SMTPTransport.Options);

      for (const conta of contas) {
        // O email de contato e da FICHA, que mora no banco do cliente; a conta
        // central so guarda o login. Buscar por conta e mais consultas do que
        // um include, mas e a unica forma quando ficha e conta podem estar em
        // bancos diferentes — e sao poucas contas por CPF.
        const perfil = conta.dsLogin
          ? null
          : await carregarPerfil(conta.idCliente, {
              idAluno: conta.idAluno,
              idFuncionario: conta.idFuncionario,
            });
        const email = conta.dsLogin || perfil?.email || '';
        if (!email) continue;

        // Token single-use com expiracao de 1h: so o SHA-256 vai para o banco;
        // o valor real trafega apenas no link enviado por email.
        const resetToken = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(resetToken).digest('hex');

        await prisma.$transaction([
          // Invalida tokens abertos anteriores desta conta.
          prisma.recuperacaoSenha.updateMany({
            where: { idUsuario: conta.id, dtUtilizacao: null },
            data: { dtUtilizacao: new Date() },
          }),
          prisma.recuperacaoSenha.create({
            data: {
              idUsuario: conta.id,
              dsTokenHash: tokenHash,
              dtExpiracao: new Date(Date.now() + 60 * 60 * 1000),
            },
          }),
        ]);

        const resetUrl = `${webAppUrl}/redefinir-senha?token=${resetToken}`;

        await transporter.sendMail({
          from: process.env.SMTP_FROM,
          to: email,
          subject: 'Redefinicao de senha - SOLSFIT',
          text: `Recebemos um pedido de redefinicao de senha da sua conta SOLSFIT. Acesse o link para criar uma nova senha (valido por 1 hora): ${resetUrl}\n\nSe voce nao solicitou, ignore este email — nenhuma acao foi tomada.`,
          html: `<p>Recebemos um pedido de redefinicao de senha da sua conta SOLSFIT.</p><p><a href="${resetUrl}">Clique aqui para criar uma nova senha</a> (link valido por 1 hora).</p><p>Se voce nao solicitou, ignore este email — nenhuma acao foi tomada.</p>`,
        });
      }

      return reply.send(genericResponse);
    } catch (error) {
      request.log.error(error);
      return reply.send(genericResponse);
    }
  });

  app.post<{
    Body: { token?: string; password?: string };
  }>('/auth/reset-password', authRateLimit, async (request, reply) => {
    try {
      const token = (request.body.token ?? '').trim();
      if (!/^[a-f0-9]{64}$/.test(token)) {
        return reply.code(400).send({ message: 'Link invalido ou expirado.' });
      }

      const password = normalizeRegisterPassword(request.body.password);
      const tokenHash = createHash('sha256').update(token).digest('hex');

      const recovery = await prisma.recuperacaoSenha.findFirst({
        where: { dsTokenHash: tokenHash, dtUtilizacao: null, dtExpiracao: { gt: new Date() } },
      });

      if (!recovery) {
        return reply.code(400).send({ message: 'Link invalido ou expirado.' });
      }

      const hashed = await hashPassword(password);
      await prisma.$transaction([
        prisma.senha.updateMany({
          where: { idUsuario: recovery.idUsuario, boInativo: false },
          data: { boInativo: true },
        }),
        prisma.senha.create({
          data: {
            idUsuario: recovery.idUsuario,
            dsSenha: hashed,
            cnTipoHash: HASH_TYPE_BCRYPT,
            boTrocaObrigatoria: false,
          },
        }),
        prisma.recuperacaoSenha.update({
          where: { id: recovery.id },
          data: { dtUtilizacao: new Date() },
        }),
        // Revoga toda sessao viva: um token roubado nao sobrevive a troca de senha.
        prisma.usuario.update({
          where: { id: recovery.idUsuario },
          data: { nrTokenVersion: { increment: 1 } },
        }),
      ]);

      return { message: 'Senha redefinida com sucesso. Faca login com a nova senha.' };
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao redefinir senha.'),
      });
    }
  });

  app.get<{
    Querystring: RegisterLookupQuery;
  }>('/auth/register-lookup', lookupRateLimit, async (request, reply) => {
    try {
      const type = request.query.type;
      const cpf = normalizeRegisterCpf(request.query.cpf);

      if (type !== 'student' && type !== 'employee') {
        throw new Error('Selecione aluno ou funcionario.');
      }

      // Escopa a ficha ao cliente do dominio: sem isso, o mesmo CPF em dois
      // tenants mostraria sempre a ficha de menor id (nome + email mascarado do
      // tenant errado). No mobile (sem dominio) segue o findFirst.
      const idClienteDominio = await resolveTenantByDomain(request.query.caDominio);

      // Endpoint publico: resposta minimizada de proposito. Retorna apenas o
      // necessario para o auto-cadastro (nome para confirmacao visual + email
      // MASCARADO) e hasUser. NAO expoe CPF, data de nascimento, telefone nem o
      // email completo — reduz o valor deste endpoint como fonte de PII e, o
      // que mais importa, impede que quem so conhece o CPF descubra aqui o
      // email exigido em /auth/register.
      // A mensagem de 404 e unificada para nao diferenciar aluno x funcionario
      // (elimina o oraculo de tipo/existencia).
      // Banco do perfil: o do cliente quando o dominio diz quem e; o pool
      // quando nao ha dominio (mobile), que e onde vive quem nao foi siloado.
      const dbPerfil = idClienteDominio ? await getTenantDb(idClienteDominio) : prisma;

      if (type === 'student') {
        const student = await dbPerfil.aluno.findFirst({
          where: {
            caCPFHash: cpfHash(cpf),
            boInativo: false,
            ...(idClienteDominio ? { idCliente: idClienteDominio } : {}),
          },
        });

        if (!student) {
          return reply.code(404).send({ message: 'CPF nao encontrado no cadastro.' });
        }

        // "Ja tem conta?" e pergunta de IDENTIDADE, entao a resposta vem do
        // central — nao da relacao Aluno->Usuario, que deixa de existir quando
        // ficha e conta moram em bancos diferentes. Escopado pelo cliente: o
        // `idAluno` e id de outro banco e o mesmo numero existe na ficha de
        // outra academia.
        const contas = await prisma.usuario.count({
          where: { idAluno: student.id, idCliente: student.idCliente, boInativo: false },
        });

        return {
          id: student.id,
          type,
          name: student.nmAluno,
          emailMask: maskEmail(student.anEmail),
          hasUser: contas > 0,
        };
      }

      const employee = await dbPerfil.funcionario.findFirst({
        where: {
          caCPFHash: cpfHash(cpf),
          boInativo: false,
          ...(idClienteDominio ? { empresa: { idCliente: idClienteDominio } } : {}),
        },
        include: { empresa: { select: { idCliente: true } } },
      });

      if (!employee) {
        return reply.code(404).send({ message: 'CPF nao encontrado no cadastro.' });
      }

      const contasFuncionario = await prisma.usuario.count({
        where: {
          idFuncionario: employee.id,
          idCliente: employee.empresa?.idCliente ?? -1,
          boInativo: false,
        },
      });

      return {
        id: employee.id,
        type,
        name: employee.nmFuncionario,
        emailMask: maskEmail(employee.anEmail),
        hasUser: contasFuncionario > 0,
      };
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao buscar cadastro.'),
      });
    }
  });

  app.post<{
    Body: RegisterPayload;
  }>('/auth/register', authRateLimit, async (request, reply) => {
    try {
      const type = request.body.type;
      const cpf = normalizeRegisterCpf(request.body.cpf);
      const dsLogin = normalizeRegisterLogin(request.body.email);
      const password = normalizeRegisterPassword(request.body.password);

      if (type !== 'student' && type !== 'employee') {
        throw new Error('Selecione aluno ou funcionario.');
      }

      // Prova de titularidade do auto-cadastro: alem do CPF (que nao e segredo),
      // o solicitante precisa acertar o email JA cadastrado na ficha. Sem isso,
      // conhecer o CPF de um funcionario bastava para criar o usuario dele e
      // herdar acesso de funcionario ao tenant inteiro (escalacao de privilegio).
      // A mensagem de erro e a mesma do CPF inexistente para nao virar oraculo.
      const CREDENTIAL_MISMATCH = 'CPF ou email nao conferem com o cadastro.';
      const emailMatchesRecord = (recordEmail: string | null | undefined) =>
        !!recordEmail && recordEmail.trim().toLowerCase() === dsLogin.trim().toLowerCase();

      // Tenant pelo dominio (web); null no mobile. Escopa a ficha ao cliente do
      // dominio; sem dominio, e o email da ficha que desambigua o CPF entre
      // tenants (ver o find por emailMatchesRecord abaixo).
      const idClienteDominio = await resolveTenantByDomain(request.body.caDominio);

      // O banco do perfil. Com dominio, o do cliente; sem dominio (mobile), o
      // pool — que e onde vive quem ainda nao foi siloado.
      const dbPerfil = idClienteDominio ? await getTenantDb(idClienteDominio) : prisma;

      // DUAS METADES, e nao uma transacao so. A ficha e dado de APLICACAO e a
      // conta e IDENTIDADE (central): com banco por cliente elas deixam de
      // caber na mesma transacao — a guarda de shared/tenantTx.ts lanca se
      // alguem tentar. A leitura da ficha vem primeiro e nao grava nada, entao
      // a unica escrita e a central, que continua atomica.
      const createdUser = await (async () => {
        if (type === 'student') {
          // Todas as fichas com aquele CPF (escopadas ao cliente do dominio
          // quando ha um). A ficha cujo email confere e a prova de titularidade;
          // com o mesmo CPF em varios tenants, e ela que decide em qual a conta
          // nasce — o findFirst de antes fixava a de menor id e podia recusar o
          // cadastro legitimo no outro tenant.
          const students = await dbPerfil.aluno.findMany({
            where: {
              caCPFHash: cpfHash(cpf),
              boInativo: false,
              ...(idClienteDominio ? { idCliente: idClienteDominio } : {}),
            },
          });

          const student = students.find((ficha) => emailMatchesRecord(ficha.anEmail));
          if (!student) {
            throw new Error(CREDENTIAL_MISMATCH);
          }

          // Conta ja existente: consulta CENTRAL, escopada pelo cliente. O
          // `idAluno` sozinho nao basta — ele e id de outro banco, e o mesmo
          // numero existe na ficha de outra academia.
          const jaTemConta = await prisma.usuario.count({
            where: { idAluno: student.id, idCliente: student.idCliente, boInativo: false },
          });
          if (jaTemConta > 0) {
            throw new Error('Este aluno ja possui usuario cadastrado.');
          }

          return criarConta({
            idCliente: student.idCliente,
            idAluno: student.id,
            nome: student.nmAluno,
            dsLogin,
            caCPFHash: cpfHash(cpf),
            senhaHash: await hashPassword(password),
          });
        }

        const employees = await dbPerfil.funcionario.findMany({
          where: {
            caCPFHash: cpfHash(cpf),
            boInativo: false,
            ...(idClienteDominio ? { empresa: { idCliente: idClienteDominio } } : {}),
          },
          include: { empresa: { select: { idCliente: true } } },
        });

        const employee = employees.find((ficha) => emailMatchesRecord(ficha.anEmail));
        if (!employee) {
          throw new Error(CREDENTIAL_MISMATCH);
        }

        // Funcionario sem filial nao tem tenant, e usuario sem tenant e sessao
        // que o resto do sistema recusa com 403 — melhor barrar no cadastro.
        const idClienteDoFuncionario = employee.empresa?.idCliente;
        if (!idClienteDoFuncionario) {
          throw new Error('Funcionario sem unidade vinculada. Procure a recepcao.');
        }

        const jaTemConta = await prisma.usuario.count({
          where: {
            idFuncionario: employee.id,
            idCliente: idClienteDoFuncionario,
            boInativo: false,
          },
        });
        if (jaTemConta > 0) {
          throw new Error('Este funcionario ja possui usuario cadastrado.');
        }

        return criarConta({
          idCliente: idClienteDoFuncionario,
          idFuncionario: employee.id,
          nome: employee.nmFuncionario,
          dsLogin,
          caCPFHash: cpfHash(cpf),
          senhaHash: await hashPassword(password),
        });
      })();

      return reply.code(201).send(createdUser);
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao criar cadastro.'),
      });
    }
  });

  app.get<{
    Querystring: ThemeQuery;
  }>('/auth/theme', themeRateLimit, async (request, reply) => {
    try {
      const url = (request.query.url ?? '').trim().toLowerCase();
      if (!url) return reply.code(204).send();

      // UMA consulta, tudo no control-plane. Antes eram duas: o dominio saia
      // daqui e o tema exigia ABRIR O BANCO DO TENANT (getTenantDb) so para ler
      // cinco cores — numa rota PUBLICA, que roda antes do login e e a primeira
      // coisa que o navegador do aluno pede. A marca virou control-plane
      // (tb_ClientesMarcas) e o `include` voltou a ser um join legitimo, porque
      // agora os dois lados moram no mesmo banco, sempre.
      const dominio = await prisma.dominioCorporativo.findFirst({
        where: { urlDominio: url, boAtivo: true },
        include: { cliente: { include: { marca: true } } },
      });

      if (!dominio?.cliente) return reply.code(204).send();

      const { cliente } = dominio;
      const tema = cliente.marca;

      let logoUrl: string | null = null;
      let faviconUrl: string | null = null;

      if (tema && (tema.anCaminhoLogo || tema.anCaminhoFavicon)) {
        // O caminho e sempre do bucket de CLIENTES, que e global (do provedor)
        // e nao por tenant. Antes havia um de-para entre dois buckets porque o
        // logo podia vir do arquivo da empresa; a marca do tenant nao tem essa
        // ambiguidade — ela e uma so, e o arquivo dela e nosso.
        try {
          const config = getClientSupabaseConfig();
          const supabase = getSupabaseClient();

          if (tema.anCaminhoLogo) {
            const { data } = await supabase.storage
              .from(config.bucket)
              .createSignedUrl(tema.anCaminhoLogo, 3600);
            logoUrl = data?.signedUrl ?? null;
          }

          if (tema.anCaminhoFavicon) {
            const { data } = await supabase.storage
              .from(config.bucket)
              .createSignedUrl(tema.anCaminhoFavicon, 3600);
            faviconUrl = data?.signedUrl ?? null;
          }
        } catch {
          /* sem URL assinada a tela usa o tema padrao; nao vale derrubar o login */
        }
      }

      return {
        idCliente: cliente.id,
        dsCliente: cliente.dsCliente,
        ...(tema ? {
          corPrimaria: tema.corPrimaria,
          corSecundaria: tema.corSecundaria,
          corAcentuacao: tema.corAcentuacao,
          corTexto: tema.corTexto,
          corFundo: tema.corFundo,
          fontePrincipal: tema.fontePrincipal,
          tamanhoBase: tema.tamanhoBase,
          boModoEscuro: tema.boModoEscuro,
          logoUrl,
          faviconUrl,
        } : {}),
      };
    } catch (error) {
      return reply.code(500).send({
        message: clientErrorMessage(error, 'Erro ao buscar tema.'),
      });
    }
  });

  /**
   * QUEBRA DE VIDRO: troca o token emitido pelo painel do provedor por uma
   * sessao de implantacao dentro do cliente.
   *
   * O TOKEN E DE USO UNICO E PRAZO CURTO. Quem o emitiu foi o painel, que gravou
   * so o HASH em tb_AcessosProvedor — o token claro existe uma vez, no link. Ao
   * ser trocado, `dtUso` e preenchido e ele nao serve mais: um link reenviado,
   * colado num chamado ou esquecido no historico do navegador ja nao abre nada.
   *
   * ROTA PUBLICA por necessidade: quem chega aqui ainda nao tem sessao neste
   * sistema. A defesa e o proprio token — 32 bytes aleatorios, guardado como
   * hash, de uso unico e com prazo — e o rate limit de autenticacao.
   *
   * COMPARACAO EM TEMPO CONSTANTE nao e necessaria aqui porque a busca e por
   * HASH indexado: o que viaja no `where` ja e o digest, e nao o segredo.
   */
  app.post<{ Body: { token?: string } }>(
    '/auth/acesso-provedor',
    authRateLimit,
    async (request, reply) => {
      try {
        const bruto = (request.body?.token ?? '').trim();
        if (!bruto) return reply.code(400).send({ message: 'Token ausente.' });

        const hash = createHash('sha256').update(bruto).digest('hex');
        const acesso = await prisma.acessoProvedor.findUnique({
          where: { caTokenHash: hash },
          include: {
            operador: { select: { id: true, dsNome: true, boInativo: true, nrTokenVersion: true } },
            cliente: { select: { id: true, dsCliente: true, boInativo: true } },
          },
        });

        // Mensagem UNICA para token inexistente, expirado, ja usado, operador
        // desligado e cliente inativo. Distinguir ajudaria quem esta tentando
        // adivinhar token a saber que chegou perto.
        const agora = new Date();
        const invalido =
          !acesso ||
          acesso.dtUso !== null ||
          acesso.dtExpiracao < agora ||
          acesso.operador.boInativo ||
          acesso.cliente.boInativo;

        if (invalido) {
          request.auditReason = 'acesso_provedor_invalido';
          return reply.code(401).send({ message: 'Acesso invalido ou expirado.' });
        }

        // QUEIMA O TOKEN ANTES de emitir a sessao. Se a emissao falhar depois
        // disso, o operador pede outro acesso — o que custa um clique. A ordem
        // inversa deixaria uma janela para o mesmo link ser trocado duas vezes.
        await prisma.acessoProvedor.update({
          where: { id: acesso.id },
          // Mesma origem de IP que a trilha de auditoria usa, para os dois
          // registros contarem a mesma historia.
          data: { dtUso: agora, anIpUso: (request.ip ?? '').slice(0, 64) || null },
        });

        const token = app.jwt.sign(
          {
            // O `sub` e o OperadorSols, nao um Usuario: o hook de auth trata
            // este papel antes de procurar em tb_Usuarios.
            sub: acesso.operador.id,
            role: 'provedor',
            idAluno: null,
            idFuncionario: null,
            // O tenant vem do ACESSO, nunca do corpo da requisicao.
            idCliente: acesso.cliente.id,
            tv: acesso.operador.nrTokenVersion,
            // A quebra de vidro nasce de um link aberto no navegador; nao ha
            // caminho pelo aplicativo.
            cli: 'web',
          },
          // Duracao curta: implantacao e trabalho de sessao, nao de turno. Um
          // acesso da SOLS que dura o dia inteiro vira acesso permanente na
          // pratica.
          { expiresIn: '2h' },
        );

        // As filiais saem daqui junto com a sessao, e nao de uma segunda
        // chamada: a tela do provedor monta as DUAS sessoes do navegador — a do
        // sistema e a do Gestor de Tema — e a segunda precisa da lista de
        // empresas. Sao dados que este operador pode ler (companies.read esta na
        // lista fixa), entao trazer agora so evita uma ida e volta.
        const empresas = await (await getTenantDb(acesso.cliente.id)).empresa.findMany({
          where: { idCliente: acesso.cliente.id, boInativo: false },
          orderBy: { dsEmpresa: 'asc' },
        });

        return {
          token,
          idOperador: acesso.operador.id,
          idCliente: acesso.cliente.id,
          dsCliente: acesso.cliente.dsCliente,
          dsOperador: acesso.operador.dsNome,
          dsMotivo: acesso.dsMotivo,
          empresas,
          // A MESMA lista que o hook aplica a cada request. Vai junto para o
          // menu nascer recortado; quem barra de verdade continua sendo a API.
          permissions: PROVIDER_SETUP_PERMISSIONS,
        };
      } catch (error) {
        return reply
          .code(500)
          .send({ message: clientErrorMessage(error, 'Erro ao validar o acesso.') });
      }
    },
  );

  app.post<{
    Body: LoginPayload & { idCliente?: number };
  }>('/auth/gestor-login', authRateLimit, async (request, reply) => {
    try {
      const cpf = normalizeRegisterCpf(request.body.login);
      const password = request.body.password ?? '';
      const idCliente = Number(request.body.idCliente ?? 0);

      if (!idCliente) {
        return reply.code(400).send({ message: 'Cliente nao identificado.' });
      }

      const user = await prisma.usuario.findFirst({
        where: {
          boInativo: false,
          // Chave central, como no /auth/login. O gestor e funcionario, entao
          // o `idFuncionario` nao-nulo e o que restringe ao papel.
          caCPFHash: cpfHash(cpf),
          idFuncionario: { not: null },
        },
      });

      if (!user?.idFuncionario) {
        await dummyVerify(password);
        return reply.code(401).send({ message: 'Usuario ou senha invalidos.' });
      }

      const currentPassword = await prisma.senha.findFirst({
        where: { idUsuario: user.id, boInativo: false },
        orderBy: { dtCadastro: 'desc' },
      });

      const { valid, needsRehash, expired } = await verifyPassword(password, currentPassword);

      if (expired) {
        return reply.code(403).send({
          message: 'Por seguranca, redefina sua senha em "Esqueci minha senha".',
        });
      }

      if (!valid) {
        return reply.code(401).send({ message: 'Usuario ou senha invalidos.' });
      }

      // A checagem de tenant vem DEPOIS da senha e responde 401 generico. Se
      // viesse antes (ou respondesse 403), o endpoint viraria oraculo: sem
      // saber senha nenhuma, um atacante distinguiria "CPF existe" (403) de
      // "CPF nao existe" (401) e ainda descobriria a que cliente um CPF
      // pertence variando idCliente ate parar de receber 403.
      //
      // O tenant agora sai de Usuario.idCliente (central) em vez de
      // funcionario.empresa.idCliente: e a mesma informacao, sem depender de um
      // join que deixa de existir com banco por cliente.
      if (user.idCliente !== idCliente) {
        return reply.code(401).send({ message: 'Usuario ou senha invalidos.' });
      }

      if (needsRehash && currentPassword) {
        await prisma.senha.update({
          where: { id: currentPassword.id },
          data: { dsSenha: await hashPassword(password), cnTipoHash: HASH_TYPE_BCRYPT },
        });
      }

      // Perfil e filiais sao dado de APLICACAO: saem do banco do cliente que
      // acabou de ser autenticado, nao do central.
      const perfil = await carregarPerfil(idCliente, { idFuncionario: user.idFuncionario });
      if (!perfil.ativo) {
        return reply.code(401).send({ message: 'Usuario ou senha invalidos.' });
      }
      const dbTenant = await getTenantDb(idCliente);
      const empresas = await dbTenant.empresa.findMany({
        where: { idCliente, boInativo: false },
        orderBy: { dsEmpresa: 'asc' },
      });

      const token = app.jwt.sign(
        {
          sub: user.id,
          role: 'gestor',
          idAluno: null,
          idFuncionario: user.idFuncionario,
          idCliente,
          superAdmin: user.boSuperAdmin || undefined,
          tv: user.nrTokenVersion,
          // A porta do gestor so existe no painel — o prazo fixo de WEB logo
          // abaixo ja dizia isso.
          cli: 'web',
        },
        { expiresIn: TOKEN_EXPIRY_WEB },
      );

      return {
        token,
        id: user.id,
        idFuncionario: user.idFuncionario,
        name: perfil.nome ?? user.dsLogin,
        type: 'employee' as const,
        idCliente,
        superAdmin: user.boSuperAdmin || undefined,
        empresas,
        // Permissoes efetivas do perfil do gestor — as MESMAS que o hook aplica
        // no servidor a cada request. O gestor deixou de ser bypass de RBAC: um
        // gerente com o perfil "Gerente" (todas as permissoes) segue vendo tudo;
        // quem entra pela porta do gestor sem um perfil amplo fica preso ao que
        // o perfil concede. A autorizacao de verdade continua no servidor.
        perfilAcesso: describeProfile(perfil.perfilAcesso),
        permissions: employeePermissions(perfil.perfilAcesso),
      };
    } catch (error) {
      request.log.warn(error);
      return reply.code(401).send({ message: 'Usuario ou senha invalidos.' });
    }
  });

  // Dados da PROPRIA conta, para a tela "Minha conta".
  //
  // Existe separado de /employees/:id porque aquele exige employees.read — um
  // professor sem permissao de RH nao consegue ler o proprio cadastro por la, o
  // que seria absurdo. Aqui a identidade vem do token e so devolve o dono.
  app.get('/auth/me', async (request, reply) => {
    try {
      // Operador da SOLS nao tem "minha conta" AQUI: a conta dele vive no painel
      // do provedor, e esta rota le tb_Usuarios pelo `sub` — que numa sessao de
      // implantacao e um OperadorSols. Sem este desvio a resposta era um 401
      // enganoso ("usuario inativo"), e, no dia em que os dois contadores de id
      // se cruzassem, seria a conta de uma PESSOA REAL desta academia.
      if (request.user.role === 'provedor') {
        return reply.code(403).send({
          message: 'Conta de operador da SOLS: gerencie no painel do provedor.',
        });
      }

      // Identidade no central; ficha no banco do cliente. Duas consultas onde
      // antes havia um include — o join nao existe com banco por cliente.
      const user = await prisma.usuario.findFirst({
        where: { id: request.user.sub, boInativo: false },
        select: {
          id: true,
          dsLogin: true,
          idAluno: true,
          idFuncionario: true,
          idCliente: true,
          dtUltimoAcesso: true,
        },
      });

      if (!user) return reply.code(401).send({ message: 'Usuario inativo ou nao encontrado.' });

      const db = await getTenantDb(user.idCliente);
      const aluno = user.idAluno
        ? await db.aluno.findUnique({
            where: { id: user.idAluno },
            select: { id: true, nmAluno: true, anEmail: true, caCPF: true, dtNascimento: true },
          })
        : null;
      const funcionario = user.idFuncionario
        ? await db.funcionario.findUnique({
            where: { id: user.idFuncionario },
            select: {
              id: true,
              nmFuncionario: true,
              anEmail: true,
              caCPF: true,
              dtNascimento: true,
              dtAdmissao: true,
              nrDDD: true,
              nrContato: true,
              cargo: { select: { id: true, dsCargo: true } },
              empresa: { select: { id: true, dsEmpresa: true, idCliente: true } },
              perfilAcesso: {
                select: {
                  id: true,
                  dsPerfil: true,
                  boInativo: true,
                  permissoes: { select: { cnPermissao: true } },
                },
              },
            },
          })
        : null;

      return {
        id: user.id,
        login: user.dsLogin,
        type: user.idAluno ? ('student' as const) : ('employee' as const),
        dtUltimoAcesso: user.dtUltimoAcesso,
        name: aluno?.nmAluno ?? funcionario?.nmFuncionario ?? user.dsLogin,
        // CPF descriptografado apenas para o proprio titular.
        caCPF: decryptCpfValue(aluno?.caCPF ?? funcionario?.caCPF ?? ''),
        anEmail: aluno?.anEmail ?? funcionario?.anEmail ?? '',
        dtNascimento: aluno?.dtNascimento ?? funcionario?.dtNascimento ?? null,
        funcionario: funcionario
          ? {
              id: funcionario.id,
              dtAdmissao: funcionario.dtAdmissao,
              nrDDD: funcionario.nrDDD,
              nrContato: funcionario.nrContato,
              cargo: funcionario.cargo,
              empresa: funcionario.empresa
                ? { id: funcionario.empresa.id, dsEmpresa: funcionario.empresa.dsEmpresa }
                : null,
              perfilAcesso: describeProfile(funcionario.perfilAcesso ?? null),
              permissions: employeePermissions(funcionario.perfilAcesso ?? null),
            }
          : null,
      };
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send({ message: 'Erro ao carregar seus dados.' });
    }
  });

  // Troca de senha pelo proprio usuario, com a senha atual como prova.
  //
  // Diferente do reset por email (que prova a posse da caixa), aqui a prova e
  // saber a senha vigente — por isso a atual e obrigatoria mesmo o usuario ja
  // estando autenticado: um token esquecido aberto num computador emprestado
  // nao pode virar troca de senha.
  app.post<{
    Body: { currentPassword?: string; newPassword?: string };
  }>('/auth/change-password', authRateLimit, async (request, reply) => {
    try {
      // Mesma razao de /auth/me: `sub` numa sessao de implantacao e um
      // OperadorSols, e as consultas daqui sao por idUsuario. A senha do
      // operador se troca no painel do provedor.
      if (request.user.role === 'provedor') {
        return reply.code(403).send({
          message: 'Conta de operador da SOLS: troque a senha no painel do provedor.',
        });
      }

      const currentPassword = request.body?.currentPassword ?? '';
      const newPassword = normalizeRegisterPassword(request.body?.newPassword ?? '');

      const senhaAtual = await prisma.senha.findFirst({
        where: { idUsuario: request.user.sub, boInativo: false },
        orderBy: { dtCadastro: 'desc' },
      });

      const { valid } = await verifyPassword(currentPassword, senhaAtual);
      if (!valid) {
        return reply.code(400).send({ message: 'Senha atual incorreta.' });
      }

      if (currentPassword === newPassword) {
        return reply.code(400).send({ message: 'A nova senha deve ser diferente da atual.' });
      }

      const hashed = await hashPassword(newPassword);
      await prisma.$transaction([
        prisma.senha.updateMany({
          where: { idUsuario: request.user.sub, boInativo: false },
          data: { boInativo: true },
        }),
        prisma.senha.create({
          data: {
            idUsuario: request.user.sub,
            dsSenha: hashed,
            cnTipoHash: HASH_TYPE_BCRYPT,
            boTrocaObrigatoria: false,
          },
        }),
        // Mesma revogacao do reset: trocar a senha derruba as outras sessoes,
        // inclusive a que estava aberta em outro lugar.
        prisma.usuario.update({
          where: { id: request.user.sub },
          data: { nrTokenVersion: { increment: 1 } },
        }),
      ]);

      return { message: 'Senha alterada. Entre novamente com a nova senha.' };
    } catch (error) {
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao alterar a senha.'),
      });
    }
  });

  app.get<{
    Querystring: VerifySessionQuery;
  }>('/auth/verify', async (request, reply) => {
    try {
      // A identidade vem exclusivamente do JWT — o parametro ?id= legado e
      // ignorado para impedir enumeracao de usuarios (IDOR).
      const id = request.user.sub;

      // QUEBRA DE VIDRO, tratada ANTES da consulta — pelo mesmo motivo do hook
      // de auth: o `sub` de um token de provedor e um OperadorSols, que nao
      // existe em tb_Usuarios.
      //
      // Sem este desvio nao havia como ENTRAR: toda tela do SOLSFIT pergunta
      // aqui "quem sou eu?", recebia 401 e caia no formulario de CPF e senha,
      // com a sessao de implantacao viva no cookie.
      //
      // E havia um segundo problema, pior e silencioso: a consulta abaixo
      // procura por ID. Hoje os dois contadores nao se cruzam (ha 1 operador e
      // os usuarios comecam no 5), mas no dia em que cruzassem, a sessao da
      // SOLS receberia de volta a identidade de uma PESSOA REAL — nome,
      // cliente, perfil e, se fosse aluno, ate a situacao de acesso dela. A
      // autorizacao nao vazava (o RBAC do provedor e lista fixa no codigo), mas
      // o dado pessoal, sim.
      if (request.user.role === 'provedor') {
        // O nome do CLIENTE vem junto: a tela de acesso do provedor e reaberta
        // durante a sessao (e o menu das tres portas), e ela precisa dizer em
        // qual academia se esta. Custa uma consulta a mais no control-plane, e
        // so para este papel.
        // O token de provedor sempre carrega o cliente; o tipo e nulavel por
        // causa dos outros papeis (o aplicativo do aluno nao tem dominio).
        const idClienteSessao = request.user.idCliente;
        const [operador, cliente] = await Promise.all([
          prisma.operadorSols.findUnique({ where: { id }, select: { dsNome: true } }),
          idClienteSessao
            ? prisma.cliente.findUnique({
                where: { id: idClienteSessao },
                select: { dsCliente: true },
              })
            : null,
        ]);
        if (!operador) {
          return reply.code(401).send({ message: 'Sessao invalida ou expirada.' });
        }
        return {
          id,
          idAluno: null,
          idFuncionario: null,
          // O tenant vem do token, que so foi emitido contra um acesso aberto
          // no painel — nunca de parametro da requisicao.
          idCliente: request.user.idCliente,
          dsCliente: cliente?.dsCliente ?? null,
          name: operador.dsNome,
          type: 'employee' as const,
          // Rotulo proprio no lugar do perfil: quem olha a tela precisa saber
          // que nao esta vendo o sistema como um funcionario da academia.
          perfilAcesso: { id: 0, dsPerfil: 'Implantação SOLS' },
          permissions: PROVIDER_SETUP_PERMISSIONS,
          studentAccess: null,
          provedor: true,
        };
      }

      // Identidade no central, ficha no banco do cliente: duas consultas onde
      // antes havia um include.
      const user = await prisma.usuario.findFirst({
        where: { id, boInativo: false },
        select: {
          id: true,
          dsLogin: true,
          idAluno: true,
          idFuncionario: true,
          idCliente: true,
          boSuperAdmin: true,
        },
      });

      if (!user) {
        return reply.code(401).send({ message: 'Usuario inativo ou nao encontrado.' });
      }

      const perfil = await carregarPerfil(user.idCliente, {
        idAluno: user.idAluno,
        idFuncionario: user.idFuncionario,
      });

      // Ficha desativada tranca a sessao mesmo com a conta central viva.
      if (!perfil.ativo) {
        return reply.code(401).send({ message: 'Usuario sem acesso ao sistema.' });
      }

      const dbTenant = await getTenantDb(user.idCliente);

      return {
        id: user.id,
        idAluno: user.idAluno,
        idFuncionario: user.idFuncionario,
        // Filial do funcionario. O app da equipe precisa dela para gravar venda
        // e treino em nome de uma unidade, e pedi-la por GET /companies exigiria
        // companies.read — permissao que a recepcao nao tem por que ter. A
        // unidade da PROPRIA pessoa e dado da sessao, e nao listagem de
        // cadastro. Aluno nao tem filial fixa: vem nulo.
        idEmpresa: perfil.idEmpresa,
        idCliente: user.idCliente,
        // Reenviada a cada revalidacao: a academia troca de cor no painel e o
        // aplicativo acompanha na proxima abertura, sem novo login.
        theme: await carregarMarca(user.idCliente),
        name: perfil.nome ?? user.dsLogin,
        type: user.idAluno ? 'student' : 'employee',
        superAdmin: user.boSuperAdmin || undefined,
        perfilAcesso: describeProfile(perfil.perfilAcesso),
        // Reavaliado a cada verify: se o gerente mudou o perfil enquanto a
        // sessao estava aberta, o menu acompanha na proxima revalidacao.
        permissions: employeePermissions(perfil.perfilAcesso),
        studentAccess: user.idAluno
          ? await getStudentAccessStatus(dbTenant, user.idAluno)
          : null,
      };
    } catch (error) {
      // Nunca ecoar o erro interno (ex.: falha de conexao com o banco).
      request.log.error(error);
      return reply.code(500).send({ message: 'Erro ao verificar sessao.' });
    }
  });

  // Logout com revogacao server-side: incrementa a versao de sessao do usuario,
  // invalidando imediatamente TODOS os tokens ja emitidos (web + mobile). Como e
  // por-usuario (nao por-token), "Sair" encerra a sessao em todos os
  // dispositivos — comportamento intencional e mais seguro para um app deste
  // porte. Sempre responde 204: mesmo que o incremento falhe, o cliente
  // descarta a credencial (cookie/SecureStore) do seu lado.
  app.post('/auth/logout', async (request, reply) => {
    try {
      // QUEBRA DE VIDRO: aqui o `sub` e um OperadorSols, e nao um Usuario.
      //
      // O update abaixo e por id em tb_Usuarios. Numa sessao de implantacao ele
      // incrementaria a versao de token do FUNCIONARIO da academia cujo id
      // coincidisse — derrubando uma pessoa real de todos os aparelhos dela, em
      // silencio, porque o catch engole o P2025 de quando nao ha ninguem. Hoje
      // nao ha colisao (1 operador; os usuarios comecam no 5), e e so por isso
      // que isto nunca apareceu. A partir do quinto operador, apareceria.
      // Mesmo desvio que /auth/me, /auth/verify, /auth/change-password e
      // /auth/push-token ja fazem.
      //
      // E NAO incrementamos OperadorSols.nrTokenVersion no lugar, ainda que
      // fosse a troca obvia: esse contador e o mesmo que autentica o PAINEL DA
      // SOLS (lib/autenticacao.ts, no outro repositorio). Sair do sistema de um
      // cliente derrubaria o operador do proprio painel, e junto qualquer
      // implantacao aberta em outro cliente — acoplando pela revogacao dois
      // sistemas que tem segredos separados de proposito.
      //
      // Revogar esta sessao com precisao pede marcar o encerramento em
      // tb_AcessosProvedor, o que e migration nova e ainda daria a trilha o
      // "quando saiu" que hoje falta. Ate la, o que encerra a implantacao e o
      // descarte do cookie — que o proxy faz — e o prazo de 2 horas do token.
      if (request.user.role === 'provedor') {
        return reply.code(204).send();
      }

      await prisma.usuario.update({
        where: { id: request.user.sub },
        data: { nrTokenVersion: { increment: 1 } },
      });
    } catch (error) {
      request.log.warn(error);
    }
    return reply.code(204).send();
  });

  // Registro do aparelho para push.
  //
  // Rota de SESSAO, nao de modulo de negocio (ver ALWAYS_ALLOWED em
  // plugins/permissions.ts): o token identifica o telefone de quem ja esta
  // logado, e negar isso por permissao deixaria o aluno sem aviso nenhum.
  //
  // O upsert pelo token e o que trata a troca de dono do aparelho: quem
  // instala o app, faz login com outra conta e registra o mesmo token MOVE o
  // aparelho — sem isso, o dono anterior continuaria recebendo os avisos de
  // quem usa o telefone hoje.
  app.post<{ Body: { token?: unknown; platform?: unknown } }>(
    '/auth/push-token',
    async (request, reply) => {
      // Aparelho se registra para o dono da conta, e `idUsuario` aqui viria do
      // `sub` — que numa sessao de implantacao e um OperadorSols. Nao ha app da
      // SOLS para notificar, e gravar assim mesmo penduraria o aparelho num id
      // de outra tabela.
      if (request.user.role === 'provedor') {
        return reply.code(403).send({ message: 'Sessao de implantacao nao registra aparelho.' });
      }

      const token = typeof request.body?.token === 'string' ? request.body.token.trim() : '';
      if (!isExpoPushToken(token)) {
        return reply.code(400).send({ message: 'Token de push invalido.' });
      }

      const plataforma =
        typeof request.body?.platform === 'string'
          ? request.body.platform.trim().slice(0, 20)
          : '';

      try {
        await prisma.usuarioDispositivo.upsert({
          where: { caTokenPush: token },
          create: {
            idUsuario: request.user.sub,
            caTokenPush: token,
            dsPlataforma: plataforma,
          },
          update: {
            idUsuario: request.user.sub,
            dsPlataforma: plataforma,
            dtUltimoUso: new Date(),
            // Reativa um aparelho que tinha sido marcado como morto: reinstalar
            // o app gera um token novo, mas restaurar backup pode devolver o
            // mesmo, e ai ele voltou a valer.
            boInativo: false,
          },
        });
        return reply.code(204).send();
      } catch (error) {
        request.log.error(error);
        return reply.code(400).send({ message: 'Erro ao registrar o aparelho.' });
      }
    },
  );

  // Descadastro do aparelho. Chamado no logout do app: sem isto, o telefone
  // continuaria recebendo aviso de uma conta que ja saiu dele.
  app.delete<{ Body: { token?: unknown } }>('/auth/push-token', async (request, reply) => {
    const token = typeof request.body?.token === 'string' ? request.body.token.trim() : '';
    if (!token) return reply.code(204).send();

    try {
      await prisma.usuarioDispositivo.updateMany({
        // So o proprio aparelho: sem o filtro por usuario, qualquer autenticado
        // silenciaria o push de outra pessoa mandando o token dela.
        where: { caTokenPush: token, idUsuario: request.user.sub },
        data: { boInativo: true },
      });
    } catch (error) {
      request.log.warn(error);
    }
    return reply.code(204).send();
  });
}
