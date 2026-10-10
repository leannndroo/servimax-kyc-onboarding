import { File } from 'expo-file-system';
import type { CapturedImage, Confirmation, Metrics, OcrResult, Registration, Session } from '../types';
import { request, requestBinary } from './client';

/** Un endpoint del backend por función. Las pantallas no construyen URLs. */

export const createSession = (registration: Registration) =>
  request<Session>('/api/v1/onboarding', { method: 'POST', json: registration });

export const getSession = (id: string) => request<Session>(`/api/v1/onboarding/${id}`);

export function uploadDocuments(id: string, front: CapturedImage, back: CapturedImage) {
  const form = new FormData();
  // En Expo SDK 55+ las fotos se adjuntan como File de expo-file-system.
  form.append('front', new File(front.uri) as unknown as Blob);
  form.append('back', new File(back.uri) as unknown as Blob);
  return request<{ documents: Session['documents'] }>(`/api/v1/onboarding/${id}/documents`, {
    method: 'POST',
    form,
    timeoutMs: 45000,
  });
}
export const runOcr = (id: string, useOcr: boolean) =>
  request<OcrResult>(`/api/v1/onboarding/${id}/ocr`, { method: 'POST', json: { useOcr }, timeoutMs: 60000 });

export const confirmData = (id: string, data: Confirmation) =>
  request<Session>(`/api/v1/onboarding/${id}/confirmation`, { method: 'PUT', json: data });

export const requestManualReview = (id: string, reason: string) =>
  request<Session>(`/api/v1/onboarding/${id}/manual-review`, { method: 'POST', json: { reason } });

export const verify = (id: string) =>
  request<Session>(`/api/v1/onboarding/${id}/verification`, { method: 'POST', timeoutMs: 40000 });

export const getMetrics = () => request<Metrics>('/api/v1/metrics');

export const downloadReport = (id: string, format: 'pdf' | 'json' | 'csv') =>
  requestBinary(`/api/v1/onboarding/${id}/report?format=${format}`);
