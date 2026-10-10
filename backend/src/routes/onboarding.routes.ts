import { Router } from 'express';
import multer from 'multer';
import type { z, ZodTypeAny } from 'zod';
import {
  confirmationSchema, manualReviewSchema, ocrRequestSchema, registrationSchema, reportFormatSchema,
} from '../domain/schemas';
import { AppError, badRequest } from '../utils/errors';
import { logger } from '../utils/logger';
import type { OnboardingService } from '../services/onboardingService';
import { buildReport, toCsv, toPdf } from '../services/report';

/** Valida con zod y, si falla, devuelve los errores por campo (la app los pinta bajo cada input). */
function validate<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) fields[issue.path.join('.') || 'body'] ??= issue.message;
  throw badRequest('VALIDATION_ERROR', 'Revisa los campos marcados.', { fields });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createOnboardingRouter(service: OnboardingService, maxImageMb: number): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(), // las fotos nunca se escriben en disco
    limits: { fileSize: maxImageMb * 1024 * 1024, files: 2 },
  });

  router.param('id', (_req, _res, next, id: string) => {
    next(UUID.test(id) ? undefined : new AppError(404, 'NOT_FOUND', 'Sesión no encontrada o expirada'));
  });

  router.post('/onboarding', (req, res) => {
    const session = service.create(validate(registrationSchema, req.body));
    res.status(201).json(session);
  });

  router.get('/onboarding/:id', (req, res) => {
    res.json(service.get(req.params.id));
  });

  router.post('/onboarding/:id/documents', upload.fields([{ name: 'front', maxCount: 1 }, { name: 'back', maxCount: 1 }]), (req, res) => {
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
    const pick = (f?: Express.Multer.File[]) => (f?.[0] ? { buffer: f[0].buffer, size: f[0].size } : undefined);
    const session = service.uploadDocuments(req.params.id, { front: pick(files.front), back: pick(files.back) });
    res.json({ documents: session.documents, status: session.status });
  });

  router.post('/onboarding/:id/ocr', async (req, res) => {
    const { useOcr } = validate(ocrRequestSchema, req.body ?? {});
    res.json(await service.runOcr(req.params.id, useOcr));
  });

  router.put('/onboarding/:id/confirmation', (req, res) => {
    res.json(service.confirm(req.params.id, validate(confirmationSchema, req.body)));
  });

  router.post('/onboarding/:id/manual-review', (req, res) => {
    const { reason } = validate(manualReviewSchema, req.body);
    res.json(service.requestManualReview(req.params.id, reason));
  });

  router.post('/onboarding/:id/verification', async (req, res) => {
    res.json(await service.verify(req.params.id));
  });

  router.get('/onboarding/:id/report', async (req, res) => {
    const format = validate(reportFormatSchema, req.query.format ?? 'pdf');
    const session = service.get(req.params.id);
    if (!session.result) throw new AppError(409, 'NOT_COMPLETED', 'El informe se genera cuando termina la validación.');
    try {
      const report = buildReport(session, service.metrics());
      const name = `informe-kyc-${session.id.slice(0, 8)}`;
      if (format === 'json') {
        res.setHeader('Content-Disposition', `attachment; filename="${name}.json"`).json(report);
      } else if (format === 'csv') {
        res.type('text/csv; charset=utf-8').setHeader('Content-Disposition', `attachment; filename="${name}.csv"`).send(toCsv(report));
      } else {
        const pdf = await toPdf(report);
        res.type('application/pdf').setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`).send(pdf);
      }
      service.recordReport(session.id, format);
    } catch (err) {
      logger.error('report.failed', { sessionId: session.id, format, error: (err as Error).message });
      throw new AppError(500, 'REPORT_FAILED', `No se pudo generar el informe ${format.toUpperCase()}. Intenta de nuevo o elige otro formato.`);
    }
  });

  router.get('/metrics', (_req, res) => {
    res.json(service.metrics());
  });

  return router;
}
