import { randomUUID } from 'node:crypto';

/**
 * MOCK de un proveedor KYC externo (tipo Usecroma), expuesto como un servicio
 * HTTP real en /mock-kyc/v1. El backend lo consume con fetch, API key,
 * timeout, reintentos y validación de respuesta, exactamente como haría
 * con el proveedor real: para cambiarlo basta con KYC_BASE_URL y KYC_API_KEY.
 *
 * Escenarios por el ÚLTIMO dígito del número de documento:
 *   0 → los apellidos NO coinciden con el registro
 *   1 → coincidencia en listas restrictivas
 *   2 → documento CANCELADO
 *   3 → el servicio de identidad tarda más que el timeout
 *   4 → el servicio de identidad responde 503 (caído)
 *   5 → el servicio de identidad responde un JSON inesperado
 *   8, 9 (y cualquier otro) → caso favorable
 */

export interface IdentityRequest {
  documentType: string;
  documentNumber: string;
  firstNames: string;
  lastNames: string;
  birthDate: string;
}

export type MockReply = { status: number; body: unknown; delayMs: number };

export function identityScenario(req: IdentityRequest): MockReply {
  const last = String(req.documentNumber ?? '').slice(-1);
  const base = { requestId: randomUUID(), documentNumber: req.documentNumber };
  switch (last) {
    case '0':
      return { status: 200, delayMs: 400, body: { ...base, found: true, documentStatus: 'VIGENTE',
        matches: { firstNames: true, lastNames: false, birthDate: true } } };
    case '2':
      return { status: 200, delayMs: 400, body: { ...base, found: true, documentStatus: 'CANCELADA',
        matches: { firstNames: true, lastNames: true, birthDate: true } } };
    case '3':
      return { status: 200, delayMs: 15000, body: { ...base, found: true } };
    case '4':
      return { status: 503, delayMs: 200, body: { error: 'SERVICE_UNAVAILABLE' } };
    case '5':
      return { status: 200, delayMs: 300, body: { ok: 'yes', payload: null } };
    default:
      return { status: 200, delayMs: 500, body: { ...base, found: true, documentStatus: 'VIGENTE',
        matches: { firstNames: true, lastNames: true, birthDate: true } } };
  }
}

export function watchlistScenario(req: { documentNumber: string }): MockReply {
  const hit = String(req.documentNumber ?? '').endsWith('1');
  return {
    status: 200,
    delayMs: 350,
    body: {
      requestId: randomUUID(),
      checkedLists: ['OFAC-SDN / Lista Clinton (simulada)', 'Consejo de Seguridad ONU (simulada)', 'PEP · Personas Expuestas Políticamente (simulada)'],
      hits: hit ? [{ list: 'OFAC-SDN / Lista Clinton (simulada)', reason: 'Coincidencia por número de documento' }] : [],
    },
  };
}
