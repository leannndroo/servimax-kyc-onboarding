/**
 * Cliente HTTP de la app. Solo conoce la URL pública del backend;
 * las API keys de OCR y KYC viven en el servidor, nunca aquí.
 * Convierte cualquier fallo en un ApiError con un `code` estable,
 * para que cada pantalla decida qué mensaje y qué salida ofrecer.
 */

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 0,
    public readonly details?: { fields?: Record<string, string>; [k: string]: unknown },
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT';
  json?: unknown;
  form?: FormData;
  timeoutMs?: number;
}

async function raw(path: string, { method = 'GET', json, form, timeoutMs = 20000 }: RequestOptions): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: json !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: form ?? (json !== undefined ? JSON.stringify(json) : undefined),
      signal: controller.signal,
    });
  } catch (e) {
    console.warn('Detalle del error de red:', String(e));
    if (controller.signal.aborted) {
      throw new ApiError('TIMEOUT', 'El servidor tardó demasiado en responder. Tus datos siguen aquí; intenta de nuevo.');
    }
    throw new ApiError('NETWORK_ERROR', 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let body: { error?: { code?: string; message?: string; details?: ApiError['details'] } } = {};
    try {
      body = await res.json();
    } catch {
      /* respuesta sin JSON */
    }
    throw new ApiError(
      body.error?.code ?? `HTTP_${res.status}`,
      body.error?.message ?? 'El servidor respondió con un error inesperado.',
      res.status,
      body.error?.details,
    );
  }
  return res;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await raw(path, options);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError('INVALID_RESPONSE', 'La respuesta del servidor no se pudo leer.');
  }
}

export async function requestBinary(path: string, timeoutMs = 30000): Promise<ArrayBuffer> {
  const res = await raw(path, { timeoutMs });
  return res.arrayBuffer();
}

/** Mensaje amigable para cualquier error (incluso los que no son ApiError). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Ocurrió un error inesperado. Intenta de nuevo.';
}
