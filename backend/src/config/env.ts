import 'dotenv/config';

/**
 * Configuración centralizada. Todos los secretos (API keys) viven SOLO aquí,
 * en el backend, leídos desde variables de entorno. La app móvil nunca los ve.
 */

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'si'].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const port = int(process.env.PORT, 3000);

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port,
  logLevel: process.env.LOG_LEVEL ?? 'info',
  corsOrigins: (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),

  /** Interruptor global del OCR. Si es false, el flujo pasa a digitación manual. */
  ocrEnabled: bool(process.env.OCR_ENABLED, true),
  /** 'ocrspace' (real) o 'mock'. Si falta la API key, se usa 'mock' automáticamente. */
  ocrProvider: (process.env.OCR_PROVIDER ?? 'ocrspace') as 'ocrspace' | 'mock',
  ocrSpaceApiKey: process.env.OCR_SPACE_API_KEY ?? '',
  ocrSpaceUrl: process.env.OCR_SPACE_URL ?? 'https://api.ocr.space/parse/image',
  ocrTimeoutMs: int(process.env.OCR_TIMEOUT_MS, 20000),

  /** Servicio KYC (mock HTTP documentado, montado en /mock-kyc en este mismo servidor). */
  kycBaseUrl: process.env.KYC_BASE_URL ?? `http://127.0.0.1:${port}/mock-kyc/v1`,
  kycApiKey: process.env.KYC_API_KEY ?? 'dev-only-mock-key',
  kycTimeoutMs: int(process.env.KYC_TIMEOUT_MS, 4000),
  kycMaxRetries: int(process.env.KYC_MAX_RETRIES, 1),

  dataFile: process.env.DATA_FILE ?? 'data/sessions.json',
  sessionTtlHours: int(process.env.SESSION_TTL_HOURS, 72),
  imageTtlMinutes: int(process.env.IMAGE_TTL_MINUTES, 30),
  maxImageMb: int(process.env.MAX_IMAGE_MB, 5),
};

export type Env = typeof env;
