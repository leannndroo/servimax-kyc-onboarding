/**
 * Logger estructurado (JSON por línea) con REDACCIÓN de datos sensibles.
 * Regla: nunca se imprime nombre, documento, correo, teléfono, fechas
 * de nacimiento ni imágenes. Si una clave sensible llega por error,
 * se reemplaza por "[REDACTED]".
 */

const SENSITIVE_KEYS = new Set([
  'fullName', 'firstNames', 'lastNames', 'documentNumber', 'phone', 'email',
  'birthDate', 'birthPlace', 'issuePlace', 'issueDate', 'image', 'base64Image',
  'apikey', 'apiKey', 'x-api-key', 'authorization', 'text', 'parsedText',
]);

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out;
}

const minLevel = LEVELS[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? LEVELS.info;

function write(level: Level, event: string, meta?: Record<string, unknown>) {
  if (LEVELS[level] < minLevel || process.env.NODE_ENV === 'test') return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...(redact(meta) as object) });
  (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
}

export const logger = {
  debug: (event: string, meta?: Record<string, unknown>) => write('debug', event, meta),
  info: (event: string, meta?: Record<string, unknown>) => write('info', event, meta),
  warn: (event: string, meta?: Record<string, unknown>) => write('warn', event, meta),
  error: (event: string, meta?: Record<string, unknown>) => write('error', event, meta),
};
