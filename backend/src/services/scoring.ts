import type { Alert, Decision, OnboardingSession, ScoreFactor, ScoreResult } from '../domain/types';
import { ageFromIsoDate, digitsOnly, nameCoverage } from '../domain/text';
import { REQUIRED_OCR_FIELDS } from './ocr/cedulaParser';

/**
 * MOTOR DE SCORE (función pura: misma entrada → misma salida).
 *
 * 1) Se suman puntos por 7 factores (total 100). Cada factor explica su razón.
 * 2) Se generan alertas con severidad.
 * 3) Reglas de decisión:
 *    - Alguna alerta CRITICAL → NO VALIDADO (el score se limita a 30).
 *    - Alguna alerta HIGH     → como máximo REQUIERE REVISIÓN (score ≤ 79).
 *    - Si no: ≥ 80 VALIDADO · 50–79 REQUIERE REVISIÓN · < 50 NO VALIDADO.
 */

export const THRESHOLDS = { validated: 80, review: 50 } as const;

export function computeScore(session: OnboardingSession, now: Date = new Date()): ScoreResult {
  const factors: ScoreFactor[] = [];
  const alerts: Alert[] = [];
  const { registration: reg, documents, ocr, confirmed, queries } = session;
  const add = (key: string, label: string, points: number, max: number, reason: string) =>
    factors.push({ key, label, points: Math.max(0, Math.min(max, Math.round(points))), max, reason });

  // A. Completitud (15)
  const confirmedFilled = confirmed
    ? REQUIRED_OCR_FIELDS.filter((f) => Boolean((confirmed as unknown as Record<string, unknown>)[f])).length
    : 0;
  const completeness = 5 + (10 * confirmedFilled) / REQUIRED_OCR_FIELDS.length;
  add('completeness', 'Completitud de datos', completeness, 15,
    `Registro completo; ${confirmedFilled}/${REQUIRED_OCR_FIELDS.length} datos del documento confirmados.`);

  // B. Calidad de las imágenes (10)
  const sides = [documents.front, documents.back].filter(Boolean);
  const warnings = sides.flatMap((s) => s!.qualityWarnings);
  add('documentQuality', 'Calidad del documento', sides.length * 3 + Math.max(0, 4 - warnings.length * 2), 10,
    `${sides.length}/2 caras cargadas${warnings.length ? `; advertencias: ${warnings.join(', ')}` : '; sin advertencias de calidad'}.`);
  if (warnings.length) alerts.push({ code: 'IMAGE_QUALITY', severity: 'LOW', message: 'Las imágenes tienen advertencias de calidad.' });

  // C. Lectura OCR (15)
  const ocrOk = ocr?.status === 'SUCCESS' || ocr?.status === 'PARTIAL';
  const corrected = confirmed?.correctedFields ?? [];
  if (ocrOk) {
    const base = ocr!.status === 'SUCCESS' ? 15 : 8;
    add('ocr', 'Lectura automática (OCR)', base - corrected.length * 2, 15,
      `OCR ${ocr!.status === 'SUCCESS' ? 'completo' : 'parcial'}; ${corrected.length} campo(s) corregidos por el usuario.`);
    if (corrected.length) {
      alerts.push({ code: 'OCR_CORRECTIONS', severity: corrected.includes('documentNumber') ? 'MEDIUM' : 'LOW',
        message: `El usuario corrigió: ${corrected.join(', ')}.` });
    }
  } else {
    const why = ocr?.status === 'SKIPPED' ? 'OCR desactivado' : ocr ? `OCR sin resultado (${ocr.status})` : 'OCR no ejecutado';
    add('ocr', 'Lectura automática (OCR)', 0, 15, `${why}: los datos no se pudieron contrastar con el documento.`);
    alerts.push({ code: 'OCR_UNAVAILABLE', severity: 'HIGH', message: `${why}; se requiere verificación humana del documento.` });
  }

  // D. Coherencia registro vs. documento confirmado (15)
  if (confirmed) {
    const numberOk = digitsOnly(confirmed.documentNumber) === digitsOnly(reg.documentNumber);
    const coverage = nameCoverage(reg.fullName, `${confirmed.firstNames} ${confirmed.lastNames}`);
    const age = ageFromIsoDate(confirmed.birthDate, now);
    const adult = age !== null && age >= 18;
    add('consistency', 'Coherencia registro vs. documento', (numberOk ? 7 : 0) + 6 * coverage + (adult ? 2 : 0), 15,
      `Número ${numberOk ? 'coincide' : 'NO coincide'}; ${Math.round(coverage * 100)}% del nombre registrado está en el documento; ` +
        `${age === null ? 'edad no determinable' : `${age} años`}.`);
    if (!numberOk) alerts.push({ code: 'DOC_NUMBER_MISMATCH', severity: 'HIGH', message: 'El número del documento no coincide con el registrado.' });
    if (coverage < 0.5) alerts.push({ code: 'NAME_MISMATCH', severity: 'HIGH', message: 'El nombre registrado no corresponde al del documento.' });
    else if (coverage < 1) alerts.push({ code: 'NAME_PARTIAL_MATCH', severity: 'MEDIUM', message: 'El nombre registrado coincide solo parcialmente con el documento.' });
    if (age !== null && age < 18) alerts.push({ code: 'UNDERAGE', severity: 'CRITICAL', message: 'El titular es menor de edad.' });
  } else {
    add('consistency', 'Coherencia registro vs. documento', 0, 15, 'No hay datos confirmados del documento.');
  }

  // E. Registro de identidad (30)
  const identity = queries.find((q) => q.name === 'IDENTITY_REGISTRY');
  if (identity?.status === 'OK') {
    add('identity', identity.label, 30, 30, identity.detail);
  } else if (identity?.status === 'ALERT') {
    const d = identity.data as { documentStatus?: string; matches?: Record<string, boolean> } | undefined;
    const m = d?.matches ?? {};
    const pts = 10 + (m.firstNames ? 6 : 0) + (m.lastNames ? 7 : 0) + (m.birthDate ? 7 : 0);
    const cancelled = d?.documentStatus === 'CANCELADA';
    add('identity', identity.label, cancelled ? 0 : pts, 30, identity.detail);
    alerts.push(cancelled
      ? { code: 'DOCUMENT_CANCELLED', severity: 'CRITICAL', message: 'El documento aparece cancelado en el registro.' }
      : { code: 'IDENTITY_MISMATCH', severity: 'HIGH', message: 'Los datos no coinciden con el registro de identidad.' });
  } else {
    add('identity', 'Registro de identidad', 0, 30, identity?.detail ?? 'Consulta no realizada.');
    alerts.push(identity?.status === 'NOT_FOUND'
      ? { code: 'IDENTITY_NOT_FOUND', severity: 'HIGH', message: 'El documento no se encontró en el registro de identidad.' }
      : { code: 'KYC_SERVICE_UNAVAILABLE', severity: 'HIGH', message: 'No se pudo completar la consulta de identidad (servicio no disponible).' });
  }

  // F. Listas restrictivas (10)
  const lists = queries.find((q) => q.name === 'WATCHLISTS');
  add('watchlists', 'Listas restrictivas', lists?.status === 'OK' ? 10 : 0, 10, lists?.detail ?? 'Consulta no realizada.');
  if (lists?.status === 'ALERT') alerts.push({ code: 'WATCHLIST_HIT', severity: 'CRITICAL', message: lists.detail });
  else if (lists?.status !== 'OK') alerts.push({ code: 'WATCHLIST_UNAVAILABLE', severity: 'HIGH', message: 'No se pudo consultar listas restrictivas.' });

  // G. Contacto (5)
  const contact = queries.find((q) => q.name === 'CONTACT_CHECK');
  add('contact', 'Datos de contacto', contact?.status === 'OK' ? 5 : 2, 5, contact?.detail ?? 'Sin verificar.');
  if (contact?.status === 'ALERT') alerts.push({ code: 'DISPOSABLE_EMAIL', severity: 'MEDIUM', message: contact.detail });

  if (session.manualReview?.requested) {
    alerts.push({ code: 'MANUAL_REVIEW_REQUESTED', severity: 'HIGH', message: `Revisión manual solicitada: ${session.manualReview.reason}` });
  }

  // Consolidación
  const rawScore = factors.reduce((sum, f) => sum + f.points, 0);
  const hasCritical = alerts.some((a) => a.severity === 'CRITICAL');
  const hasHigh = alerts.some((a) => a.severity === 'HIGH');
  let score = rawScore;
  let cappedBy: string | undefined;
  if (hasCritical && rawScore > 30) {
    score = 30;
    cappedBy = 'una alerta CRÍTICA (máximo 30)';
  } else if (!hasCritical && hasHigh && rawScore > THRESHOLDS.validated - 1) {
    score = THRESHOLDS.validated - 1;
    cappedBy = `una alerta ALTA (máximo ${THRESHOLDS.validated - 1})`;
  }

  let decision: Decision;
  if (hasCritical || score < THRESHOLDS.review) decision = 'NOT_VALIDATED';
  else if (score < THRESHOLDS.validated) decision = 'REQUIRES_REVIEW';
  else decision = 'VALIDATED';

  return { score, rawScore, cappedBy, decision, factors, alerts, summary: buildSummary(alerts), computedAt: now.toISOString() };
}

export const DECISION_LABEL: Record<Decision, string> = {
  VALIDATED: 'Validado',
  REQUIRES_REVIEW: 'Requiere revisión',
  NOT_VALIDATED: 'No validado',
};

/** Regla de decisión en palabras, para mostrarla en la app y en el informe. */
export const DECISION_RULES = [
  `Score de ${THRESHOLDS.validated} o más: Validado.`,
  `Score ${THRESHOLDS.review}–${THRESHOLDS.validated - 1}: Requiere revisión manual.`,
  `Score menor a ${THRESHOLDS.review}: No validado.`,
  'Una alerta CRÍTICA (listas restrictivas, documento cancelado, menor de edad) deja el caso en No validado (score máx. 30).',
  `Una alerta ALTA (servicio sin respuesta, datos que no coinciden, sin OCR, revisión solicitada) deja el caso como máximo en Requiere revisión (score máx. ${THRESHOLDS.validated - 1}).`,
];

/** Resumen corto (la etiqueta y el score se muestran aparte, para no repetirlos). */
function buildSummary(alerts: Alert[]): string {
  const relevant = alerts.filter((a) => a.severity !== 'LOW');
  const minor = alerts.length - relevant.length;
  if (relevant.length === 0) {
    return minor ? `Sin inconsistencias relevantes (${minor} observación/es menor/es).` : 'Sin inconsistencias relevantes.';
  }
  const top = relevant.find((a) => a.severity === 'CRITICAL') ?? relevant.find((a) => a.severity === 'HIGH') ?? relevant[0];
  return `${relevant.length} alerta(s) relevante(s). Principal: ${top.message}`;
}
