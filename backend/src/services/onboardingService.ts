import { randomUUID } from 'node:crypto';
import { imageSize } from 'image-size';
import type {
  ConfirmedData, ImageMeta, LogEntry, OcrFields, OcrResult, OnboardingSession, Registration,
} from '../domain/types';
import { digitsOnly, mask, normalizeName } from '../domain/text';
import { AppError, badRequest, notFound } from '../utils/errors';
import { logger } from '../utils/logger';
import type { ImageVault, SessionRepository } from '../repositories/sessionRepository';
import type { OcrProvider } from './ocr/ocrProviders';
import { parseCedulaText, REQUIRED_OCR_FIELDS } from './ocr/cedulaParser';
import type { KycClient } from './kyc/kycClient';
import { computeScore, DECISION_LABEL } from './scoring';

export interface UploadedFile {
  buffer: Buffer;
  size: number;
}

export interface ServiceDeps {
  repo: SessionRepository;
  vault: ImageVault;
  ocr: OcrProvider;
  ocrEnabled: boolean;
  kyc: KycClient;
}

const FIELD_LABELS: Record<keyof OcrFields, string> = {
  firstNames: 'nombres', lastNames: 'apellidos', documentNumber: 'número', birthDate: 'fecha de nacimiento',
  birthPlace: 'lugar de nacimiento', issueDate: 'fecha de expedición', issuePlace: 'lugar de expedición',
};

/**
 * ORQUESTADOR del onboarding. Cada método es un paso del flujo y deja
 * rastro en la bitácora (log) de la sesión para que el resultado sea auditable.
 */
export class OnboardingService {
  constructor(private readonly deps: ServiceDeps) {}

  get ocrProviderName(): string {
    return this.deps.ocr.name;
  }

  get ocrNotice(): string | undefined {
    return this.deps.ocr.notice;
  }

  recordReport(id: string, format: string) {
    const s = this.get(id);
    this.log(s, 'INFORME', `Informe ${format.toUpperCase()} generado.`);
    this.deps.repo.save(s);
  }

  private log(s: OnboardingSession, step: LogEntry['step'], message: string, level: LogEntry['level'] = 'INFO') {
    s.log.push({ at: new Date().toISOString(), step, level, message });
  }

  get(id: string): OnboardingSession {
    const s = this.deps.repo.get(id);
    if (!s) throw notFound();
    return s;
  }

  create(registration: Registration): OnboardingSession {
    const now = new Date().toISOString();
    const s: OnboardingSession = {
      id: randomUUID(), createdAt: now, updatedAt: now, status: 'REGISTERED',
      registration, documents: {}, queries: [], log: [],
    };
    this.log(s, 'REGISTRO', `Registro recibido: ${registration.documentType} ${mask(registration.documentNumber)}, ${registration.city}.`);
    this.deps.repo.save(s);
    logger.info('onboarding.created', { sessionId: s.id });
    return s;
  }

  uploadDocuments(id: string, files: { front?: UploadedFile; back?: UploadedFile }) {
    const s = this.get(id);
    if (s.status === 'COMPLETED') throw new AppError(409, 'ALREADY_COMPLETED', 'La validación ya terminó.');
    const missing = (['front', 'back'] as const).filter((side) => !files[side]);
    if (missing.length) {
      throw badRequest('MISSING_IMAGE', `Falta la foto del ${missing.map((m) => (m === 'front' ? 'frente' : 'reverso')).join(' y del ')} de la cédula.`, { missing });
    }

    for (const side of ['front', 'back'] as const) {
      const meta = this.inspectImage(side, files[side]!);
      s.documents[side] = meta;
      this.deps.vault.put(s.id, side, { buffer: files[side]!.buffer, mimeType: meta.mimeType });
    }
    // Volver a cargar documentos invalida lo que dependía de las fotos anteriores.
    s.ocr = undefined;
    s.confirmed = undefined;
    s.status = 'DOCUMENTS_UPLOADED';
    const warnings = [...s.documents.front!.qualityWarnings, ...s.documents.back!.qualityWarnings];
    this.log(s, 'CAPTURA', `Frente y reverso recibidos${warnings.length ? ` con advertencias: ${warnings.join('; ')}` : ' sin advertencias de calidad'}.`,
      warnings.length ? 'WARN' : 'INFO');
    this.deps.repo.save(s);
    return s;
  }

  /** Valida el contenido real del archivo (no se confía en la extensión ni en el mime declarado). */
  private inspectImage(side: 'front' | 'back', file: UploadedFile): ImageMeta {
    const sideName = side === 'front' ? 'frente' : 'reverso';
    let dims: { width?: number; height?: number; type?: string };
    try {
      dims = imageSize(file.buffer);
    } catch {
      throw badRequest('UNREADABLE_IMAGE', `La foto del ${sideName} está dañada o no es una imagen. Tómala de nuevo.`, { side });
    }
    if (!dims.type || !['jpg', 'png'].includes(dims.type)) {
      throw badRequest('INVALID_IMAGE_TYPE', `La foto del ${sideName} debe ser JPG o PNG.`, { side });
    }
    const width = dims.width ?? 0;
    const height = dims.height ?? 0;
    if (Math.max(width, height) < 640 || file.size < 15_000) {
      throw badRequest('LOW_QUALITY_IMAGE',
        `La foto del ${sideName} tiene muy baja resolución para leerse. Acércate al documento, con buena luz, y repite la foto.`, { side, width, height });
    }
    const qualityWarnings: string[] = [];
    if (Math.max(width, height) < 1000) qualityWarnings.push(`${sideName}: resolución baja`);
    if (file.size < 60_000) qualityWarnings.push(`${sideName}: imagen muy comprimida`);
    return { side, mimeType: dims.type === 'png' ? 'image/png' : 'image/jpeg', sizeBytes: file.size, width, height, qualityWarnings };
  }

  async runOcr(id: string, useOcr: boolean): Promise<OcrResult> {
    const s = this.get(id);
    if (!s.documents.front || !s.documents.back) throw new AppError(409, 'DOCUMENTS_REQUIRED', 'Primero carga el frente y el reverso de la cédula.');
    const attempts = (s.ocr?.attempts ?? 0) + 1;
    const provider = this.deps.ocr.name;
    const enabled = this.deps.ocrEnabled && useOcr;

    let result: OcrResult;
    if (!enabled) {
      result = { enabled: false, provider, status: 'SKIPPED', fields: {}, missingFields: [...REQUIRED_OCR_FIELDS], attempts,
        message: this.deps.ocrEnabled ? 'Elegiste digitar los datos manualmente.' : 'El OCR está desactivado en el servidor. Digita los datos del documento.' };
    } else {
      const images = this.deps.vault.get(s.id);
      if (!images?.front || !images.back) {
        throw new AppError(410, 'IMAGES_EXPIRED', 'Por seguridad las fotos se eliminaron tras un tiempo. Vuelve a cargarlas.');
      }
      try {
        const [front, back] = await Promise.all([
          this.deps.ocr.extractText(images.front.buffer, images.front.mimeType, { side: 'front', registration: s.registration }),
          this.deps.ocr.extractText(images.back.buffer, images.back.mimeType, { side: 'back', registration: s.registration }),
        ]);
        const fields = parseCedulaText(front, back);
        const missingFields = REQUIRED_OCR_FIELDS.filter((f) => !fields[f]);
        const found = REQUIRED_OCR_FIELDS.length - missingFields.length;
        const status = found === 0 ? 'NO_RESULTS' : missingFields.length === 0 ? 'SUCCESS' : 'PARTIAL';
        const message = status === 'SUCCESS'
          ? 'Leímos los datos del documento. Revísalos antes de continuar.'
          : status === 'PARTIAL'
            ? `Leímos parte de los datos. Completa: ${missingFields.map((f) => FIELD_LABELS[f]).join(', ')}.`
            : 'No logramos leer el documento (puede estar borroso, con reflejos o cortado). Puedes repetir las fotos, digitar los datos o pasar a revisión manual.';
        result = { enabled, provider, notice: this.deps.ocr.notice, status, fields, missingFields, attempts,
          message: this.deps.ocr.notice ? `${message} (${this.deps.ocr.notice})` : message };
      } catch (err) {
        logger.warn('ocr.failed', { sessionId: s.id, error: (err as Error).message });
        result = { enabled, provider, notice: `Fallo del proveedor ${provider}: ${(err as Error).message}`, status: 'FAILED',
          fields: {}, missingFields: [...REQUIRED_OCR_FIELDS], attempts,
          message: 'El servicio de lectura no respondió. Tus datos están guardados: reintenta, digita los datos o pasa a revisión manual.' };
      }
    }

    s.ocr = result;
    s.status = 'OCR_PROCESSED';
    this.log(s, 'OCR', `Intento ${attempts} con ${provider}: ${result.status}. Campos leídos: ${Object.keys(result.fields).length}.`,
      result.status === 'SUCCESS' || result.status === 'SKIPPED' ? 'INFO' : 'WARN');
    this.deps.repo.save(s);
    return result;
  }

  confirm(id: string, data: Omit<ConfirmedData, 'correctedFields'>): OnboardingSession {
    const s = this.get(id);
    if (!s.documents.front || !s.documents.back) throw new AppError(409, 'DOCUMENTS_REQUIRED', 'Primero carga el frente y el reverso de la cédula.');
    const ocrFields = s.ocr?.fields ?? {};
    // Un campo cuenta como "corregido" si el usuario cambió lo que leyó el OCR
    // (se ignoran tildes, mayúsculas, puntos y espacios).
    const sameValue = (a: string, b: string) => normalizeName(a) === normalizeName(b) && digitsOnly(a) === digitsOnly(b);
    const correctedFields = (Object.keys(ocrFields) as (keyof OcrFields)[]).filter((k) => {
      const value = (data as Partial<Record<keyof OcrFields, string>>)[k];
      return value !== undefined && !sameValue(value, ocrFields[k] ?? '');
    });
    s.confirmed = { ...data, correctedFields };
    s.status = 'CONFIRMED';
    this.deps.vault.delete(s.id); // minimización: ya no necesitamos las fotos
    this.log(s, 'CONFIRMACION', correctedFields.length
      ? `Datos confirmados con correcciones en: ${correctedFields.map((f) => FIELD_LABELS[f]).join(', ')}.`
      : 'Datos confirmados sin correcciones. Fotos eliminadas de memoria.');
    this.deps.repo.save(s);
    return s;
  }

  requestManualReview(id: string, reason: string): OnboardingSession {
    const s = this.get(id);
    s.manualReview = { requested: true, reason, at: new Date().toISOString() };
    this.log(s, 'REVISION', `Revisión manual solicitada: ${reason}`, 'WARN');
    if (s.result) this.finalize(s); // si ya había resultado, se recalcula con la nueva alerta
    this.deps.repo.save(s);
    return s;
  }

  async verify(id: string): Promise<OnboardingSession> {
    const s = this.get(id);
    if (!s.confirmed) throw new AppError(409, 'NOT_CONFIRMED', 'Confirma los datos del documento antes de consultar.');
    const queries = await this.deps.kyc.runAll(s.registration, s.confirmed);
    s.queries = queries;
    for (const q of queries) {
      this.log(s, 'CONSULTAS', `${q.label} (${q.provider}): ${q.status} en ${q.durationMs} ms, ${q.attempts} intento(s). ${q.detail}`,
        q.status === 'OK' ? 'INFO' : q.status === 'ALERT' ? 'WARN' : 'ERROR');
    }
    this.finalize(s);
    this.deps.repo.save(s);
    return s;
  }

  private finalize(s: OnboardingSession) {
    s.result = computeScore(s);
    s.status = 'COMPLETED';
    s.completedAt = s.completedAt ?? new Date().toISOString();
    this.log(s, 'RESULTADO', `${DECISION_LABEL[s.result.decision]} con score ${s.result.score}/100 y ${s.result.alerts.length} alerta(s).`);
    logger.info('onboarding.completed', { sessionId: s.id, decision: s.result.decision, score: s.result.score });
  }

  metrics() {
    const all = this.deps.repo.list();
    const done = all.filter((s) => s.result);
    const count = (d: string) => done.filter((s) => s.result!.decision === d).length;
    const queries = all.flatMap((s) => s.queries);
    const durations = done.filter((s) => s.completedAt).map((s) => (Date.parse(s.completedAt!) - Date.parse(s.createdAt)) / 1000);
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
    return {
      generatedAt: new Date().toISOString(),
      registrations: all.length,
      completed: done.length,
      validated: count('VALIDATED'),
      requiresReview: count('REQUIRES_REVIEW'),
      notValidated: count('NOT_VALIDATED'),
      manualReviews: all.filter((s) => s.manualReview?.requested).length,
      ocrAttempts: all.reduce((n, s) => n + (s.ocr?.attempts ?? 0), 0),
      ocrFailures: all.filter((s) => s.ocr && ['FAILED', 'NO_RESULTS'].includes(s.ocr.status)).length,
      queries: queries.length,
      queryErrors: queries.filter((q) => q.status === 'ERROR' || q.status === 'TIMEOUT').length,
      averageScore: avg(done.map((s) => s.result!.score)),
      averageDurationSeconds: avg(durations),
    };
  }
}
