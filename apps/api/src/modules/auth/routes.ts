import type { FastifyInstance } from 'fastify';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { prisma } from '../../shared/prisma.js';
import {
  hashPassword,
  normalizeRegisterCpf,
  normalizeRegisterLogin,
  normalizeRegisterPassword,
} from '../../shared/normalize.js';
import type {
  ForgotPasswordPayload,
  LoginPayload,
  RegisterLookupQuery,
  RegisterPayload,
} from '../../shared/api-types.js';

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post<{
    Body: LoginPayload;
  }>('/auth/login', async (request, reply) => {
    try {
      const cpf = normalizeRegisterCpf(request.body.login);
      const password = request.body.password ?? '';

      const user = await prisma.usuario.findFirst({
        where: {
          boInativo: 0,
          OR: [
            { aluno: { caCPF: cpf, boInativo: 0 } },
            { funcionario: { caCPF: cpf, boInativo: 0 } },
          ],
        },
        include: { aluno: true, funcionario: true },
      });

      if (!user) {
        throw new Error('Usuario ou senha invalidos.');
      }

      const currentPassword = await prisma.senha.findFirst({
        where: { idUsuario: user.id, boInativo: 0 },
        orderBy: { dtCadastro: 'desc' },
      });

      const isPasswordValid =
        currentPassword?.cnTipoHash === 1
          ? currentPassword.dsSenha === hashPassword(password)
          : currentPassword?.dsSenha === password;

      if (!isPasswordValid) {
        throw new Error('Usuario ou senha invalidos.');
      }

      return {
        id: user.id,
        idAluno: user.idAluno,
        idFuncionario: user.idFuncionario,
        login: user.dsLogin,
        name: user.aluno?.nmAluno ?? user.funcionario?.nmFuncionario ?? user.dsLogin,
        type: user.idAluno ? 'student' : 'employee',
      };
    } catch (error) {
      return reply.code(401).send({
        message: error instanceof Error ? error.message : 'Erro ao entrar.',
      });
    }
  });

  app.post<{
    Body: ForgotPasswordPayload;
  }>('/auth/forgot-password', async (request, reply) => {
    try {
      const cpf = normalizeRegisterCpf(request.body.cpf);
      const user = await prisma.usuario.findFirst({
        where: {
          boInativo: 0,
          OR: [
            { aluno: { caCPF: cpf, boInativo: 0 } },
            { funcionario: { caCPF: cpf, boInativo: 0 } },
          ],
        },
        include: { aluno: true, funcionario: true },
      });

      if (!user) {
        return reply.code(404).send({
          message: 'CPF nao encontrado para redefinicao de senha.',
        });
      }

      const email = user.dsLogin || user.aluno?.anEmail || user.funcionario?.anEmail || '';

      if (!email) {
        return reply.code(400).send({ message: 'Usuario sem email cadastrado.' });
      }

      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      } as SMTPTransport.Options);

      return await transporter
        .sendMail({
          from: process.env.SMTP_FROM,
          to: email,
          subject: 'Redefinicao de senha - SmartGym',
          text: 'Este e um email de teste para a funcionalidade de redefinicao de senha. Nenhuma acao foi tomada em sua conta.',
          html: `<p>Este e um email de teste para a funcionalidade de redefinicao de senha. Nenhuma acao foi tomada em sua conta.</p><p>Se voce solicitou uma redefinicao de senha, por favor ignore este email ou entre em contato com o suporte.</p>`,
        })
        .then((pResult) => ({
          email,
          message: `Email de teste enviado para ${email}.`,
          testEmailSent: true,
          emailResult: pResult.messageId,
        }));
    } catch (error) {
      return reply.code(400).send({
        message: error instanceof Error ? error.message : 'Erro ao enviar email de redefinicao.',
      });
    }
  });

  app.get<{
    Querystring: RegisterLookupQuery;
  }>('/auth/register-lookup', async (request, reply) => {
    try {
      const type = request.query.type;
      const cpf = normalizeRegisterCpf(request.query.cpf);

      if (type !== 'student' && type !== 'employee') {
        throw new Error('Selecione aluno ou funcionario.');
      }

      if (type === 'student') {
        const student = await prisma.aluno.findFirst({
          where: { caCPF: cpf, boInativo: 0 },
          include: {
            usuarios: { where: { boInativo: 0 }, select: { id: true } },
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
        where: { caCPF: cpf, boInativo: 0 },
        include: {
          usuarios: { where: { boInativo: 0 }, select: { id: true } },
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
  }>('/auth/register', async (request, reply) => {
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
            where: { caCPF: cpf, boInativo: 0 },
            include: { usuarios: { where: { boInativo: 0 }, select: { id: true } } },
          });

          if (!student) {
            throw new Error('CPF nao encontrado no cadastro de alunos.');
          }
          if (student.usuarios.length > 0) {
            throw new Error('Este aluno ja possui usuario cadastrado.');
          }

          const user = await transaction.usuario.create({
            data: { idAluno: student.id, dsLogin, boInativo: 0 },
          });
          await transaction.senha.create({
            data: { idUsuario: user.id, dsSenha: hashPassword(password), cnTipoHash: 1, boTrocaObrigatoria: 0 },
          });

          return { id: user.id, type, name: student.nmAluno, login: user.dsLogin };
        }

        const employee = await transaction.funcionario.findFirst({
          where: { caCPF: cpf, boInativo: 0 },
          include: { usuarios: { where: { boInativo: 0 }, select: { id: true } } },
        });

        if (!employee) {
          throw new Error('CPF nao encontrado no cadastro de funcionarios.');
        }
        if (employee.usuarios.length > 0) {
          throw new Error('Este funcionario ja possui usuario cadastrado.');
        }

        const user = await transaction.usuario.create({
          data: { idFuncionario: employee.id, dsLogin, boInativo: 0 },
        });
        await transaction.senha.create({
          data: { idUsuario: user.id, dsSenha: hashPassword(password), cnTipoHash: 1, boTrocaObrigatoria: 0 },
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
}
