// frontend/src/components/fiorella/types.ts

/**
 * Estados posibles de Fiorella (sección 4.1 del plan).
 * "jump" y "point" se mantienen porque ya existen sprites para ellos;
 * el resto son estados nuevos que hoy reutilizan el sprite más parecido
 * (ver SPRITE_MAP) hasta que exista arte dedicado por estado.
 */
export type FiorellaAction =
  | "idle"
  | "walk"
  | "jump"
  | "point"
  | "wave"
  | "celebrate"
  | "surprised"
  | "sleep"
  | "think"
  | "alert"
  | "peek"
  | "hide";

/**
 * Señales reales del dashboard que el motor de comportamiento puede
 * recibir (sección 6 del plan). Todo es opcional: si no se pasa nada,
 * Fiorella deambula igual que la versión actual (idle/walk/jump/point).
 *
 * Fase 2: el Dashboard deberá ir llenando este objeto con datos reales
 * (dispositivos offline, sincronización, nuevos ponches, etc.).
 */
export interface FiorellaEvents {
  offlineDevices?: number;
  syncError?: boolean;
  syncSuccess?: boolean;
  hasDifferences?: boolean;
  newPunch?: boolean;
  attendanceHealthy?: boolean;
  userIdle?: boolean;
}

/**
 * Sprite estático que se usa para cada estado. Hoy solo existen 4 imágenes
 * (idle/walk/jump/point), así que varios estados nuevos reutilizan la más
 * cercana visualmente. Cuando tengas arte dedicado por estado (Fase 2/P1
 * del roadmap), solo hace falta cambiar la ruta aquí — nada más del
 * sistema necesita tocarse.
 */
export const SPRITE_MAP: Record<FiorellaAction, string> = {
  idle: "/fiorella-idle.png",
  walk: "/fiorella-walk.png",
  jump: "/fiorella-jump.png",
  point: "/fiorella-point.png",
  wave: "/fiorella-idle.png",
  celebrate: "/fiorella-jump.png",
  surprised: "/fiorella-jump.png",
  sleep: "/fiorella-idle.png",
  think: "/fiorella-point.png",
  alert: "/fiorella-point.png",
  peek: "/fiorella-idle.png",
  hide: "/fiorella-idle.png",
};

export const FALLBACK_SPRITE = "/5hpmW.jpg";