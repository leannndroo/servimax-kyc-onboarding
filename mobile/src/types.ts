/** Tipos compartidos con el backend (contrato de la API). */

export type DocumentType = 'CC' | 'CE';

export interface Registration {
  fullName: string;
  documentType: DocumentType;
  documentNumber: string;
  phone: string;
  email: string;
  city: string;
}

export interface OcrFields {
  firstNames?: string;
  lastNames?: string;
  documentNumber?: string;
  birthDate?: string;
  birthPlace?: string;
  issueDate?: string;
  issuePlace?: string;
}

export type OcrStatus = 'SUCCESS' | 'PARTIAL' | 'NO_RESULTS' | 'FAILED' | 'SKIPPED';

export interface OcrResult {
  enabled: boolean;
  provider: string;
  status: OcrStatus;
  fields: OcrFields;
  missingFields: (keyof OcrFields)[];
  attempts: number;
  message: string;
}

export interface Confirmation {
  firstNames: string;
  lastNames: string;
  documentNumber: string;
  birthDate: string;
  issuePlace: string;
  issueDate?: string;
}

export interface QueryResult {
  name: string;
  label: string;
  provider: string;
  status: 'OK' | 'ALERT' | 'NOT_FOUND' | 'ERROR' | 'TIMEOUT';
  durationMs: number;
  attempts: number;
  detail: string;
}

export interface Alert {
  code: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
}

export type Decision = 'VALIDATED' | 'REQUIRES_REVIEW' | 'NOT_VALIDATED';

export interface ScoreResult {
  score: number;
  rawScore?: number;
  cappedBy?: string;
  decision: Decision;
  factors: { key: string; label: string; points: number; max: number; reason: string }[];
  alerts: Alert[];
  summary: string;
  computedAt: string;
}

export interface LogEntry {
  at: string;
  step: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
}

export interface Session {
  id: string;
  createdAt: string;
  status: string;
  registration: Registration;
  documents: { front?: { width: number; height: number; qualityWarnings: string[] }; back?: { width: number; height: number; qualityWarnings: string[] } };
  ocr?: OcrResult;
  confirmed?: Confirmation & { correctedFields: string[] };
  manualReview?: { requested: boolean; reason: string };
  queries: QueryResult[];
  result?: ScoreResult;
  log: LogEntry[];
}

export interface CapturedImage {
  uri: string;
  width: number;
  height: number;
}

export type Metrics = Record<string, number | string>;
