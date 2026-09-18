// Notificação ativa dos sinais de segurança (complemento do A-4). A detecção
// consultável é /reports/security-signals; aqui os eventos críticos da trilha
// viram email em tempo real, para o operador não precisar ficar olhando.
//
// Disparado pelo hook de auditoria (plugins/audit.ts) a cada evento gravado —
// SEMPRE fire-and-forget: alertar nunca pode atrasar nem derrubar o request.
//
// Config (env):
//   SECURITY_ALERT_EMAIL            destinatário. VAZIO => no-op (nada é enviado).
//   SECURITY_ALERT_LOGIN_THRESHOLD  falhas de login por IP na janela p/ alertar (default 5).
// SMTP reaproveita SMTP_HOST/PORT/USER/PASS/FROM (mesma config do reset de senha).
//
// LIMITAÇÃO: o throttle (não repetir o mesmo alerta) é em memória — com 2+
// instâncias, um alerta pode sair duplicado. Mesma natureza do rate limit em
// memória (achado B-3); aceitável para alerta.
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { prisma } from './prisma.js';

const ROTAS_LOGIN = ['/auth/login', '/auth/gestor-login'];
const RESULTADOS_SESSAO = ['sessao_revogada', 'conta_inativa', 'conta_inexistente'];
const JANELA_BRUTE_FORCE_MIN = 15;
const THROTTLE_MIN = 30;

type DeviceLogger = { warn: (obj: Record<string, unknown>, msg: string) => void };

// Evita repetir o mesmo alerta em sequência (por IP / por usuário).
const ultimoAlerta = new Map<string, number>();
function podeAlertar(chave: string): boolean {
  const agora = Date.now();
  if (agora - (ultimoAlerta.get(chave) ?? 0) < THROTTLE_MIN * 60_000) return false;
  ultimoAlerta.set(chave, agora);
  return true;
}

async function enviarEmail(subject: string, text: string, log: DeviceLogger): Promise<void> {
  const to = (process.env.SECURITY_ALERT_EMAIL ?? '').trim();
  if (!to) return; // sem destinatário configurado: recurso desligado.
  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    } as SMTPTransport.Options);
    await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, text });
  } catch (err) {
    log.warn({ err }, 'Falha ao enviar alerta de seguranca por email.');
  }
}

export type AuditEvent = {
  idUsuario: number | null;
  anIp: string | null;
  cnMetodo: string;
  dsRota: string;
  nrStatus: number;
  dsResultado: string | null;
};

// Decide se um evento auditado merece alerta e dispara (fire-and-forget). Nunca
// lança — o chamador (hook de auditoria) não pode ser afetado.
export function notifyOnAuditEvent(ev: AuditEvent, log: DeviceLogger): void {
  // 1) Brute force: uma falha de login que faz o IP cruzar o limiar na janela.
  if (
    ev.nrStatus === 401 &&
    ev.cnMetodo === 'POST' &&
    ev.anIp &&
    ROTAS_LOGIN.includes(ev.dsRota)
  ) {
    const limiar = Number(process.env.SECURITY_ALERT_LOGIN_THRESHOLD ?? 5);
    const ip = ev.anIp;
    void (async () => {
      try {
        const desde = new Date(Date.now() - JANELA_BRUTE_FORCE_MIN * 60_000);
        const n = await prisma.auditoria.count({
          where: { anIp: ip, dtEvento: { gte: desde }, nrStatus: 401, dsRota: { in: ROTAS_LOGIN } },
        });
        if (n >= limiar && podeAlertar(`bruteforce:${ip}`)) {
          await enviarEmail(
            '[SOLSFIT] Possivel brute force de login',
            `O IP ${ip} acumulou ${n} falhas de login em ${JANELA_BRUTE_FORCE_MIN} minutos ` +
              `(limiar ${limiar}). Verifique /reports/security-signals.`,
            log,
          );
        }
      } catch (err) {
        log.warn({ err }, 'Falha ao avaliar alerta de brute force.');
      }
    })();
  }

  // 2) Uso de sessao/token revogado — sinal de credencial vazada, alerta imediato.
  if (ev.dsResultado && RESULTADOS_SESSAO.includes(ev.dsResultado)) {
    const alvo = ev.idUsuario ?? ev.anIp ?? 'desconhecido';
    if (podeAlertar(`revogada:${alvo}`)) {
      void enviarEmail(
        '[SOLSFIT] Uso de sessao revogada',
        `Uso de token invalido/revogado (${ev.dsResultado}): usuario ${ev.idUsuario ?? '-'}, ` +
          `IP ${ev.anIp ?? '-'}, rota ${ev.dsRota}. Pode ser um token vazado tentando reentrar.`,
        log,
      );
    }
  }
}
