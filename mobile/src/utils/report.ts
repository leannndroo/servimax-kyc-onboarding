import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { downloadReport } from '../api/onboarding';

export type ReportFormat = 'pdf' | 'json' | 'csv';

const MIME: Record<ReportFormat, string> = { pdf: 'application/pdf', json: 'application/json', csv: 'text/csv' };

/**
 * Descarga el informe del backend, lo guarda en la caché de la app y abre
 * el menú de compartir (guardar en archivos, WhatsApp, correo...).
 * Si algo falla se lanza el error para que la pantalla lo explique.
 */
export async function downloadAndShareReport(sessionId: string, format: ReportFormat): Promise<void> {
  const bytes = await downloadReport(sessionId, format);
  const file = new File(Paths.cache, `informe-kyc-${sessionId.slice(0, 8)}.${format}`);
  if (file.exists) file.delete();
  file.create();
  file.write(new Uint8Array(bytes));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('SHARING_UNAVAILABLE');
  }
  await Sharing.shareAsync(file.uri, { mimeType: MIME[format], dialogTitle: 'Informe de validación KYC' });
}
