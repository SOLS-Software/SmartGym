import { app } from './app.js';

const port = Number(process.env.API_PORT ?? 3333);

try {
  await app.listen({
    port,
    host: '0.0.0.0',
  });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
