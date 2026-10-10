import type { Confirmation, Registration } from './types';

/**
 * Validación en el celular: da respuesta inmediata al usuario.
 * Son las MISMAS reglas del backend (que vuelve a validar, porque
 * nunca se confía solo en el cliente).
 */

const LETTERS = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' ]+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type Errors<T> = Partial<Record<keyof T, string>>;

export function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, '').replace(/^\+?57/, '');
}

export function validateRegistration(r: Registration): Errors<Registration> {
  const e: Errors<Registration> = {};
  const name = r.fullName.trim();
  if (!name) e.fullName = 'Escribe tu nombre completo';
  else if (!LETTERS.test(name)) e.fullName = 'Solo letras y espacios';
  else if (name.split(/\s+/).length < 2 || name.length < 5) e.fullName = 'Escribe nombres y apellidos';

  if (!/^\d{6,10}$/.test(r.documentNumber.trim())) e.documentNumber = 'Entre 6 y 10 dígitos, sin puntos';
  if (!/^3\d{9}$/.test(normalizePhone(r.phone))) e.phone = 'Celular de 10 dígitos que empiece por 3';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email.trim())) e.email = 'Correo electrónico inválido';
  if (r.city.trim().length < 3) e.city = 'Escribe tu ciudad o municipio';
  return e;
}

function isRealDate(iso: string): boolean {
  if (!ISO_DATE.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(iso) && d.getTime() < Date.now();
}

export function validateConfirmation(c: Confirmation): Errors<Confirmation> {
  const e: Errors<Confirmation> = {};
  if (c.firstNames.trim().length < 2 || !LETTERS.test(c.firstNames.trim())) e.firstNames = 'Nombres inválidos';
  if (c.lastNames.trim().length < 2 || !LETTERS.test(c.lastNames.trim())) e.lastNames = 'Apellidos inválidos';
  if (!/^\d{6,10}$/.test(c.documentNumber.trim())) e.documentNumber = 'Entre 6 y 10 dígitos';
  if (!isRealDate(c.birthDate)) e.birthDate = 'Fecha válida AAAA-MM-DD';
  if (c.issuePlace.trim().length < 3) e.issuePlace = 'Lugar de expedición requerido';
  if (c.issueDate && !isRealDate(c.issueDate)) e.issueDate = 'Fecha válida AAAA-MM-DD';
  return e;
}

export const hasErrors = (e: object) => Object.keys(e).length > 0;
