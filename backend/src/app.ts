import fs from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { env, type Env } from './config/env';
import { accessLog, errorHandler, notFoundHandler } from './middleware/errorHandler';
import { ImageVault, JsonFileSessionRepository } from './repositories/sessionRepository';
import { createOnboardingRouter } from './routes/onboarding.routes';
import { KycClient } from './services/kyc/kycClient';
import { createMockKycRouter } from './services/kyc/mockKycServer';
import { MockOcrProvider, OcrSpaceProvider, type OcrProvider } from './services/ocr/ocrProviders';
import { OnboardingService } from './services/onboardingService';
import { logger } from './utils/logger';

/** Elige el proveedor OCR según la configuración. Sin API key → mock (y se avisa). */
export function buildOcrProvider(config: Env): OcrProvider {
  if (config.ocrProvider === 'ocrspace' && config.ocrSpaceApiKey) {
    return new OcrSpaceProvider(config.ocrSpaceApiKey, config.ocrSpaceUrl, config.ocrTimeoutMs);
  }
  if (config.ocrProvider === 'ocrspace') {
    logger.warn('ocr.no_api_key', { fallback: 'mock' });
    return new MockOcrProvider('Se usó el OCR simulado porque el servidor no tiene OCR_SPACE_API_KEY configurada.');
  }
  return new MockOcrProvider('Se usó el OCR simulado por configuración (OCR_PROVIDER=mock).');
}

/** Composición de dependencias (inyección manual). Los tests pueden pasar las suyas. */
export function createApp(config: Env = env, overrides: { ocr?: OcrProvider; dataFile?: string | null } = {}) {
  const repo = new JsonFileSessionRepository(overrides.dataFile === undefined ? config.dataFile : overrides.dataFile, config.sessionTtlHours);
  const vault = new ImageVault(config.imageTtlMinutes);
  const kyc = new KycClient({ baseUrl: config.kycBaseUrl, apiKey: config.kycApiKey, timeoutMs: config.kycTimeoutMs, maxRetries: config.kycMaxRetries });
  const service = new OnboardingService({ repo, vault, ocr: overrides.ocr ?? buildOcrProvider(config), ocrEnabled: config.ocrEnabled, kyc });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  // Cabeceras de seguridad. Se omite upgrade-insecure-requests para que Swagger funcione por http en la LAN (MVP).
  app.use(helmet({ contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } } }));
  app.use(cors({ origin: config.corsOrigins.length ? config.corsOrigins : false }));
  app.use(express.json({ limit: '50kb' }));
  app.use(accessLog);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ocrEnabled: config.ocrEnabled, ocrProvider: service.ocrProviderName, ocrNotice: service.ocrNotice, time: new Date().toISOString() });
  });

  const openapiPath = path.join(__dirname, '..', 'openapi.yaml');
  if (fs.existsSync(openapiPath)) {
    app.use('/docs', swaggerUi.serve, swaggerUi.setup(YAML.parse(fs.readFileSync(openapiPath, 'utf8'))));
  }

  app.use('/api/v1', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.use('/api/v1', createOnboardingRouter(service, config.maxImageMb));
  app.use('/mock-kyc/v1', createMockKycRouter(config.kycApiKey));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return { app, service, repo, vault };
}
