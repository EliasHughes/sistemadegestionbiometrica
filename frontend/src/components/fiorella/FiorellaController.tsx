// frontend/src/components/fiorella/FiorellaController.tsx
// frontend/src/components/fiorella/FiorellaController.tsx

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Fiorella from "./Fiorella";

import {
  FiorellaBehaviorEngine,
} from "./FiorellaBehavior";

import type {
  FiorellaAction,
  FiorellaEvents,
} from "./types";

import { useFiorellaChat } from "./useFiorellaChat";
import type { FiorellaChatResponse } from "./useFiorellaChat";

const TALK: Record<string, string[]> = {
  "/login": ["¡Hola! Pon usuario y clave.", "Te espero aquí."],
  "/dashboard": [
    "Miro el tablero contigo.",
    "Si el semáforo se pone rojo, salto.",
    "Un vistazo a los relojes.",
  ],
  "/records": ["Estos ponches salen de SQL.", "Sin salida = turno abierto."],
  "/db-records": [
    "Aquí puedes revisar el historial SQL.",
    "Puedo ayudarte a interpretar los registros.",
  ],
  "/remote-punch": [
    "Aquí podemos trabajar con ponches remotos.",
    "Verifico el colaborador antes de registrar.",
  ],
  "/devices": [
    "Ping verde = respiro.",
    "Sin IP no hay comunicación con el reloj.",
  ],
  "/employees": [
    "Puedo ayudarte a localizar empleados.",
    "Busquemos por nombre o código.",
  ],
  "/collaborators": [
    "Ficha primero, reloj después.",
    "Puedo ayudarte con los colaboradores.",
  ],
  "/schedules": [
    "Aquí revisamos horarios y turnos.",
    "Puedo ayudarte con los horarios.",
  ],
  "/biometric": [
    "Puedo revisar el inventario biométrico.",
    "Veamos el estado de los relojes.",
  ],
  "/bulk": [
    "Las operaciones masivas requieren cuidado.",
    "Primero validamos y luego ejecutamos.",
  ],
  "/reports": [
    "Puedo ayudarte a interpretar los reportes.",
    "Veamos qué información necesitas.",
  ],
  "/export": ["Excel para analizar, PDF para presentar."],
  "/sync-history": [
    "Aquí podemos revisar las sincronizaciones.",
    "Puedo buscar errores de sincronización.",
  ],
  "/users": [
    "La administración de usuarios requiere permisos.",
    "Puedo orientarte sobre roles y usuarios.",
  ],
  "/settings": [
    "Aquí configuramos el sistema.",
    "Puedo ayudarte con los parámetros.",
  ],
  "/advanced-reports": [
    "Puedo ayudarte a analizar los reportes avanzados.",
  ],
  default: [
    "Estoy disponible si necesitas ayuda.",
    "Puedes preguntarme sobre el sistema.",
  ],
};

const WANDER_POOL: FiorellaAction[] = [
  "walk",
  "idle",
  "idle",
  "point",
  "jump",
];

type FiorellaControllerProps = {
  events?: FiorellaEvents;
};

function currentModule(): string {
  return window.location.pathname || "/dashboard";
}

function talkKey(): string {
  const path = currentModule();
  return TALK[path] ? path : "default";
}

function pick(values: string[]): string {
  if (!values.length) return "";
  return values[Math.floor(Math.random() * values.length)];
}

export default function FiorellaController({
  events = {},
}: FiorellaControllerProps) {
  const [hidden, setHidden] = useState(
    () => localStorage.getItem("hide-fiorella") === "1",
  );
  const [action, setAction] = useState<FiorellaAction>("idle");
  const [x, setX] = useState(48);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [line, setLine] = useState("¡Hola! Soy Fiorella.");
  const [isChatOpen, setIsChatOpen] = useState(false);

  const engine = useRef(new FiorellaBehaviorEngine());
  const tabHidden = useRef(false);

  const reducedMotion = useMemo(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
      false,
    [],
  );

  const processBackendAction = (data: FiorellaChatResponse) => {
    const backendAction = data.action;

    if (
      backendAction?.type === "navigate" &&
      typeof backendAction.route === "string" &&
      backendAction.route.startsWith("/")
    ) {
      window.history.pushState({}, "", backendAction.route);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    if (
      backendAction?.type === "download" &&
      typeof backendAction.url === "string"
    ) {
      window.open(
        backendAction.url,
        "_blank",
        "noopener,noreferrer",
      );

      return;
    }
  };

  const { messages, loading, clearChat, sendMessage } = useFiorellaChat({
    getActiveModule: currentModule,
    onAnimation: setAction,
    onBackendAction: processBackendAction,
  });

  useEffect(() => {
    if (hidden || isChatOpen) return;

    const talk = () => {
      setLine(pick(TALK[talkKey()] || TALK.default));
    };

    talk();
    const timer = window.setInterval(talk, 8000);
    return () => window.clearInterval(timer);
  }, [hidden, isChatOpen]);

  useEffect(() => {
    const onVisibility = () => {
      tabHidden.current = document.hidden;
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () =>
      document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (hidden || isChatOpen) return;

    let cancelled = false;
    let timer = 0;

    const maxX = () => Math.max(60, window.innerWidth - 180);

    const wander = (): FiorellaAction =>
      WANDER_POOL[Math.floor(Math.random() * WANDER_POOL.length)];

    const tick = () => {
      if (cancelled) return;

      if (!tabHidden.current) {
        const next = engine.current.decide(events, wander);
        setAction(next);

        if (next === "walk" && !reducedMotion) {
          setX((previousX) => {
            const target = 20 + Math.random() * maxX();
            setFacing(target >= previousX ? 1 : -1);
            return target;
          });
        }
      }

      const delay = reducedMotion
        ? 2500
        : 900 + Math.random() * 600;

      timer = window.setTimeout(tick, delay);
    };

    timer = window.setTimeout(tick, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [events, hidden, reducedMotion, isChatOpen]);

  const toggleChat = () => {
    const next = !isChatOpen;
    setIsChatOpen(next);
    setAction(next ? "point" : "idle");
  };

  const hideFiorella = () => {
    localStorage.setItem("hide-fiorella", "1");
    setHidden(true);
  };

  const closeChat = () => {
    setIsChatOpen(false);
    setAction("idle");
  };

  if (hidden) {
    return (
      <button
        type="button"
        className="fixed bottom-4 right-4 z-[60] rounded-full bg-[#c8102e] text-white text-xs font-semibold px-3 py-2 shadow-lg hover:bg-[#a11e30]"
        onClick={() => {
          localStorage.removeItem("hide-fiorella");
          setHidden(false);
        }}
      >
        💬 Fiorella
      </button>
    );
  }

  return (
    <Fiorella
      action={action}
      x={x}
      facing={facing === -1 ? "left" : "right"}
      line={line}
      reducedMotion={reducedMotion}
      onSpriteClick={toggleChat}
      onHide={hideFiorella}
      isChatOpen={isChatOpen}
      messages={messages}
      loading={loading}
      activeModule={currentModule()}
      onSendMessage={sendMessage}
      onClearChat={clearChat}
      onCloseChat={closeChat}
      onMinimizeChat={closeChat}
    />
  );
}
