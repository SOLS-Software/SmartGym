// Despacho de avisos por email e push.
//
// A GERACAO do aviso mora em shared/notifications.ts; aqui esta so a entrega em
// lote e a rota que a dispara.
//
// POR QUE E UMA ROTA E NAO UM AGENDADOR INTERNO: a API pode rodar em varias
// instancias, e um setInterval em cada uma enviaria o mesmo email N vezes. Uma
// rota deixa o agendamento com quem sabe agendar (cron do provedor, GitHub
// Action, tarefa do Windows) e mantem UMA chamada por horario. Enquanto ninguem
// agendar, a rota continua sendo util disparada a mao pela academia.
//
// EMAIL E PUSH SAO INDEPENDENTES. Cada um tem sua coluna de data em
// Notificacao, e um nao espera o outro: quem nao instalou o app recebe o email
// mesmo assim, e quem instalou recebe o push mesmo que a caixa de email esteja
// cheia. Falhar em um nao marca o outro como entregue.
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { prisma } from '../../shared/prisma.js';
import { clientErrorMessage } from '../../shared/errors.js';
import { buildNotificationEmail, syncStudentNotifications } from '../../shared/notifications.js';
import { sendExpoPush, type PushMessage } from '../../shared/push.js';
import { consentEnforcementEnabled, hasActiveConsent } from '../../shared/consent.js';

const dispatchQuerySchema = z.object({
  // Ensaio: percorre tudo, gera os avisos e RELATA o que enviaria, sem enviar.
  // Existe para conferir o alcance antes de disparar para gente real.
  dryRun: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  } as SMTPTransport.Options);
}

export async function registerNotificationRoutes(app: FastifyInstance) {
  app.post<{
    Querystring: { dryRun?: string; limit?: string };
  }>('/notifications/dispatch', async (request, reply) => {
    const idCliente = request.user.idCliente;
    if (!idCliente) return reply.code(403).send({ message: 'Usuario sem cliente vinculado.' });

    const parsed = dispatchQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ message: 'Parametros invalidos.' });

    const dryRun = parsed.data.dryRun === true;

    try {
      const cliente = await prisma.cliente.findUnique({
        where: { id: idCliente },
        select: { dsCliente: true },
      });
      const nomeAcademia = cliente?.dsCliente ?? 'SmartGym';

      const alunos = await request.tenantDb.aluno.findMany({
        where: { idCliente, boInativo: false },
        take: parsed.data.limit ?? 500,
        select: { id: true, nmAluno: true, anEmail: true },
      });

      const transporter = dryRun ? null : getTransporter();
      if (!dryRun && !transporter) {
        return reply.code(400).send({
          message: 'Envio de email nao configurado (SMTP_HOST ausente).',
        });
      }

      let avisosGerados = 0;
      let enviados = 0;
      let semEmail = 0;
      const falhas: Array<{ idAluno: number; erro: string }> = [];

      // Push acumulado do lote inteiro: o endpoint do Expo aceita 100 mensagens
      // por chamada, entao uma chamada por aluno seria desperdicio de rede.
      const mensagensPush: PushMessage[] = [];
      // token -> avisos que dependem dele. E o que permite decidir, depois do
      // envio, quais avisos foram entregues em ao menos um aparelho.
      const avisosPorToken = new Map<string, number[]>();
      let semAparelho = 0;

      for (const aluno of alunos) {
        const avisos = await syncStudentNotifications(prisma, aluno.id);
        avisosGerados += avisos.length;

        // --- email -------------------------------------------------------
        // So o que ainda nao saiu. `dtEnvioEmail` e o que impede o mesmo aviso
        // de ser reenviado a cada execucao.
        const pendentesEmail = avisos.filter(
          (aviso: { dtEnvioEmail: Date | null }) => aviso.dtEnvioEmail === null,
        );

        const email = (aluno.anEmail ?? '').trim();
        if (pendentesEmail.length > 0 && !email) {
          semEmail += pendentesEmail.length;
        }

        if (pendentesEmail.length > 0 && email) {
          for (const aviso of pendentesEmail) {
            if (dryRun) {
              enviados++;
              continue;
            }

            try {
              const corpo = buildNotificationEmail({
                nomeAluno: aluno.nmAluno,
                titulo: aviso.dsTitulo,
                mensagem: aviso.dsMensagem,
                nomeAcademia,
              });

              await transporter!.sendMail({
                from: process.env.SMTP_FROM,
                to: email,
                subject: corpo.subject,
                text: corpo.text,
              });

              // Marca DEPOIS do envio: se o email falhar, o aviso continua
              // pendente e entra na proxima rodada.
              await request.tenantDb.notificacao.update({
                where: { id: aviso.id },
                data: { dtEnvioEmail: new Date() },
              });
              enviados++;
            } catch (error) {
              // Uma caixa cheia nao pode derrubar o lote inteiro.
              falhas.push({
                idAluno: aluno.id,
                erro: error instanceof Error ? error.message : 'falha no envio',
              });
            }
          }
        }

        // --- push --------------------------------------------------------
        const pendentesPush = avisos.filter(
          (aviso: { dtEnvioPush: Date | null }) => aviso.dtEnvioPush === null,
        );
        if (pendentesPush.length === 0) continue;

        // Gate LGPD (art. 8): sem consentimento vigente de 'push', o aluno nao
        // recebe notificacao. Ver shared/consent.ts (kill-switch de transicao).
        if (consentEnforcementEnabled() && !(await hasActiveConsent(prisma, aluno.id, 'push'))) {
          continue;
        }

        const aparelhos = await prisma.usuarioDispositivo.findMany({
          where: { boInativo: false, usuario: { idAluno: aluno.id, boInativo: false } },
          select: { caTokenPush: true },
        });

        if (aparelhos.length === 0) {
          semAparelho += pendentesPush.length;
          continue;
        }

        for (const aviso of pendentesPush) {
          for (const aparelho of aparelhos) {
            mensagensPush.push({
              to: aparelho.caTokenPush,
              title: aviso.dsTitulo,
              body: aviso.dsMensagem,
              // A tela de avisos do app le isto para abrir direto no aviso
              // tocado, em vez de largar o aluno na home.
              data: { tipo: 'aviso', idNotificacao: aviso.id, cnTipo: aviso.cnTipo },
            });
            const lista = avisosPorToken.get(aparelho.caTokenPush);
            if (lista) lista.push(aviso.id);
            else avisosPorToken.set(aparelho.caTokenPush, [aviso.id]);
          }
        }
      }

      // --- envio do push em lote ------------------------------------------
      let push = { enviados: 0, tokensInvalidos: [] as string[], falhas: [] as unknown[] };

      if (mensagensPush.length > 0 && !dryRun) {
        const resultado = await sendExpoPush(mensagensPush);
        push = resultado;

        // Aparelho que o Expo recusou como morto sai da base. Sem esta poda, a
        // lista de tokens so cresce e toda rodada gasta chamada com endereco
        // que nunca mais vai receber nada.
        if (resultado.tokensInvalidos.length > 0) {
          await prisma.usuarioDispositivo.updateMany({
            where: { caTokenPush: { in: resultado.tokensInvalidos } },
            data: { boInativo: true },
          });
        }

        // Um aviso conta como entregue se ao menos UM aparelho o aceitou. Quem
        // tem dois telefones e viu no primeiro nao precisa receber de novo
        // porque o segundo estava sem bateria.
        const tokensQueFalharam = new Set([
          ...resultado.tokensInvalidos,
          ...resultado.falhas.map((falha) => falha.token),
        ]);

        const entregues = new Set<number>();
        for (const [token, ids] of avisosPorToken) {
          if (tokensQueFalharam.has(token)) continue;
          for (const id of ids) entregues.add(id);
        }

        if (entregues.size > 0) {
          await request.tenantDb.notificacao.updateMany({
            where: { id: { in: [...entregues] } },
            data: { dtEnvioPush: new Date() },
          });
        }
      }

      return {
        dryRun,
        alunosVarridos: alunos.length,
        avisosAtivos: avisosGerados,
        enviados,
        semEmail,
        falhas,
        push: {
          // Em ensaio, `enviaria` e o que sairia; fora dele, o que saiu.
          enviaria: dryRun ? mensagensPush.length : undefined,
          enviados: push.enviados,
          semAparelho,
          tokensRemovidos: push.tokensInvalidos.length,
          falhas: push.falhas.length,
        },
      };
    } catch (error) {
      request.log.error(error);
      return reply.code(400).send({
        message: clientErrorMessage(error, 'Erro ao despachar avisos.'),
      });
    }
  });
}
