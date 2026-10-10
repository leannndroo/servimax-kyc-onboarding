import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { deflateSync } from 'node:zlib';
import { env } from '../src/config/env';
import { createApp } from '../src/app';
import { MockOcrProvider } from '../src/services/ocr/ocrProviders';

/**
 * Test de integración del flujo completo contra la API real (Express),
 * con OCR simulado y el mock KYC HTTP. No usa red externa.
 */

const PORT = 3900 + Math.floor(Math.random() * 500);
const BASE = `http://127.0.0.1:${PORT}`;
let server: Server;

/** Genera un PNG en escala de grises con ruido (suficiente tamaño/resolución para pasar las validaciones). */
function makePng(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits
  ihdr[9] = 0; // escala de grises
  const raw = Buffer.alloc((width + 1) * height);
  for (let i = 0; i < raw.length; i++) raw[i] = i % (width + 1) === 0 ? 0 : Math.floor(Math.random() * 256);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const json = async (path: string, method = 'GET', body?: unknown) => {
  const res = await fetch(`${BASE}${path}`, {
    method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (await res.json()) as any };
};

async function runFlow(documentNumber: string) {
  const created = await json('/api/v1/onboarding', 'POST', {
    fullName: 'Juan Carlos Pérez Gómez', documentType: 'CC', documentNumber, phone: '300 123 4567', email: 'juan@correo.com', city: 'Bogotá',
  });
  assert.equal(created.status, 201);
  const id = created.body.id as string;

  const form = new FormData();
  form.append('front', new Blob([new Uint8Array(makePng(1200, 800))], { type: 'image/png' }), 'front.png');
  form.append('back', new Blob([new Uint8Array(makePng(1200, 800))], { type: 'image/png' }), 'back.png');
  const up = await fetch(`${BASE}/api/v1/onboarding/${id}/documents`, { method: 'POST', body: form });
  assert.equal(up.status, 200);

  const ocr = await json(`/api/v1/onboarding/${id}/ocr`, 'POST', { useOcr: true });
  assert.equal(ocr.status, 200);
  const f = ocr.body.fields;
  const confirm = await json(`/api/v1/onboarding/${id}/confirmation`, 'PUT', {
    firstNames: f.firstNames ?? 'JUAN CARLOS', lastNames: f.lastNames ?? 'PEREZ GOMEZ', documentNumber,
    birthDate: f.birthDate ?? '1990-03-15', issuePlace: f.issuePlace ?? 'BOGOTA',
  });
  assert.equal(confirm.status, 200);
  const verified = await json(`/api/v1/onboarding/${id}/verification`, 'POST');
  assert.equal(verified.status, 200);
  return { id, ocr: ocr.body, session: verified.body };
}

describe('API de onboarding', () => {
  before(async () => {
    process.env.NODE_ENV = 'test'; // silencia los logs durante los tests
    const { app } = createApp(
      { ...env, port: PORT, kycBaseUrl: `${BASE}/mock-kyc/v1`, kycApiKey: 'test-key', kycTimeoutMs: 2000, ocrEnabled: true },
      { ocr: new MockOcrProvider(), dataFile: null },
    );
    await new Promise<void>((resolve) => { server = app.listen(PORT, resolve); });
  });
  after(() => server.close());

  it('rechaza un registro inválido con errores por campo', async () => {
    const r = await json('/api/v1/onboarding', 'POST', { fullName: 'J', documentType: 'XX', documentNumber: '12', phone: '123', email: 'x', city: '' });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'VALIDATION_ERROR');
    assert.ok(Object.keys(r.body.error.details.fields).length >= 5);
  });

  it('exige frente y reverso', async () => {
    const created = await json('/api/v1/onboarding', 'POST', {
      fullName: 'Ana Ruiz', documentType: 'CC', documentNumber: '52123459', phone: '3001234567', email: 'ana@correo.com', city: 'Cali',
    });
    const form = new FormData();
    form.append('front', new Blob([new Uint8Array(makePng(1200, 800))], { type: 'image/png' }), 'front.png');
    const r = await fetch(`${BASE}/api/v1/onboarding/${created.body.id}/documents`, { method: 'POST', body: form });
    assert.equal(r.status, 400);
    assert.equal(((await r.json()) as any).error.code, 'MISSING_IMAGE');
  });

  it('flujo completo favorable → VALIDADO y genera informes', async () => {
    const { id, ocr, session } = await runFlow('1023456789');
    assert.equal(ocr.status, 'SUCCESS');
    assert.equal(session.result.decision, 'VALIDATED');
    for (const format of ['json', 'csv', 'pdf']) {
      const r = await fetch(`${BASE}/api/v1/onboarding/${id}/report?format=${format}`);
      assert.equal(r.status, 200, `informe ${format}`);
      assert.ok((await r.arrayBuffer()).byteLength > 200);
    }
    const metrics = await json('/api/v1/metrics');
    assert.ok(metrics.body.completed >= 1);
  });

  it('servicio KYC caído (escenario 4) → REQUIERE REVISIÓN sin romper el flujo', async () => {
    const { session } = await runFlow('1023456784');
    const identity = session.queries.find((q: any) => q.name === 'IDENTITY_REGISTRY');
    assert.equal(identity.status, 'ERROR');
    assert.equal(identity.attempts, 2, 'debe reintentar una vez');
    assert.equal(session.result.decision, 'REQUIRES_REVIEW');
  });

  it('OCR sin resultados (escenario 6) → explica y permite continuar', async () => {
    const { ocr } = await runFlow('1023456786');
    assert.equal(ocr.status, 'NO_RESULTS');
    assert.match(ocr.message, /revisión manual/);
  });
});
