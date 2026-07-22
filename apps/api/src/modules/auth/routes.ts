import type { FastifyInstance } from 'fastify';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { prisma } from '../../shared/prisma.js';
import {
  normalizeRegisterCpf,
  normalizeRegisterLogin,
  normalizeRegisterPassword,
} from '../../shared/normalize.js';
import { HASH_TYPE_BCRYPT, hashPassword, verifyPassword } from '../../shared/passwords.js';
import { TOKEN_EXPIRY_MOBILE, TOKEN_EXPIRY_WEB } from '../../plugins/auth.js';
import { getSupabaseClient, getSupabaseConfig, getClientSupabaseConfig } from '../../shared/supabase.js';
import { getStudentAccessStatus } from '../../shared/studentAccess.js';
import type {
  ForgotPasswordPayload,
  LoginPayload,
  RegisterLookupQuery,
  RegisterPayload,
  ThemeQuery,
  VerifySessionQuery,
} from '../../shared/api-types.js';

export async function registerAuthRoutes(app: FastifyInstance) {
  // Limites restritos de rate limit para endpoints de autenticacao (anti brute
  // force / enumeracao). O limite global de 300/min continua valendo no resto.
  const authRateLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };
  const lookupRateLimit = { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } };

  app.post<{
    Body: LoginPayload;
  }>('/auth/login', authRateLimit, async (request, reply) => {
    try {
      const cpf = normalizeRegisterCpf(request.body.login);
      const password = request.body.password ?? '';

      const user = await prisma.usuario.findFirst({
        where: {
          boInativo: false,
          OR: [
            { aluno: { caCPF: cpf, boInativo: false } },
            { funcionario: { caCPF: cpf, boInativo: false } },
          ],
        },
        include: {
          aluno: true,
          funcionario: { include: { empresa: { select: { idCliente: true } } } },
        },
      });

      if (!user) {
        throw new Error('Usuario ou senha invalidos.');
      }

      const currentPassword = await prisma.senha.findFirst({
        where: { idUsuario: user.id, boInativo: false },
        orderBy: { dtCadastro: 'desc' },
      });

      const { valid, needsRehash } = await verifyPassword(password, currentPassword);

      if (!valid) {
        throw new Error('Usuario ou senha invalidos.');
      }

      // Rehash progressivo: registros legados (SHA-256 ou texto puro) sao
      // regravados com bcrypt no proprio login, sem acao do usuario.
      if (needsRehash && currentPassword) {
        await prisma.senha.update({
          where: { id: currentPassword.id },
          data: { dsSenha: await hashPassword(password), cnTipoHash: HASH_TYPE_BCRYPT },
        });
      }

      // Tenant do usuario: funcionario via empresa; aluno direto em Aluno.idCliente.
      const idCliente = user.funcionario?.empresa?.idCliente ?? user.aluno?.idCliente ?? null;
      const token = app.jwt.sign(
        {
          sub: user.id,
          role: user.idAluno ? 'student' : 'employee',
          idAluno: user.idAluno,
          idFuncionario: user.idFuncionario,
          idCliente,
        },
        { expiresIn: request.body.client === 'mobile' ? TOKEN_EXPIRY_MOBILE : TOKEN_EXPIRY_WEB },
      );

      return {
        token,
        id: user.id,
        idAluno: user.idAluno,
        idFuncionario: user.idFuncionario,
        idCliente,
        login: user.dsLogin,
        name: user.aluno?.nmAluno ?? user.funcionario?.nmFuncionario ?? user.dsLogin,
        type: user.idAluno ? 'student' : 'employee',
        // Informational only — login itself is not blocked by plan/payment
        // status; the frontend decides how to react (banner, restrict screens).
        studentAccess: user.idAluno ? await getStudentAccessStatus(prisma, user.idAluno) : null,
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
      const user = await prisma.usuario.findFirst({
        where: {
          boInativo: false,
          OR: [
            { aluno: { caCPF: cpf, boInativo: false } },
            { funcionario: { caCPF: cpf, boInativo: false } },
          ],
        },
        include: { aluno: true, funcionario: true },
      });

      const email = user
        ? user.dsLogin || user.aluno?.anEmail || user.funcionario?.anEmail || ''
        : '';

      if (!email) {
        return reply.send(genericResponse);
      }

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      } as SMTPTransport.Options);

      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: email,
        subject: 'Redefinicao de senha - SmartGym',
        text: 'Este e um email de teste para a funcionalidade de redefinicao de senha. Nenhuma acao foi tomada em sua conta.',
        html: `<p>Este e um email de teste para a funcionalidade de redefinicao de senha. Nenhuma acao foi tomada em sua conta.</p><p>Se voce solicitou uma redefinicao de senha, por favor ignore este email ou entre em contato com o suporte.</p>`,
      });

      return reply.send(genericResponse);
    } catch (error) {
      request.log.error(error);
      return reply.send(genericResponse);
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

      if (type === 'student') {
        const student = await prisma.aluno.findFirst({
          where: { caCPF: cpf, boInativo: false },
          include: {
            usuarios: { where: { boInativo: false }, select: { id: true } },
          },
        });

        if (!student) {
          return reply.code(404).send({ message: 'CPF nao encontrado no cadastro de alunos.' });
        }

        return {
          id: student.id,
          type,
          name: student.nmAluno,
          cpf: student.caCPF,
          birthDate: student.dtNascimento,
          ddd: student.nrDDD,
          phone: student.nrContato ?? '',
          email: student.anEmail,
          hasUser: student.usuarios.length > 0,
        };
      }

      const employee = await prisma.funcionario.findFirst({
        where: { caCPF: cpf, boInativo: false },
        include: {
          usuarios: { where: { boInativo: false }, select: { id: true } },
        },
      });

      if (!employee) {
        return reply.code(404).send({ message: 'CPF nao encontrado no cadastro de funcionarios.' });
      }

      return {
        id: employee.id,
        type,
        name: employee.nmFuncionario,
        cpf: employee.caCPF,
        birthDate: employee.dtNascimento,
        ddd: employee.nrDDD,
        phone: employee.nrContato,
        email: employee.anEmail,
        hasUser: employee.usuarios.length > 0,
      };
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao buscar cadastro.',
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

      const createdUser = await prisma.$transaction(async (transaction) => {
        if (type === 'student') {
          const student = await transaction.aluno.findFirst({
            where: { caCPF: cpf, boInativo: false },
            include: { usuarios: { where: { boInativo: false }, select: { id: true } } },
          });

          if (!student) {
            throw new Error('CPF nao encontrado no cadastro de alunos.');
          }
          if (student.usuarios.length > 0) {
            throw new Error('Este aluno ja possui usuario cadastrado.');
          }

          const user = await transaction.usuario.create({
            data: { idAluno: student.id, dsLogin, boInativo: false },
          });
          await transaction.senha.create({
            data: { idUsuario: user.id, dsSenha: await hashPassword(password), cnTipoHash: HASH_TYPE_BCRYPT, boTrocaObrigatoria: false },
          });

          return { id: user.id, type, name: student.nmAluno, login: user.dsLogin };
        }

        const employee = await transaction.funcionario.findFirst({
          where: { caCPF: cpf, boInativo: false },
          include: { usuarios: { where: { boInativo: false }, select: { id: true } } },
        });

        if (!employee) {
          throw new Error('CPF nao encontrado no cadastro de funcionarios.');
        }
        if (employee.usuarios.length > 0) {
          throw new Error('Este funcionario ja possui usuario cadastrado.');
        }

        const user = await transaction.usuario.create({
          data: { idFuncionario: employee.id, dsLogin, boInativo: false },
        });
        await transaction.senha.create({
          data: { idUsuario: user.id, dsSenha: await hashPassword(password), cnTipoHash: HASH_TYPE_BCRYPT, boTrocaObrigatoria: false },
        });

        return { id: user.id, type, name: employee.nmFuncionario, login: user.dsLogin };
      });

      return reply.code(201).send(createdUser);
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao criar cadastro.',
      });
    }
  });

  app.get<{
    Querystring: ThemeQuery;
  }>('/auth/theme', async (request, reply) => {
    try {
      const url = (request.query.url ?? '').trim().toLowerCase();
      if (!url) return reply.code(204).send();

      const dominio = await prisma.dominioCorporativo.findFirst({
        where: { urlDominio: url, boAtivo: true },
        include: {
          cliente: {
            include: {
              temaCustomizado: {
                include: {
                  arquivoLogo: true,
                  arquivoFavicon: true,
                  clienteArquivoLogo: true,
                  clienteArquivoFavicon: true,
                },
              },
            },
          },
        },
      });

      if (!dominio?.cliente) return reply.code(204).send();

      const { cliente } = dominio;
      const tema = cliente.temaCustomizado;

      let logoUrl: string | null = null;
      let faviconUrl: string | null = null;

      if (tema) {
        const logoPath = tema.clienteArquivoLogo?.anCaminho || tema.arquivoLogo?.anCaminho || null;
        const faviconPath = tema.clienteArquivoFavicon?.anCaminho || tema.arquivoFavicon?.anCaminho || null;

        if (logoPath || faviconPath) {
          try {
            const isClientLogo = !!tema.clienteArquivoLogo?.anCaminho;
            const isClientFavicon = !!tema.clienteArquivoFavicon?.anCaminho;

            if (logoPath) {
              const config = isClientLogo ? getClientSupabaseConfig() : getSupabaseConfig();
              const supabase = getSupabaseClient();
              const { data } = await supabase.storage.from(config.bucket).createSignedUrl(logoPath, 3600);
              logoUrl = data?.signedUrl ?? null;
            }

            if (faviconPath) {
              const config = isClientFavicon ? getClientSupabaseConfig() : getSupabaseConfig();
              const supabase = getSupabaseClient();
              const { data } = await supabase.storage.from(config.bucket).createSignedUrl(faviconPath, 3600);
              faviconUrl = data?.signedUrl ?? null;
            }
          } catch { /* URLs stay null if signed URL generation fails */ }
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
        message: error instanceof Error ? error.message : 'Erro ao buscar tema.',
      });
    }
  });

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
          funcionario: { caCPF: cpf, boInativo: false },
        },
        include: { funcionario: { include: { empresa: true } } },
      });

      if (!user?.funcionario) {
        return reply.code(401).send({ message: 'Usuario ou senha invalidos.' });
      }

      if (user.funcionario.empresa?.idCliente !== idCliente) {
        return reply.code(403).send({ message: 'Acesso nao autorizado para este cliente.' });
      }

      const currentPassword = await prisma.senha.findFirst({
        where: { idUsuario: user.id, boInativo: false },
        orderBy: { dtCadastro: 'desc' },
      });

      const { valid, needsRehash } = await verifyPassword(password, currentPassword);

      if (!valid) {
        return reply.code(401).send({ message: 'Usuario ou senha invalidos.' });
      }

      if (needsRehash && currentPassword) {
        await prisma.senha.update({
          where: { id: currentPassword.id },
          data: { dsSenha: await hashPassword(password), cnTipoHash: HASH_TYPE_BCRYPT },
        });
      }

      const empresas = await prisma.empresa.findMany({
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
        },
        { expiresIn: TOKEN_EXPIRY_WEB },
      );

      return {
        token,
        id: user.id,
        idFuncionario: user.idFuncionario,
        name: user.funcionario.nmFuncionario,
        type: 'employee' as const,
        idCliente,
        empresas,
      };
    } catch (error) {
      request.log.warn(error);
      return reply.code(401).send({ message: 'Usuario ou senha invalidos.' });
    }
  });

  app.get<{
    Querystring: VerifySessionQuery;
  }>('/auth/verify', async (request, reply) => {
    try {
      // A identidade vem exclusivamente do JWT — o parametro ?id= legado e
      // ignorado para impedir enumeracao de usuarios (IDOR).
      const id = request.user.sub;

      const user = await prisma.usuario.findFirst({
        where: { id, boInativo: false },
        include: {
          aluno: true,
          funcionario: { include: { empresa: { select: { idCliente: true } } } },
        },
      });

      if (!user) {
        return reply.code(401).send({ message: 'Usuario inativo ou nao encontrado.' });
      }

      const isStudentActive = user.idAluno ? user.aluno?.boInativo === false : true;
      const isEmployeeActive = user.idFuncionario ? user.funcionario?.boInativo === false : true;

      if (!isStudentActive || !isEmployeeActive) {
        return reply.code(401).send({ message: 'Usuario sem acesso ao sistema.' });
      }

      return {
        id: user.id,
        idAluno: user.idAluno,
        idFuncionario: user.idFuncionario,
        idCliente: user.funcionario?.empresa?.idCliente ?? user.aluno?.idCliente ?? null,
        name: user.aluno?.nmAluno ?? user.funcionario?.nmFuncionario ?? user.dsLogin,
        type: user.idAluno ? 'student' : 'employee',
        studentAccess: user.idAluno ? await getStudentAccessStatus(prisma, user.idAluno) : null,
      };
    } catch (error) {
      // Nunca ecoar o erro interno (ex.: falha de conexao com o banco).
      request.log.error(error);
      return reply.code(500).send({ message: 'Erro ao verificar sessao.' });
    }
  });
}
