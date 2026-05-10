import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { validateEnv } from './config/env.js';
import { registerSystemRoutes } from './modules/system/routes.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { registerStudentRoutes } from './modules/students/routes.js';
import { registerEmployeeRoutes } from './modules/employees/routes.js';
import { registerCompanyRoutes } from './modules/companies/routes.js';
import { registerPlanRoutes } from './modules/plans/routes.js';
import { registerTrainingRoutes } from './modules/trainings/routes.js';
import { registerProductRoutes } from './modules/products/routes.js';
import { registerPromotionRoutes } from './modules/promotions/routes.js';
import { registerExerciseRoutes } from './modules/exercises/routes.js';
import { registerActivityRoutes } from './modules/activities/routes.js';
import { registerAccessRoutes } from './modules/access/routes.js';
import { registerLookupRoutes } from './modules/lookups/routes.js';
import { registerAuxiliaryRoutes } from './modules/auxiliary/routes.js';

validateEnv();

export const app = Fastify({
  logger: true,
});

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
await registerPlanRoutes(app);
await registerTrainingRoutes(app);
await registerProductRoutes(app);
await registerPromotionRoutes(app);
await registerExerciseRoutes(app);
await registerActivityRoutes(app);
await registerAccessRoutes(app);
await registerLookupRoutes(app);
await registerAuxiliaryRoutes(app);
