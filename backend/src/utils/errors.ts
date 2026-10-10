/**
 * Error de aplicación con código estable. La app móvil usa el `code`
 * para decidir qué mensaje y qué opciones de recuperación mostrar.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what = 'Sesión') => new AppError(404, 'NOT_FOUND', `${what} no encontrada o expirada`);

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(400, code, message, details);

/** Ejecuta una promesa con límite de tiempo. Si se pasa, lanza TimeoutError. */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Tiempo de espera agotado (${ms} ms)`);
    this.name = 'TimeoutError';
  }
}

export async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await work(controller.signal);
  } catch (err) {
    if (controller.signal.aborted) throw new TimeoutError(ms);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
