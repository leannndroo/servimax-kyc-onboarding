import type { Registration } from '../../domain/types';
import { withTimeout } from '../../utils/errors';

/**
 * El OCR está DESACOPLADO detrás de esta interfaz. Cambiar OCR.space por
 * Google Vision, AWS Textract o Tesseract solo requiere otra implementación;
 * el resto del backend no cambia.
 */
export interface OcrProvider {
  readonly name: string;
  /** Aviso para la auditoría, ej. por qué se está usando el mock en lugar del OCR real. */
  readonly notice?: string;
  extractText(image: Buffer, mimeType: string, hint: OcrHint): Promise<string>;
}

/** Contexto opcional. Solo lo usa el mock para simular una lectura realista. */
export interface OcrHint {
  side: 'front' | 'back';
  registration: Registration;
}

export class OcrProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrProviderError';
  }
}

/** Integración real con OCR.space (https://ocr.space/ocrapi). La API key vive en el backend. */
export class OcrSpaceProvider implements OcrProvider {
  readonly name = 'OCR.space';

  constructor(private readonly apiKey: string, private readonly url: string, private readonly timeoutMs: number) {}

  async extractText(image: Buffer, mimeType: string): Promise<string> {
    const form = new FormData();
    form.append('base64Image', `data:${mimeType};base64,${image.toString('base64')}`);
    form.append('language', 'spa');
    form.append('OCREngine', '2');
    form.append('scale', 'true');
    form.append('detectOrientation', 'true');

    const body = await withTimeout(async (signal) => {
      const res = await fetch(this.url, { method: 'POST', headers: { apikey: this.apiKey }, body: form, signal });
      if (!res.ok) throw new OcrProviderError(`El servicio OCR respondió HTTP ${res.status}`);
      return (await res.json()) as {
        IsErroredOnProcessing?: boolean;
        ErrorMessage?: string | string[];
        ParsedResults?: { ParsedText?: string }[];
      };
    }, this.timeoutMs);

    if (body.IsErroredOnProcessing) {
      const msg = Array.isArray(body.ErrorMessage) ? body.ErrorMessage.join(' ') : body.ErrorMessage;
      throw new OcrProviderError(msg || 'El servicio OCR no pudo procesar la imagen');
    }
    if (!Array.isArray(body.ParsedResults)) throw new OcrProviderError('Respuesta inesperada del servicio OCR');
    return body.ParsedResults.map((r) => r.ParsedText ?? '').join('\n');
  }
}

/**
 * OCR SIMULADO (documentado en el README). Genera el texto que tendría una
 * cédula amarilla con los datos del registro, para poder demostrar el flujo
 * sin API key. Escenarios por el ÚLTIMO dígito del documento:
 *   6 → el OCR no encuentra texto (NO_RESULTS)
 *   7 → el OCR lee mal un dígito del número (inconsistencia a corregir)
 */
export class MockOcrProvider implements OcrProvider {
  readonly name = 'OCR simulado (mock)';

  constructor(readonly notice = 'OCR simulado: los datos leídos se generan a partir del registro.') {}

  async extractText(_image: Buffer, _mime: string, hint: OcrHint): Promise<string> {
    await new Promise((r) => setTimeout(r, 600));
    const { registration: reg, side } = hint;
    const last = reg.documentNumber.slice(-1);
    if (last === '6') return '';

    const words = reg.fullName.toUpperCase().split(/\s+/);
    const half = words.length >= 4 ? 2 : 1; // en Colombia: 1-2 nombres + 2 apellidos
    const firstNames = words.slice(0, half).join(' ');
    const lastNames = words.slice(half).join(' ') || words[0];
    let number = reg.documentNumber;
    if (last === '7') number = number.slice(0, 2) + ((Number(number[2]) + 1) % 10) + number.slice(3);
    const dotted = number.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

    if (side === 'front') {
      return ['REPUBLICA DE COLOMBIA', 'IDENTIFICACION PERSONAL', 'CEDULA DE CIUDADANIA',
        `NUMERO ${dotted}`, lastNames, 'APELLIDOS', firstNames, 'NOMBRES', 'FIRMA'].join('\n');
    }
    return ['FECHA DE NACIMIENTO 15-MAR-1990', 'BOGOTA D.C.', '(CUNDINAMARCA)', 'LUGAR DE NACIMIENTO',
      '1.68 O+ M', 'ESTATURA G.S. RH SEXO', `22-MAR-2008 ${reg.city.toUpperCase()}`,
      'FECHA Y LUGAR DE EXPEDICION'].join('\n');
  }
}
