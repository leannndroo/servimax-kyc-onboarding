/**
 * Utilidades puras de texto. No dependen de librerías externas,
 * por eso son fáciles de probar con tests unitarios.
 */

/** Mayúsculas, sin tildes, sin signos y con espacios simples. "José  Pérez" → "JOSE PEREZ". */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-ZÑ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Qué proporción de las palabras del nombre REGISTRADO aparece en el nombre
 * del DOCUMENTO. Devuelve 0..1 y tolera orden distinto y nombres incompletos:
 * "Juan Pérez" contra "JUAN CARLOS PEREZ GOMEZ" = 1 (todo lo registrado está).
 */
export function nameCoverage(registered: string, documentName: string): number {
  const reg = normalizeName(registered).split(' ').filter(Boolean);
  const doc = new Set(normalizeName(documentName).split(' ').filter(Boolean));
  if (reg.length === 0 || doc.size === 0) return 0;
  return reg.filter((t) => doc.has(t)).length / reg.length;
}

/** Edad en años cumplidos a partir de una fecha ISO (yyyy-mm-dd). */
export function ageFromIsoDate(isoDate: string, now: Date = new Date()): number | null {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < d.getUTCMonth() ||
    (now.getUTCMonth() === d.getUTCMonth() && now.getUTCDate() < d.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Enmascara datos sensibles para mostrarlos o registrarlos: 1023456789 → ******6789. */
export function mask(value: string, visible = 4): string {
  if (value.length <= visible) return '*'.repeat(value.length);
  return '*'.repeat(value.length - visible) + value.slice(-visible);
}
