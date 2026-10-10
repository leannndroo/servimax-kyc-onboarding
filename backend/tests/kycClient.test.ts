import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import type { ConfirmedData, Registration } from '../src/domain/types';
import { KycClient } from '../src/services/kyc/kycClient';
import { identityScenario, watchlistScenario } from '../src/services/kyc/mockKycScenarios';

/**
 * Prueba la resiliencia del cliente KYC (timeout, reintento, respuesta inválida)
 * contra los escenarios del mock servidos con node:http (sin Express).
 */
let server: Server;
let client: KycClient;

const reg: Registration = { fullName: 'Juan Pérez', documentType: 'CC', documentNumber: '', phone: '3001234567', email: 'j@correo.com', city: 'Bogotá' };
const confirmed = (documentNumber: string): ConfirmedData => ({
  firstNames: 'JUAN', lastNames: 'PEREZ', documentNumber, birthDate: '1990-01-01', issuePlace: 'BOGOTA', correctedFields: [],
});

describe('KycClient', () => {
  before(async () => {
    process.env.NODE_ENV = 'test';
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        if (req.headers['x-api-key'] !== 'k') {
          res.writeHead(401).end();
          return;
        }
        const body = JSON.parse(raw || '{}');
        const reply = req.url?.endsWith('/identity/verify') ? identityScenario(body) : watchlistScenario(body);
        const timer = setTimeout(() => res.writeHead(reply.status, { 'content-type': 'application/json' }).end(JSON.stringify(reply.body)), reply.delayMs);
        res.on('close', () => clearTimeout(timer));
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as AddressInfo;
    client = new KycClient({ baseUrl: `http://127.0.0.1:${port}`, apiKey: 'k', timeoutMs: 1500, maxRetries: 1 });
  });
  after(() => server.close());

  it('caso favorable → OK en las tres consultas', async () => {
    const results = await client.runAll(reg, confirmed('1023456789'));
    assert.deepEqual(results.map((r) => r.status), ['OK', 'OK', 'OK']);
  });

  it('apellidos no coinciden (escenario 0) → ALERT', async () => {
    const r = await client.verifyIdentity(reg, confirmed('1023456780'));
    assert.equal(r.status, 'ALERT');
    assert.match(r.detail, /apellidos: NO coinciden/);
  });

  it('timeout (escenario 3) → TIMEOUT tras reintentar', async () => {
    const r = await client.verifyIdentity(reg, confirmed('1023456783'));
    assert.equal(r.status, 'TIMEOUT');
    assert.equal(r.attempts, 2);
  });

  it('servicio caído (escenario 4) → ERROR tras reintentar', async () => {
    const r = await client.verifyIdentity(reg, confirmed('1023456784'));
    assert.equal(r.status, 'ERROR');
    assert.equal(r.attempts, 2);
  });

  it('respuesta inesperada (escenario 5) → ERROR sin reintentar', async () => {
    const r = await client.verifyIdentity(reg, confirmed('1023456785'));
    assert.equal(r.status, 'ERROR');
    assert.equal(r.attempts, 1);
    assert.match(r.detail, /formato inesperado/);
  });

  it('listas restrictivas (escenario 1) → ALERT', async () => {
    const r = await client.screenWatchlists(confirmed('1023456781'));
    assert.equal(r.status, 'ALERT');
  });

  it('correo temporal → alerta de contacto', () => {
    assert.equal(client.checkContact({ ...reg, email: 'x@yopmail.com' }).status, 'ALERT');
  });
});
