import { Router, type Response } from 'express';
import { identityScenario, watchlistScenario, type MockReply } from './mockKycScenarios';

/** Expone los escenarios del mock como servicio HTTP en /mock-kyc/v1 (protegido con x-api-key). */
export function createMockKycRouter(apiKey: string): Router {
  const router = Router();

  router.use((req, res, next) => {
    if (req.header('x-api-key') !== apiKey) {
      res.status(401).json({ error: 'INVALID_API_KEY' });
      return;
    }
    next();
  });

  const send = (reply: MockReply, res: Response) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) res.status(reply.status).json(reply.body);
    }, reply.delayMs);
    res.on('close', () => clearTimeout(timer));
  };

  router.post('/identity/verify', (req, res) => send(identityScenario(req.body ?? {}), res));
  router.post('/watchlists/screen', (req, res) => send(watchlistScenario(req.body ?? {}), res));
  return router;
}
