// frontend/src/components/fiorella/FiorellaController.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import Fiorella from "./Fiorella";
import { FiorellaBehaviorEngine } from "./FiorellaBehavior";
import type { FiorellaAction, FiorellaEvents } from "./types";

const TALK: Record<string, string[]> = {
  "/login": ["¡Hola! Pon usuario y clave.", "Te espero aquí."],
  "/dashboard": ["Miro el tablero contigo.", "Si el semáforo se pone rojo, salto.", "Un vistazo a los relojes."],
  "/records": ["Estos ponches salen de SQL.", "Sin salida = turno abierto."],
  "/devices": ["Ping verde = respiro.", "Sin IP no hay SDK."],
  "/collaborators": ["Ficha primero, reloj después.", "Dry-run antes de copiar huellas."],
  "/export": ["Excel para analizar, PDF para firmar."],
  default: ["Camino un rato y descanso.", "Clic y salto. La x me esconde."],
};

function pathKey() {
  const p = window.location.pathname || "/login";
  return TALK[p] ? p : "default";
}
function pick(arr: string[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Deambular por defecto cuando no hay eventos reales del dashboard todavía.
const WANDER_POOL: FiorellaAction[] = ["walk", "idle", "idle", "point", "jump"];

type FiorellaControllerProps = {
  /**
   * Eventos reales del dashboard (Fase 2). Opcional a propósito: si no se
   * pasa nada, Fiorella se comporta igual que la versión anterior
   * (deambula sola). Ejemplo de uso futuro desde Dashboard.tsx:
   *
   *   <FiorellaController events={{
   *     offlineDevices: health.offlineDevices,
   *     syncError: health.lastSyncFailed,
   *     newPunch: latestPunchId !== lastSeenPunchId,
   *   }} />
   */
  events?: FiorellaEvents;
};

export default function FiorellaController({ events = {} }: FiorellaControllerProps) {
  const [hidden, setHidden] = useState(() => localStorage.getItem("hide-fiorella") === "1");
  const [action, setAction] = useState<FiorellaAction>("idle");
  const [x, setX] = useState(48);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [line, setLine] = useState("¡Hola! Soy Fiorella.");
  const engine = useRef(new FiorellaBehaviorEngine());
  const tabHidden = useRef(false);
  const reducedMotion = useMemo(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    []
  );

  // Frases por ruta (mismo comportamiento que la versión anterior).
  useEffect(() => {
    if (hidden) return;
    const talk = () => setLine(pick(TALK[pathKey()] || TALK.default));
    talk();
    const id = window.setInterval(talk, 8000);
    return () => window.clearInterval(id);
  }, [hidden]);

  // Pausar el bucle de decisión cuando la pestaña no es visible (sección 12: rendimiento).
  useEffect(() => {
    const onVisibility = () => {
      tabHidden.current = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Bucle de decisión: primero mira eventos reales, si no hay ninguno, deambula.
  useEffect(() => {
    if (hidden) return;
    let cancelled = false;
    let timer = 0;

    const maxX = () => Math.max(60, window.innerWidth - 180);
    const wander = (): FiorellaAction => WANDER_POOL[Math.floor(Math.random() * WANDER_POOL.length)];

    const tick = () => {
      if (cancelled) return;
      if (!tabHidden.current) {
        const next = engine.current.decide(events, wander);
        setAction(next);

        if (next === "walk" && !reducedMotion) {
          setX((prevX) => {
            const target = 20 + Math.random() * maxX();
            setFacing(target >= prevX ? 1 : -1);
            return target;
          });
        }
      }
      const delay = reducedMotion ? 2500 : 900 + Math.random() * 600;
      timer = window.setTimeout(tick, delay);
    };

    timer = window.setTimeout(tick, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [events, hidden, reducedMotion]);

  if (hidden) {
    return (
      <button
        type="button"
        className="fixed bottom-4 right-4 z-[60] rounded-full bg-[#c8102e] text-white text-xs font-semibold px-3 py-2"
        onClick={() => {
          localStorage.removeItem("hide-fiorella");
          setHidden(false);
        }}
      >
        Fiorella
      </button>
    );
  }

  return (
    <Fiorella
      action={action}
      x={x}
      facing={facing}
      line={line}
      reducedMotion={reducedMotion}
      onSpriteClick={() => {
        setAction("jump");
        setLine(pick(TALK[pathKey()] || TALK.default));
      }}
      onHide={() => {
        localStorage.setItem("hide-fiorella", "1");
        setHidden(true);
      }}
    />
  );
}
