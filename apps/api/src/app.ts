import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { validateEnv } from './config/env.js';
import { registerSystemRoutes } from './modules/system/routes.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { registerStudentRoutes } from './modules/students/routes.js';
import { registerEmployeeRoutes } from './modules/employees/routes.js';
import { registerCompanyRoutes } from './modules/companies/routes.js';
import { registerClientRoutes } from './modules/clients/routes.js';
import { registerPlanRoutes } from './modules/plans/routes.js';
import { registerTrainingRoutes } from './modules/trainings/routes.js';
import { registerProductRoutes } from './modules/products/routes.js';
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

export const app = Fastify({
  logger: true,
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

await app.register(cors, {
  origin: true,
});

await app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1,
  },
});

await registerSystemRoutes(app);
await registerAuthRoutes(app);
await registerStudentRoutes(app);
await registerEmployeeRoutes(app);
await registerCompanyRoutes(app);
await registerClientRoutes(app);
await registerPlanRoutes(app);
await registerTrainingRoutes(app);
await registerProductRoutes(app);
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
