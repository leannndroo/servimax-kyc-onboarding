import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Todas las respuestas de error tienen la misma forma:
 *   { error: { code, message, details? } }
 * Nunca se envía el stack trace ni datos internos al cliente.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof MulterError) {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooLarge ? 413 : 400).json({
      error: {
        code: tooLarge ? 'IMAGE_TOO_LARGE' : 'INVALID_UPLOAD',
        message: tooLarge ? 'La foto es demasiado pesada. Tómala de nuevo.' : 'Carga solo las fotos del frente y del reverso.',
      },
    });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'El cuerpo de la petición no es un JSON válido.' } });
    return;
  }
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error('request.app_error', { code: err.code, path: req.path });
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  logger.error('request.unhandled_error', { path: req.path, error: (err as Error)?.message });
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado. Tus datos están guardados; intenta de nuevo.' } });
};

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'Ruta no encontrada' } });
};

/** Log de acceso sin datos personales: método, ruta, estado y duración. */
export const accessLog: RequestHandler = (req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    logger.info('http.request', {
      method: req.method,
      path: req.path.replace(/[0-9a-f-]{36}/gi, ':id'),
      status: res.statusCode,
      ms: Date.now() - started,
    });
  });
  next();
};
