import { z } from 'zod';

/**
 * Esquemas de validación de entrada (zod). Son la "puerta" del backend:
 * nada entra a la lógica de negocio sin pasar por aquí, aunque la app
 * ya haya validado (nunca se confía solo en el cliente).
 */

const lettersOnly = /^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' ]+$/;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export const registrationSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(5, 'El nombre completo es muy corto')
      .max(80, 'El nombre completo es muy largo')
      .regex(lettersOnly, 'El nombre solo puede contener letras y espacios')
      .refine((v) => v.split(/\s+/).length >= 2, 'Escribe nombres y apellidos'),
    documentType: z.enum(['CC', 'CE'], { message: 'Tipo de documento inválido' }),
    documentNumber: z.string().trim().regex(/^\d{6,10}$/, 'El número debe tener entre 6 y 10 dígitos, sin puntos'),
    phone: z
      .string()
      .trim()
      .transform((v) => v.replace(/[\s-]/g, '').replace(/^\+?57/, ''))
      .pipe(z.string().regex(/^3\d{9}$/, 'El celular debe tener 10 dígitos y empezar por 3')),
    email: z.string().trim().toLowerCase().email('Correo electrónico inválido').max(100),
    city: z
      .string()
      .trim()
      .min(3, 'Ciudad o municipio inválido')
      .max(60)
      .regex(/^[A-Za-zÁÉÍÓÚÜÑáéíóúüñ.,() -]+$/, 'Ciudad o municipio inválido'),
  })
  .strict();

export const ocrRequestSchema = z.object({ useOcr: z.boolean().default(true) });

export const confirmationSchema = z
  .object({
    firstNames: z.string().trim().min(2, 'Nombres requeridos').max(60).regex(lettersOnly, 'Nombres inválidos'),
    lastNames: z.string().trim().min(2, 'Apellidos requeridos').max(60).regex(lettersOnly, 'Apellidos inválidos'),
    documentNumber: z.string().trim().regex(/^\d{6,10}$/, 'Número de documento inválido'),
    birthDate: z.string().regex(isoDate, 'Fecha de nacimiento con formato AAAA-MM-DD'),
    issuePlace: z.string().trim().min(3, 'Lugar de expedición requerido').max(60),
    issueDate: z.string().regex(isoDate, 'Fecha de expedición con formato AAAA-MM-DD').optional(),
  })
  .strict();

export const manualReviewSchema = z.object({
  reason: z.string().trim().min(3, 'Indica el motivo').max(300),
});

export const reportFormatSchema = z.enum(['pdf', 'json', 'csv']);
