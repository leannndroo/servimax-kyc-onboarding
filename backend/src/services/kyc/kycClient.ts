import { z } from 'zod';
import type { ConfirmedData, QueryResult, Registration } from '../../domain/types';
import { TimeoutError, withTimeout } from '../../utils/errors';
import { logger } from '../../utils/logger';

/**
 * Cliente del proveedor KYC. Responsabilidades:
 *  1. Enviar solo los datos necesarios (minimización).
 *  2. Timeout por consulta + reintento con espera ante fallos transitorios.
 *  3. Validar la forma de la respuesta (nunca confiar en un tercero).
 *  4. Traducir todo a QueryResult: un fallo NUNCA lanza excepción hacia arriba,
 *     se convierte en un resultado ERROR/TIMEOUT que el score sabe interpretar.
 */

const identitySchema = z.object({
  requestId: z.string(),
  found: z.boolean(),
  documentStatus: z.enum(['VIGENTE', 'CANCELADA', 'NO_REGISTRA']),
  matches: z.object({ firstNames: z.boolean(), lastNames: z.boolean(), birthDate: z.boolean() }),
});

const watchlistSchema = z.object({
  requestId: z.string(),
  checkedLists: z.array(z.string()),
  hits: z.array(z.object({ list: z.string(), reason: z.string() })),
});

class HttpStatusError extends Error {
  constructor(public readonly status: number) {
    super(`HTTP ${status}`);
  }
}

class InvalidResponseError extends Error {}

export interface KycClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  maxRetries: number;
  providerName?: string;
}

const DISPOSABLE_DOMAINS = ['mailinator.com', 'yopmail.com', 'tempmail.com', '10minutemail.com', 'guerrillamail.com'];

export class KycClient {
  private readonly provider: string;

  constructor(private readonly opts: KycClientOptions) {
    this.provider = opts.providerName ?? 'KYC mock (HTTP)';
  }

  private async post<T>(path: string, payload: unknown, schema: z.ZodType<T>) {
    let attempts = 0;
    for (;;) {
      attempts += 1;
      try {
        const data = await withTimeout(async (signal) => {
          const res = await fetch(`${this.opts.baseUrl}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': this.opts.apiKey },
            body: JSON.stringify(payload),
            signal,
          });
          if (!res.ok) throw new HttpStatusError(res.status);
          return res.json();
        }, this.opts.timeoutMs);
        const parsed = schema.safeParse(data);
        if (!parsed.success) throw new InvalidResponseError('Respuesta con formato inesperado');
        return { data: parsed.data, attempts };
      } catch (err) {
        const transient = err instanceof TimeoutError || (err instanceof HttpStatusError && err.status >= 500) ||
          err instanceof TypeError; // TypeError = fallo de red en fetch
        logger.warn('kyc.call_failed', { path, attempts, error: (err as Error).message, transient });
        if (!transient || attempts > this.opts.maxRetries) throw Object.assign(err as Error, { attempts });
        await new Promise((r) => setTimeout(r, 300 * attempts)); // espera incremental
      }
    }
  }

  private failure(name: QueryResult['name'], label: string, err: unknown, started: number): QueryResult {
    const e = err as Error;
    const attempts = (err as { attempts?: number }).attempts ?? 1;
    const timeout = e instanceof TimeoutError;
    let detail = 'No fue posible conectar con el servicio. Se puede reintentar.';
    if (timeout) detail = 'El servicio no respondió a tiempo. Se puede reintentar.';
    else if (e instanceof HttpStatusError) detail = `El servicio no está disponible (HTTP ${e.status}).`;
    else if (e instanceof InvalidResponseError) detail = 'El servicio respondió con un formato inesperado.';
    return { name, label, provider: this.provider, status: timeout ? 'TIMEOUT' : 'ERROR',
      durationMs: Date.now() - started, attempts, detail };
  }

  async verifyIdentity(reg: Registration, c: ConfirmedData): Promise<QueryResult> {
    const label = 'Registro de identidad';
    const started = Date.now();
    try {
      const { data, attempts } = await this.post('/identity/verify', {
        documentType: reg.documentType, documentNumber: c.documentNumber,
        firstNames: c.firstNames, lastNames: c.lastNames, birthDate: c.birthDate,
      }, identitySchema);
      const allMatch = data.matches.firstNames && data.matches.lastNames && data.matches.birthDate;
      const ok = data.found && data.documentStatus === 'VIGENTE' && allMatch;
      const detail = !data.found
        ? 'El documento no se encontró en el registro.'
        : `Documento ${data.documentStatus.toLowerCase()}. Nombres: ${data.matches.firstNames ? 'coinciden' : 'NO coinciden'}; ` +
          `apellidos: ${data.matches.lastNames ? 'coinciden' : 'NO coinciden'}; ` +
          `fecha de nacimiento: ${data.matches.birthDate ? 'coincide' : 'NO coincide'}.`;
      return { name: 'IDENTITY_REGISTRY', label, provider: this.provider, status: data.found ? (ok ? 'OK' : 'ALERT') : 'NOT_FOUND',
        durationMs: Date.now() - started, attempts, detail, data };
    } catch (err) {
      return this.failure('IDENTITY_REGISTRY', label, err, started);
    }
  }

  async screenWatchlists(c: ConfirmedData): Promise<QueryResult> {
    const label = 'Listas restrictivas';
    const started = Date.now();
    try {
      const { data, attempts } = await this.post('/watchlists/screen', {
        documentNumber: c.documentNumber, fullName: `${c.firstNames} ${c.lastNames}`,
      }, watchlistSchema);
      const hit = data.hits.length > 0;
      return { name: 'WATCHLISTS', label, provider: this.provider, status: hit ? 'ALERT' : 'OK',
        durationMs: Date.now() - started, attempts,
        detail: hit ? `Coincidencia en: ${data.hits.map((h) => h.list).join(', ')}.` : `Sin coincidencias en ${data.checkedLists.length} listas: ${data.checkedLists.join('; ')}.`,
        data };
    } catch (err) {
      return this.failure('WATCHLISTS', label, err, started);
    }
  }

  /** Verificación local (sin proveedor externo) de los datos de contacto. */
  checkContact(reg: Registration): QueryResult {
    const domain = reg.email.split('@')[1] ?? '';
    const disposable = DISPOSABLE_DOMAINS.includes(domain);
    return { name: 'CONTACT_CHECK', label: 'Datos de contacto', provider: 'Reglas internas', status: disposable ? 'ALERT' : 'OK',
      durationMs: 0, attempts: 1,
      detail: disposable ? 'El correo pertenece a un dominio temporal.' : 'Celular colombiano y correo con formato válido.' };
  }

  async runAll(reg: Registration, c: ConfirmedData): Promise<QueryResult[]> {
    // En paralelo: el tiempo total es el de la consulta más lenta, no la suma.
    const [identity, watchlists] = await Promise.all([this.verifyIdentity(reg, c), this.screenWatchlists(c)]);
    return [identity, watchlists, this.checkContact(reg)];
  }
}
