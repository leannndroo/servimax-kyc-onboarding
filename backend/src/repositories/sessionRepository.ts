import fs from 'node:fs';
import path from 'node:path';
import type { OnboardingSession } from '../domain/types';
import { logger } from '../utils/logger';

/**
 * Persistencia detrás de una interfaz (patrón Repository).
 * MVP: archivo JSON local, escrito de forma atómica (archivo temporal + rename).
 * Producción: cambiar por PostgreSQL implementando la misma interfaz.
 *
 * QUÉ SE GUARDA: datos del registro, datos confirmados, resultados de consultas,
 * score y bitácora. QUÉ NO: las imágenes del documento (ver ImageVault).
 * CUÁNTO TIEMPO: SESSION_TTL_HOURS (72 h por defecto); luego se purga.
 */
export interface SessionRepository {
  get(id: string): OnboardingSession | undefined;
  save(session: OnboardingSession): void;
  list(): OnboardingSession[];
  purgeExpired(now?: Date): number;
}

export class JsonFileSessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, OnboardingSession>();
  private flushTimer?: NodeJS.Timeout;

  constructor(private readonly filePath: string | null, private readonly ttlHours: number) {
    if (filePath && fs.existsSync(filePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as OnboardingSession[];
        raw.forEach((s) => this.sessions.set(s.id, s));
      } catch {
        logger.error('repository.load_failed', { filePath });
      }
    }
  }

  get(id: string) {
    return this.sessions.get(id);
  }

  save(session: OnboardingSession) {
    session.updatedAt = new Date().toISOString();
    this.sessions.set(session.id, session);
    this.scheduleFlush();
  }

  list() {
    return [...this.sessions.values()];
  }

  purgeExpired(now = new Date()) {
    const limit = now.getTime() - this.ttlHours * 3600_000;
    let removed = 0;
    for (const [id, s] of this.sessions) {
      if (new Date(s.createdAt).getTime() < limit) {
        this.sessions.delete(id);
        removed += 1;
      }
    }
    if (removed) this.scheduleFlush();
    return removed;
  }

  /** Agrupa escrituras seguidas en una sola (evita escribir el archivo en cada paso). */
  private scheduleFlush() {
    if (!this.filePath || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      try {
        fs.mkdirSync(path.dirname(this.filePath!), { recursive: true });
        const tmp = `${this.filePath}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(this.list()), { mode: 0o600 });
        fs.renameSync(tmp, this.filePath!);
      } catch (err) {
        logger.error('repository.flush_failed', { error: (err as Error).message });
      }
    }, 200);
  }
}

/**
 * Imágenes del documento: SOLO en memoria y por poco tiempo (IMAGE_TTL_MINUTES).
 * Se borran apenas el usuario confirma los datos o al expirar. Nunca tocan disco.
 */
export class ImageVault {
  private readonly images = new Map<string, { front?: StoredImage; back?: StoredImage; expiresAt: number }>();

  constructor(private readonly ttlMinutes: number) {}

  put(sessionId: string, side: 'front' | 'back', image: StoredImage) {
    const entry = this.images.get(sessionId) ?? { expiresAt: 0 };
    entry[side] = image;
    entry.expiresAt = Date.now() + this.ttlMinutes * 60_000;
    this.images.set(sessionId, entry);
  }

  get(sessionId: string) {
    const entry = this.images.get(sessionId);
    if (!entry || entry.expiresAt < Date.now()) {
      this.images.delete(sessionId);
      return undefined;
    }
    return entry;
  }

  delete(sessionId: string) {
    this.images.delete(sessionId);
  }

  purgeExpired() {
    const now = Date.now();
    for (const [id, e] of this.images) if (e.expiresAt < now) this.images.delete(id);
  }
}

export interface StoredImage {
  buffer: Buffer;
  mimeType: string;
}
