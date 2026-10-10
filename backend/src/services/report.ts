import PDFDocument from 'pdfkit';
import type { OcrFields, OnboardingSession } from '../domain/types';
import { mask } from '../domain/text';
import { DECISION_LABEL, DECISION_RULES } from './scoring';

/**
 * Informe descargable en JSON, CSV o PDF. Todos se construyen desde el
 * mismo objeto (buildReport) para que los tres formatos digan lo mismo.
 * Los datos de contacto y el número de documento salen ENMASCARADOS.
 *
 * Fechas: los campos ISO (…Z) están en UTC, que es el estándar para datos;
 * los campos "…Local" y el PDF muestran la hora de Colombia (America/Bogota).
 */

export const REPORT_TIMEZONE = 'America/Bogota';

/** "2026-10-10T20:45:00Z" → "10/10/2026, 15:45:00 (hora Colombia)". */
export function toLocalTime(iso: string | undefined): string {
  if (!iso) return '—';
  const text = new Intl.DateTimeFormat('es-CO', {
    timeZone: REPORT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(iso)).replace(/[\u00a0\u202f]/g, ' '); // espacios especiales que el PDF no dibuja
  return `${text} (hora Colombia)`;
}

const FIELD_LABELS: [keyof OcrFields, string][] = [
  ['firstNames', 'Nombres'], ['lastNames', 'Apellidos'], ['documentNumber', 'Número'],
  ['birthDate', 'Fecha de nacimiento'], ['issuePlace', 'Lugar de expedición'], ['issueDate', 'Fecha de expedición'],
];

export function buildReport(s: OnboardingSession, metrics?: Record<string, unknown>) {
  if (!s.result) throw new Error('La sesión aún no tiene resultado');
  const c = s.confirmed;
  const now = new Date().toISOString();
  const durationSeconds = s.completedAt ? Math.round((Date.parse(s.completedAt) - Date.parse(s.createdAt)) / 1000) : null;
  const hide = (key: keyof OcrFields, v?: string) => (v && key === 'documentNumber' ? mask(v) : v);

  return {
    reportVersion: '1.1',
    timezone: `${REPORT_TIMEZONE} (UTC-5). Campos ISO en UTC.`,
    generatedAt: now,
    generatedAtLocal: toLocalTime(now),
    session: {
      id: s.id, createdAt: s.createdAt, createdAtLocal: toLocalTime(s.createdAt),
      completedAt: s.completedAt, completedAtLocal: toLocalTime(s.completedAt), durationSeconds,
    },
    applicant: {
      fullName: s.registration.fullName,
      documentType: s.registration.documentType,
      documentNumber: mask(s.registration.documentNumber),
      phone: mask(s.registration.phone),
      email: s.registration.email.replace(/^(.).*(@.*)$/, '$1***$2'),
      city: s.registration.city,
    },
    documents: { front: s.documents.front, back: s.documents.back, imagesStored: false },
    ocr: s.ocr && {
      provider: s.ocr.provider, notice: s.ocr.notice, enabled: s.ocr.enabled, status: s.ocr.status, attempts: s.ocr.attempts,
    },
    /** Comparación campo a campo: lo que leyó el OCR vs. lo que confirmó el usuario. */
    fields: FIELD_LABELS.map(([key, label]) => ({
      field: label,
      ocr: hide(key, s.ocr?.fields[key]) ?? null,
      confirmed: hide(key, c?.[key as keyof typeof c] as string | undefined) ?? null,
      corrected: Boolean(c?.correctedFields.includes(key)),
    })),
    manualReview: s.manualReview,
    queries: s.queries.map(({ data: _data, ...q }) => q),
    alerts: s.result.alerts,
    result: {
      decision: s.result.decision, decisionLabel: DECISION_LABEL[s.result.decision], score: s.result.score,
      rawScore: s.result.rawScore, cappedBy: s.result.cappedBy,
      summary: s.result.summary, decisionRules: DECISION_RULES, factors: s.result.factors,
    },
    decisionLog: s.log.map((l) => ({ ...l, atLocal: toLocalTime(l.at) })),
    metrics,
  };
}

const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export function toCsv(report: ReturnType<typeof buildReport>): string {
  const rows: unknown[][] = [['seccion', 'campo', 'valor']];
  const push = (section: string, obj: Record<string, unknown> | undefined) =>
    Object.entries(obj ?? {}).forEach(([k, v]) => rows.push([section, k, typeof v === 'object' ? JSON.stringify(v) : v]));
  push('informe', { generatedAtLocal: report.generatedAtLocal, generatedAt: report.generatedAt, timezone: report.timezone, reportVersion: report.reportVersion });
  push('sesion', report.session);
  push('solicitante', report.applicant);
  push('ocr', report.ocr ?? undefined);
  report.fields.forEach((f) => rows.push(['datos_documento', f.field, `OCR: ${f.ocr ?? '—'} | Confirmado: ${f.confirmed ?? '—'}${f.corrected ? ' | CORREGIDO' : ''}`]));
  report.queries.forEach((q) => rows.push(['consulta', q.label, `${q.status} | ${q.durationMs} ms | ${q.detail}`]));
  report.alerts.forEach((a) => rows.push(['alerta', a.code, `${a.severity} | ${a.message}`]));
  report.result.factors.forEach((f) => rows.push(['factor', f.label, `${f.points}/${f.max} | ${f.reason}`]));
  report.result.decisionRules.forEach((r, i) => rows.push(['regla_decision', `regla_${i + 1}`, r]));
  rows.push(['resultado', 'decision', report.result.decisionLabel], ['resultado', 'score', report.result.score],
    ['resultado', 'puntos_sumados', report.result.rawScore], ['resultado', 'limitado_por', report.result.cappedBy ?? 'sin límite'],
    ['resultado', 'resumen', report.result.summary]);
  report.decisionLog.forEach((l) => rows.push(['bitacora', `${l.atLocal} ${l.step}`, `${l.level} | ${l.message}`]));
  push('metricas', report.metrics);
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n'); // BOM: Excel abre bien las tildes
}

export function toPdf(report: ReturnType<typeof buildReport>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48, info: { Title: 'Informe de validación KYC' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const h = (t: string) => doc.moveDown(0.8).font('Helvetica-Bold').fontSize(12).fillColor('#0f2a44').text(t).moveDown(0.3);
    const line = (label: string, value: unknown) =>
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#333').text(`${label}: `, { continued: true })
        .font('Helvetica').text(String(value ?? '—'));
    const small = (t: string) => doc.font('Helvetica').fontSize(9).fillColor('#555').text(t);

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#0f2a44').text('Informe de validación KYC · Onboarding de tenderos');
    small(`Generado: ${report.generatedAtLocal} · Sesión: ${report.session.id}`);

    const color = { VALIDATED: '#1b7f3b', REQUIRES_REVIEW: '#b26a00', NOT_VALIDATED: '#b3261e' }[report.result.decision];
    doc.moveDown().font('Helvetica-Bold').fontSize(16).fillColor(color)
      .text(`${report.result.decisionLabel} · ${report.result.score}/100`);
    doc.font('Helvetica').fontSize(10).fillColor('#333').text(report.result.summary);

    h('Regla de decisión');
    report.result.decisionRules.forEach((r) => small(`• ${r}`));

    h('Solicitante');
    line('Nombre', report.applicant.fullName);
    line('Documento', `${report.applicant.documentType} ${report.applicant.documentNumber}`);
    line('Celular', report.applicant.phone);
    line('Correo', report.applicant.email);
    line('Ciudad', report.applicant.city);
    line('Inicio', report.session.createdAtLocal);
    line('Fin', `${report.session.completedAtLocal} · duración ${report.session.durationSeconds ?? '—'} s`);

    h('Documento y OCR');
    line('Proveedor OCR', report.ocr?.provider);
    if (report.ocr?.notice) line('Nota', report.ocr.notice);
    line('Estado OCR', `${report.ocr?.status} (${report.ocr?.attempts} intento/s)`);
    doc.moveDown(0.3);
    const x = doc.x;
    const cols = [x, x + 130, x + 290];
    const widths = [125, 155, 220];
    const row = (cells: string[], bold = false) => {
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#333');
      const height = Math.max(...cells.map((t, i) => doc.heightOfString(t, { width: widths[i] })));
      cells.forEach((t, i) => doc.text(t, cols[i], y, { width: widths[i] }));
      doc.x = x;
      doc.y = y + height + 3;
    };
    row(['Campo', 'Leído por OCR', 'Confirmado por el usuario'], true);
    report.fields.forEach((f) => row([f.field, f.ocr ?? '—', `${f.confirmed ?? '—'}${f.corrected ? '  (corregido)' : ''}`]));

    h('Consultas');
    report.queries.forEach((q) => line(q.label, `${q.status} · ${q.durationMs} ms · ${q.attempts} intento/s · ${q.detail}`));
    h('Factores del score');
    report.result.factors.forEach((f) => line(`${f.label} (${f.points}/${f.max})`, f.reason));
    doc.moveDown(0.3);
    line('Puntos sumados', report.result.cappedBy
      ? `${report.result.rawScore}/100, limitado a ${report.result.score} por ${report.result.cappedBy}.`
      : `${report.result.rawScore}/100 = score final.`);
    h(`Alertas (${report.alerts.length})`);
    if (report.alerts.length === 0) small('Sin alertas.');
    report.alerts.forEach((a) => line(`[${a.severity}] ${a.code}`, a.message));
    h('Bitácora de decisión (hora Colombia)');
    report.decisionLog.forEach((l) => line(`${l.atLocal.replace(' (hora Colombia)', '').split(', ')[1] ?? l.at} · ${l.step}`, l.message));
    doc.end();
  });
}
