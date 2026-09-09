import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError } from 'fastify';
import { validateEnv } from './config/env.js';
import { registerAuthPlugin } from './plugins/auth.js';
import { registerAuditPlugin } from './plugins/audit.js';
import { registerSystemRoutes } from './modules/system/routes.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { registerStudentRoutes } from './modules/students/routes.js';
import { registerEmployeeRoutes } from './modules/employees/routes.js';
import { registerAccessProfileRoutes } from './modules/accessProfiles/routes.js';
import { registerReportRoutes } from './modules/reports/routes.js';
import { registerNotificationRoutes } from './modules/notifications/routes.js';
import { registerPlanRequestRoutes } from './modules/planRequests/routes.js';
import { registerLeadRoutes } from './modules/leads/routes.js';
import { registerTimeClockRoutes } from './modules/timeclock/routes.js';
import { registerPaymentAccountRoutes } from './modules/paymentAccounts/routes.js';
import { registerCashierRoutes } from './modules/cashier/routes.js';
import { registerWebhookRoutes } from './modules/webhooks/routes.js';
import { registerCompanyRoutes } from './modules/companies/routes.js';
import { registerClientRoutes } from './modules/clients/routes.js';
import { registerPlanRoutes } from './modules/plans/routes.js';
import { registerTrainingRoutes } from './modules/trainings/routes.js';
import { registerProductRoutes } from './modules/products/routes.js';
import { registerSupplierRoutes } from './modules/suppliers/routes.js';
import { registerPromotionRoutes } from './modules/promotions/routes.js';
import { registerExerciseRoutes } from './modules/exercises/routes.js';
import { registerActivityRoutes } from './modules/activities/routes.js';
import { registerAccessRoutes } from './modules/access/routes.js';
import { registerLookupRoutes } from './modules/lookups/routes.js';
import { registerAuxiliaryRoutes } from './modules/auxiliary/routes.js';
import { registerControlidRoutes } from './modules/controlid/routes.js';
import { registerAgendaRoutes } from './modules/agendas/routes.js';
import { registerEquipmentRoutes } from './modules/equipment/routes.js';
import { registerLocalityRoutes } from './modules/localities/routes.js';

validateEnv();

// Em quem confiar para ditar X-Forwarded-For (e, com ele, `request.ip`, que e o
// que o rate limit e os logs usam). O header e escrito pelo cliente: confiar
// errado deixa qualquer um forjar `X-Forwarded-For: <aleatorio>`, ganhar um
// bucket novo de rate limit a cada request (brute force livre no /auth/login) e
// envenenar o IP nos logs.
//
// O hop-count numerico (`trustProxy: <N>`, antigo TRUST_PROXY_HOPS) FOI REMOVIDO
// no fastify 5.12 — CVE-2026-3635 / GHSA-3m5p-2c4r-xxw2: ele nao olha o endereco
// de quem conectou, so a posicao na cadeia, entao um atacante que alcanca a
// origem por fora do proxy forjava o header do mesmo jeito. A defesa correta e
// confiar pelo ENDERECO do proxy: so um request VINDO do IP/CIDR do proxy pode
// ditar o header.
//
// TRUST_PROXY aceita: lista de IP/CIDR separada por virgula (ex.: "10.0.0.0/8"),
// presets do proxy-addr ("loopback", "linklocal", "uniquelocal"), ou "true"
// (rede confiavel de ponta a ponta — use so se a origem NAO for alcancavel fora
// do proxy). Vazio => false: nenhum X-Forwarded e crivel. Isso e o SEGURO, mas
// atras de um proxy faz o rate limit agrupar todos pelo IP do proxy (um bucket
// so) — em producao, configure o CIDR do proxy para o limite voltar a ser por
// cliente.
function resolveTrustProxy(): boolean | string[] {
  const legado = (process.env.TRUST_PROXY_HOPS ?? '').trim();
  const raw = (process.env.TRUST_PROXY ?? '').trim();
  if (legado && !raw) {
    // eslint-disable-next-line no-console
    console.warn(
      '[trustProxy] TRUST_PROXY_HOPS (hop-count) foi descontinuado pelo fastify 5.12 e ignorado. ' +
        'Defina TRUST_PROXY com o IP/CIDR do proxy (ex.: TRUST_PROXY=10.0.0.0/8) para o rate limit por IP funcionar.',
    );
  }
  if (!raw || raw === 'false') return false;
  if (raw === 'true') return true;
  return raw.split(',').map((valor) => valor.trim()).filter(Boolean);
}

export const app = Fastify({
  logger: true,
  trustProxy: resolveTrustProxy(),
  // Teto do corpo JSON (o default do Fastify e 1 MB — explicitado aqui). Uploads
  // de imagem NAO passam por aqui: vao por multipart, com fileSize proprio de 10
  // MB (ver registro abaixo). O maior JSON legitimo e um lote de eventos de
  // catraca (~dezenas de KB), entao 1 MB e folgado e corta payload absurdo cedo.
  bodyLimit: 1_048_576,
});

// Algumas catracas Control iD enviam push como application/x-www-form-urlencoded
// ou ate sem content-type. Tratamos esses casos para parsear o body certinho.
app.addContentTypeParser(
  'application/x-www-form-urlencoded',
  { parseAs: 'string' },
  (_request, body, done) => {
    try {
      const text = typeof body === 'string' ? body : body.toString();
      // Tenta JSON primeiro (algumas catracas embrulham o JSON e mandam com content-type errado).
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        return done(null, JSON.parse(text));
      }
      const params = new URLSearchParams(text);
      const obj: Record<string, unknown> = {};
      params.forEach((value, key) => {
        // Se vier um campo com JSON dentro, faz o parse.
        try {
          obj[key] = JSON.parse(value);
        } catch {
          obj[key] = value;
        }
      });
      done(null, obj);
    } catch (error) {
      done(error as Error, undefined);
    }
  },
);

// Fallback para bodies sem content-type ou text/plain (algumas Control iD mandam assim).
app.addContentTypeParser(
  ['text/plain', 'application/octet-stream'],
  { parseAs: 'string' },
  (_request, body, done) => {
    try {
      const text = typeof body === 'string' ? body : body.toString();
      if (!text.trim()) return done(null, {});
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        return done(null, JSON.parse(text));
      }
      done(null, { raw: text });
    } catch (error) {
      done(error as Error, undefined);
    }
  },
);

// CORS: em producao, somente origens da allowlist CORS_ORIGINS (separadas por
// virgula). O web fala com a API via proxy server-side (sem CORS), o app mobile
// e as catracas nao enviam Origin — a lista cobre apenas browsers diretos.
const corsOrigins = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

await app.register(cors, {
  origin: process.env.NODE_ENV === 'production' ? corsOrigins : true,
});

// Headers de seguranca (CSP, HSTS, X-Frame-Options, nosniff, etc.).
await app.register(helmet);

// Rate limit global por IP; os endpoints de auth tem limites mais restritos
// via config.rateLimit na propria rota.
await app.register(rateLimit, {
  max: 300,
  timeWindow: '1 minute',
});

await app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

// Autenticacao JWT global: toda rota exige token, exceto a allowlist do plugin.
await registerAuthPlugin(app);

// Trilha de auditoria (LGPD art. 37/48): hook onResponse que registra acesso a
// dado pessoal e eventos de seguranca. Depois do auth para enxergar request.user.
registerAuditPlugin(app);

// Erros nao tratados pelos handlers: loga o detalhe no servidor e responde
// mensagem generica — nunca vazar stack trace ou erro interno (ex.: Prisma).
app.setErrorHandler((error: FastifyError, request, reply) => {
  const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;
  if (statusCode >= 500) {
    request.log.error(error);
    return reply.code(statusCode).send({ message: 'Erro interno do servidor.' });
  }
  return reply.code(statusCode).send({ message: error.message });
});

// Rota inexistente: 404 generico. O default do Fastify responde
// "Route GET:/x not found", que confirma o metodo e ajuda a mapear a superficie
// da API por tentativa. A mensagem neutra nao nega nem confirma nada.
app.setNotFoundHandler((_request, reply) => {
  return reply.code(404).send({ message: 'Recurso nao encontrado.' });
});

await registerSystemRoutes(app);
await registerAuthRoutes(app);
await registerStudentRoutes(app);
await registerEmployeeRoutes(app);
await registerAccessProfileRoutes(app);
await registerReportRoutes(app);
await registerNotificationRoutes(app);
await registerPlanRequestRoutes(app);
await registerLeadRoutes(app);
await registerTimeClockRoutes(app);
await registerPaymentAccountRoutes(app);
await registerCashierRoutes(app);
await registerWebhookRoutes(app);
await registerCompanyRoutes(app);
await registerClientRoutes(app);
await registerPlanRoutes(app);
await registerTrainingRoutes(app);
await registerProductRoutes(app);
await registerSupplierRoutes(app);
await registerPromotionRoutes(app);
await registerExerciseRoutes(app);
await registerActivityRoutes(app);
await registerAccessRoutes(app);
await registerLookupRoutes(app);
await registerAuxiliaryRoutes(app);
await registerControlidRoutes(app);
await registerAgendaRoutes(app);
await registerEquipmentRoutes(app);
await registerLocalityRoutes(app);
