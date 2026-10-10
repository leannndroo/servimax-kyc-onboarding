import type { OcrFields } from '../../domain/types';

/**
 * Convierte el texto plano que devuelve un OCR en campos de la cédula colombiana.
 *
 * Soporta los dos formatos más comunes:
 *  - Cédula amarilla (hologramas): la etiqueta va DEBAJO del valor
 *      "PEREZ GOMEZ" / "APELLIDOS" / "JUAN CARLOS" / "NOMBRES"
 *  - Cédula digital (2020+): la etiqueta va ENCIMA del valor
 *      "Apellidos / Surnames" / "PÉREZ GÓMEZ"
 *
 * El OCR nunca es perfecto, por eso este parser es tolerante y devuelve
 * solo lo que encuentra; el usuario siempre revisa y corrige después.
 */

const MONTHS: Record<string, string> = {
  ENE: '01', JAN: '01', FEB: '02', MAR: '03', ABR: '04', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AGO: '08', AUG: '08', SEP: '09', SET: '09', OCT: '10', NOV: '11', DIC: '12', DEC: '12',
};

const HEADER_WORDS = /REPUBLICA|COLOMBIA|IDENTIFICACION|PERSONAL|CEDULA|CIUDADANIA|FIRMA|NUMERO|NUIP|REGISTRADUR|SURNAMES|GIVEN|NAMES|APELLIDOS|NOMBRES|NACIONALIDAD|SEXO/;

function clean(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Una línea "parece" un nombre si solo tiene letras y no es un encabezado del documento. */
function looksLikeName(line: string | undefined): line is string {
  if (!line) return false;
  return /^[A-ZÑ ]{3,}$/.test(line) && !HEADER_WORDS.test(line);
}

function parseDate(line: string): string | undefined {
  const m = line.match(/(\d{1,2})[\s\-/.]+([A-Z]{3})[A-Z]*[\s\-/.]+(\d{4})/);
  if (m && MONTHS[m[2]]) return `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, '0')}`;
  const n = line.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (n) return `${n[3]}-${n[2].padStart(2, '0')}-${n[1].padStart(2, '0')}`;
  return undefined;
}

/** Texto que queda en una línea después de quitar la fecha (normalmente el lugar). */
function placeAfterDate(line: string): string | undefined {
  const rest = line
    .replace(/(\d{1,2})[\s\-/.]+([A-Z]{3})[A-Z]*[\s\-/.]+(\d{4})/, '')
    .replace(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/, '')
    .replace(/\b(FECHA|LUGAR|DE|Y|EXPEDICION|NACIMIENTO|DATE|OF|BIRTH|ISSUE|PLACE)\b|\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return rest.length >= 3 ? rest : undefined;
}

function findIndex(lines: string[], pattern: RegExp): number {
  return lines.findIndex((l) => pattern.test(l));
}

/** Busca un valor de nombre junto a su etiqueta, según el formato de la cédula. */
function nameNearLabel(lines: string[], label: RegExp, labelAbove: boolean): string | undefined {
  const i = findIndex(lines, label);
  if (i < 0) return undefined;
  const sameLine = lines[i].replace(label, '').replace(/\/.*$/, '').trim();
  if (looksLikeName(sameLine)) return sameLine;
  const candidate = labelAbove ? lines[i + 1] : lines[i - 1];
  return looksLikeName(candidate) ? candidate : undefined;
}

function dateAndPlaceNearLabel(lines: string[], label: RegExp, labelAbove: boolean) {
  const i = findIndex(lines, label);
  if (i < 0) return {};
  const order = labelAbove ? [i, i + 1, i + 2] : [i, i - 1, i + 1];
  for (const idx of order) {
    const line = lines[idx];
    if (!line) continue;
    const date = parseDate(line);
    if (date) {
      const place = placeAfterDate(line) ?? (looksLikeName(lines[idx + 1]) ? lines[idx + 1] : undefined);
      return { date, place };
    }
  }
  return {};
}

export function parseCedulaText(frontText: string, backText: string): OcrFields {
  const lines = [...clean(frontText), ...clean(backText)];
  const digital = lines.some((l) => /SURNAMES|GIVEN NAMES|NUIP/.test(l));
  const fields: OcrFields = {};

  // Número: después de "NUMERO"/"NUIP", o el primer número con formato 1.234.567.890
  const numberLine = lines.find((l) => /NUMERO|NUIP/.test(l) && /\d/.test(l));
  const numberMatch =
    numberLine?.match(/(\d{1,3}(?:[.,\s]\d{3}){1,3}|\d{6,10})/) ??
    lines.join(' ').match(/\b(\d{1,3}(?:[.,]\d{3}){2,3})\b/);
  if (numberMatch) fields.documentNumber = numberMatch[1].replace(/\D/g, '');

  fields.lastNames = nameNearLabel(lines, /APELLIDOS/, digital);
  fields.firstNames = nameNearLabel(lines, /NOMBRES/, digital);

  const birth = dateAndPlaceNearLabel(lines, /FECHA DE NACIMIENTO|DATE OF BIRTH/, digital);
  fields.birthDate = birth.date;

  const birthPlaceIdx = findIndex(lines, /LUGAR DE NACIMIENTO|PLACE OF BIRTH/);
  if (birthPlaceIdx >= 0) {
    // En la cédula amarilla el lugar puede ocupar 2 líneas: "BOGOTA D.C." + "(CUNDINAMARCA)".
    const parts: string[] = [];
    const step = digital ? 1 : -1;
    for (let i = birthPlaceIdx + step; parts.length < 2 && lines[i] && !/\d/.test(lines[i]) && !HEADER_WORDS.test(lines[i]); i += step) {
      parts.push(lines[i]);
      if (digital) break;
    }
    if (parts.length) fields.birthPlace = (digital ? parts : parts.reverse()).join(' ');
  }

  const issue = dateAndPlaceNearLabel(lines, /EXPEDICION|DATE OF ISSUE/, digital);
  fields.issueDate = issue.date;
  fields.issuePlace = issue.place;

  // Quitamos claves vacías para que el resultado sea limpio.
  (Object.keys(fields) as (keyof OcrFields)[]).forEach((k) => {
    if (!fields[k]) delete fields[k];
  });
  return fields;
}

export const REQUIRED_OCR_FIELDS: (keyof OcrFields)[] = [
  'firstNames',
  'lastNames',
  'documentNumber',
  'birthDate',
  'issuePlace',
];
