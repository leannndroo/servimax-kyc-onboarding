import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { OnboardingSession, QueryResult } from '../src/domain/types';
import { computeScore } from '../src/services/scoring';

const NOW = new Date('2026-10-10T12:00:00Z');

function q(name: QueryResult['name'], status: QueryResult['status'], data?: Record<string, unknown>): QueryResult {
  return { name, label: name, provider: 'test', status, durationMs: 10, attempts: 1, detail: `${name} ${status}`, data };
}

/** Sesión "perfecta" sobre la que cada test cambia solo lo que necesita. */
function session(overrides: Partial<OnboardingSession> = {}): OnboardingSession {
  return {
    id: 'test', createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), status: 'CONFIRMED',
    registration: { fullName: 'Juan Carlos Pérez Gómez', documentType: 'CC', documentNumber: '1023456789', phone: '3001234567', email: 'juan@correo.com', city: 'Bogotá' },
    documents: {
      front: { side: 'front', mimeType: 'image/jpeg', sizeBytes: 300000, width: 1600, height: 1000, qualityWarnings: [] },
      back: { side: 'back', mimeType: 'image/jpeg', sizeBytes: 300000, width: 1600, height: 1000, qualityWarnings: [] },
    },
    ocr: { enabled: true, provider: 'test', status: 'SUCCESS', fields: {}, missingFields: [], attempts: 1, message: '' },
    confirmed: { firstNames: 'JUAN CARLOS', lastNames: 'PEREZ GOMEZ', documentNumber: '1023456789', birthDate: '1990-03-15', issuePlace: 'BOGOTA', correctedFields: [] },
    queries: [q('IDENTITY_REGISTRY', 'OK'), q('WATCHLISTS', 'OK'), q('CONTACT_CHECK', 'OK')],
    log: [],
    ...overrides,
  };
}

describe('computeScore', () => {
  it('caso favorable → VALIDADO con 100 puntos y sin alertas', () => {
    const r = computeScore(session(), NOW);
    assert.equal(r.score, 100);
    assert.equal(r.decision, 'VALIDATED');
    assert.equal(r.alerts.length, 0);
    assert.equal(r.rawScore, 100);
    assert.equal(r.cappedBy, undefined);
    assert.equal(r.factors.reduce((s, f) => s + f.max, 0), 100, 'los máximos deben sumar 100');
  });

  it('servicio KYC caído → REQUIERE REVISIÓN (nunca validado sin consulta)', () => {
    const r = computeScore(session({ queries: [q('IDENTITY_REGISTRY', 'TIMEOUT'), q('WATCHLISTS', 'OK'), q('CONTACT_CHECK', 'OK')] }), NOW);
    assert.equal(r.decision, 'REQUIRES_REVIEW');
    assert.ok(r.score <= 79);
    assert.ok(r.alerts.some((a) => a.code === 'KYC_SERVICE_UNAVAILABLE'));
    assert.equal(r.rawScore, 70, '100 - 30 de identidad');
    assert.equal(r.score, 70, 'por debajo de 79 no se limita');
  });

  it('coincidencia en listas restrictivas → NO VALIDADO (crítica)', () => {
    const r = computeScore(session({ queries: [q('IDENTITY_REGISTRY', 'OK'), q('WATCHLISTS', 'ALERT'), q('CONTACT_CHECK', 'OK')] }), NOW);
    assert.equal(r.decision, 'NOT_VALIDATED');
    assert.equal(r.score, 30);
    assert.equal(r.rawScore, 90);
    assert.match(r.cappedBy ?? '', /CRÍTICA/);
  });

  it('documento cancelado → NO VALIDADO', () => {
    const identity = q('IDENTITY_REGISTRY', 'ALERT', { documentStatus: 'CANCELADA', matches: { firstNames: true, lastNames: true, birthDate: true } });
    const r = computeScore(session({ queries: [identity, q('WATCHLISTS', 'OK'), q('CONTACT_CHECK', 'OK')] }), NOW);
    assert.equal(r.decision, 'NOT_VALIDATED');
    assert.ok(r.alerts.some((a) => a.code === 'DOCUMENT_CANCELLED'));
  });

  it('OCR desactivado → REQUIERE REVISIÓN aunque todo lo demás esté bien', () => {
    const r = computeScore(session({ ocr: { enabled: false, provider: 'test', status: 'SKIPPED', fields: {}, missingFields: [], attempts: 1, message: '' } }), NOW);
    assert.equal(r.decision, 'REQUIRES_REVIEW');
    assert.equal(r.factors.find((f) => f.key === 'ocr')!.points, 0);
  });

  it('número confirmado distinto al registrado → alerta HIGH', () => {
    const base = session();
    const r = computeScore(session({ confirmed: { ...base.confirmed!, documentNumber: '1023456780' } }), NOW);
    assert.ok(r.alerts.some((a) => a.code === 'DOC_NUMBER_MISMATCH' && a.severity === 'HIGH'));
    assert.notEqual(r.decision, 'VALIDATED');
  });

  it('menor de edad → NO VALIDADO', () => {
    const base = session();
    const r = computeScore(session({ confirmed: { ...base.confirmed!, birthDate: '2010-01-01' } }), NOW);
    assert.equal(r.decision, 'NOT_VALIDATED');
    assert.ok(r.alerts.some((a) => a.code === 'UNDERAGE'));
  });

  it('correcciones del usuario restan puntos de OCR pero pueden seguir validando', () => {
    const base = session();
    const r = computeScore(session({ confirmed: { ...base.confirmed!, correctedFields: ['lastNames'] } }), NOW);
    assert.equal(r.factors.find((f) => f.key === 'ocr')!.points, 13);
    assert.equal(r.decision, 'VALIDATED');
  });

  it('revisión manual solicitada → REQUIERE REVISIÓN', () => {
    const r = computeScore(session({ manualReview: { requested: true, reason: 'OCR ilegible', at: NOW.toISOString() } }), NOW);
    assert.equal(r.decision, 'REQUIRES_REVIEW');
  });
});
