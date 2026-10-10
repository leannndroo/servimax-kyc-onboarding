/**
 * Modelo de dominio del onboarding KYC.
 * Una "sesión" representa el recorrido completo de un tendero:
 * registro → documentos → OCR → confirmación → consultas → resultado.
 */

export type DocumentType = 'CC' | 'CE';

export interface Registration {
  fullName: string;
  documentType: DocumentType;
  documentNumber: string;
  phone: string;
  email: string;
  city: string;
}

/** Solo guardamos metadatos de la imagen, nunca la imagen en disco. */
export interface ImageMeta {
  side: 'front' | 'back';
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  qualityWarnings: string[];
}

export type OcrStatus = 'SUCCESS' | 'PARTIAL' | 'NO_RESULTS' | 'FAILED' | 'SKIPPED';

export interface OcrFields {
  firstNames?: string;
  lastNames?: string;
  documentNumber?: string;
  birthDate?: string; // ISO yyyy-mm-dd
  birthPlace?: string;
  issueDate?: string; // ISO yyyy-mm-dd
  issuePlace?: string;
}

export interface OcrResult {
  enabled: boolean;
  provider: string;
  /** Explica cómo se obtuvo la lectura (mock por falta de API key, fallo del proveedor...). */
  notice?: string;
  status: OcrStatus;
  fields: OcrFields;
  missingFields: (keyof OcrFields)[];
  attempts: number;
  message: string;
}

export interface ConfirmedData {
  firstNames: string;
  lastNames: string;
  documentNumber: string;
  birthDate: string;
  issuePlace: string;
  issueDate?: string;
  /** Campos que el usuario cambió respecto a lo leído por OCR. */
  correctedFields: (keyof OcrFields)[];
}

export type QueryStatus = 'OK' | 'ALERT' | 'NOT_FOUND' | 'ERROR' | 'TIMEOUT';

export interface QueryResult {
  name: 'IDENTITY_REGISTRY' | 'WATCHLISTS' | 'CONTACT_CHECK';
  label: string;
  provider: string;
  status: QueryStatus;
  durationMs: number;
  attempts: number;
  detail: string;
  data?: Record<string, unknown>;
}

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Alert {
  code: string;
  severity: AlertSeverity;
  message: string;
}

export type Decision = 'VALIDATED' | 'REQUIRES_REVIEW' | 'NOT_VALIDATED';

export interface ScoreFactor {
  key: string;
  label: string;
  points: number;
  max: number;
  reason: string;
}

export interface ScoreResult {
  score: number;
  /** Suma de puntos de los factores antes de aplicar los límites por alertas. */
  rawScore: number;
  /** Explica por qué el score final es menor que la suma, si aplica. */
  cappedBy?: string;
  decision: Decision;
  factors: ScoreFactor[];
  alerts: Alert[];
  summary: string;
  computedAt: string;
}

export type SessionStatus =
  | 'REGISTERED'
  | 'DOCUMENTS_UPLOADED'
  | 'OCR_PROCESSED'
  | 'CONFIRMED'
  | 'COMPLETED';

export interface LogEntry {
  at: string;
  step: 'REGISTRO' | 'CAPTURA' | 'OCR' | 'CONFIRMACION' | 'CONSULTAS' | 'RESULTADO' | 'REVISION' | 'INFORME';
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

export interface OnboardingSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  status: SessionStatus;
  registration: Registration;
  documents: { front?: ImageMeta; back?: ImageMeta };
  ocr?: OcrResult;
  confirmed?: ConfirmedData;
  manualReview?: { requested: boolean; reason: string; at: string };
  queries: QueryResult[];
  result?: ScoreResult;
  log: LogEntry[];
}
