// frontend/src/components/fiorella/FiorellaBehavior.ts
import type { FiorellaAction, FiorellaEvents } from "./types";

/**
 * Prioridad de cada estado. Un estado con prioridad mayor puede
 * interrumpir al actual antes de que termine su duración mínima
 * (sección 6 del plan: "debe existir prioridad, duración mínima,
 * cooldown y transición entre estados para evitar cambios constantes").
 */
const PRIORITY: Record<FiorellaAction, number> = {
  alert: 100,
  surprised: 90,
  wave: 70,
  celebrate: 65,
  think: 60,
  peek: 40,
  hide: 40,
  point: 30,
  jump: 30,
  walk: 10,
  idle: 5,
  sleep: 20,
};

/** Cuánto tiempo mínimo se sostiene cada estado antes de poder cambiarlo. */
const MIN_DURATION_MS: Record<FiorellaAction, number> = {
  idle: 1500,
  walk: 2200,
  jump: 700,
  point: 1400,
  wave: 1800,
  celebrate: 2200,
  surprised: 1800,
  sleep: 4000,
  think: 2400,
  alert: 1600,
  peek: 1200,
  hide: 1000,
};

/**
 * Cooldown por estado, para que una reacción (ej. "celebrate") no se
 * repita todo el tiempo aunque la condición siga siendo verdadera.
 */
const COOLDOWN_MS: Partial<Record<FiorellaAction, number>> = {
  celebrate: 15000,
  wave: 6000,
  surprised: 20000,
  alert: 10000,
  think: 12000,
};

/**
 * Motor de comportamiento (sección 6 del plan). Es agnóstico de React:
 * solo recibe eventos y una función "wander" (para el deambular por
 * defecto cuando no hay ninguna señal real) y devuelve el próximo estado.
 */
export class FiorellaBehaviorEngine {
  private current: FiorellaAction = "idle";
  private since = Date.now();
  private lastFired = new Map<FiorellaAction, number>();

  get state(): FiorellaAction {
    return this.current;
  }

  decide(
    events: FiorellaEvents,
    wander: () => FiorellaAction,
    now: number = Date.now()
  ): FiorellaAction {
    const desired = this.fromEvents(events) ?? wander();

    if (desired === this.current) {
      return this.current;
    }

    const interrupts = PRIORITY[desired] > PRIORITY[this.current];
    const elapsed = now - this.since;
    if (!interrupts && elapsed < MIN_DURATION_MS[this.current]) {
      return this.current;
    }

    const cooldown = COOLDOWN_MS[desired];
    const lastTime = this.lastFired.get(desired) ?? 0;
    if (cooldown && now - lastTime < cooldown) {
      return this.current; // en cooldown: se mantiene el estado actual
    }

    this.current = desired;
    this.since = now;
    this.lastFired.set(desired, now);
    return desired;
  }

  /** Traducción directa de eventos reales a un estado (sección 6, pseudocódigo). */
  private fromEvents(e: FiorellaEvents): FiorellaAction | null {
    if (e.syncError) return "alert";
    if ((e.offlineDevices ?? 0) > 0) return "surprised";
    if (e.newPunch) return "wave";
    if (e.hasDifferences) return "think";
    if (e.syncSuccess || e.attendanceHealthy) return "celebrate";
    if (e.userIdle) return "sleep";
    return null; // sin señal fuerte → dejar que el caller decida (deambular)
  }
}
