import { env } from './config/env';
import { createApp } from './app';
import { logger } from './utils/logger';

const { app, repo, vault } = createApp(env);

const server = app.listen(env.port, '0.0.0.0', () => {
  logger.info('server.started', { port: env.port, ocrEnabled: env.ocrEnabled, ocrProvider: env.ocrProvider });
  // eslint-disable-next-line no-console
  console.log(`\n  API lista en http://localhost:${env.port}  ·  Swagger: http://localhost:${env.port}/docs\n`);
});

// Limpieza periódica: sesiones vencidas e imágenes que quedaron en memoria.
const janitor = setInterval(() => {
  const removed = repo.purgeExpired();
  vault.purgeExpired();
  if (removed) logger.info('retention.purged', { removed });
}, 5 * 60_000);

const shutdown = () => {
  clearInterval(janitor);
  server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
