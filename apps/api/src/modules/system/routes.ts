import type { FastifyInstance } from 'fastify';

export async function registerSystemRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return {
      status: 'ok',
      service: 'smartgym-api',
    };
  });
}
