// frontend/src/components/fiorella/FiorellaController.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import Fiorella, { ChatMessage } from "./Fiorella";
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

const WANDER_POOL: FiorellaAction[] = ["walk", "idle", "idle", "point", "jump"];

type FiorellaControllerProps = {
  events?: FiorellaEvents;
};

type StoredUser = {
  id?: string | number;
  usuario_id?: string | number;
  username?: string;
  nombre?: string;
  name?: string;
};

export default function FiorellaController({ events = {} }: FiorellaControllerProps) {
  const [hidden, setHidden] = useState(() => localStorage.getItem("hide-fiorella") === "1");
  const [action, setAction] = useState<FiorellaAction>("idle");
  const [x, setX] = useState(48);
  const [facing, setFacing] = useState<1 | -1>(1);
  const [line, setLine] = useState("¡Hola! Soy Fiorella.");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null);

  const engine = useRef(new FiorellaBehaviorEngine());
  const tabHidden = useRef(false);
  const reducedMotion = useMemo(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
    [],
  );

  useEffect(() => {
    const rawUser = localStorage.getItem("user") || localStorage.getItem("auth_user");
    let activeUser: { id: string; name: string } = { id: "guest", name: "Usuario" };

    if (rawUser) {
      try {
        const parsed = JSON.parse(rawUser) as StoredUser;
        activeUser = {
          id: String(parsed.id ?? parsed.usuario_id ?? parsed.username ?? "user_1"),
          name: String(parsed.nombre ?? parsed.name ?? parsed.username ?? "Usuario"),
        };
      } catch {
        // Mantener usuario invitado si el storage contiene JSON inválido.
      }
    }

    setCurrentUser(activeUser);

    const sessionKey = `fiorella_session_${activeUser.id}`;
    const localHistory = localStorage.getItem(sessionKey);
    let parsedMessages: ChatMessage[] = [];

    if (localHistory) {
      try {
        const parsed = JSON.parse(localHistory);
        if (Array.isArray(parsed)) parsedMessages = parsed;
      } catch {
        parsedMessages = [];
      }
    }

    if (parsedMessages.length > 0) {
      setMessages(parsedMessages);
    } else {
      setMessages([{
        id: "init",
        sender: "fiorella",
        text: `¡Hola ${activeUser.name}! Estoy lista para ayudarte en el módulo ${pathKey()}. ¿Qué deseas realizar?`,
      }]);
    }
  }, []);

  useEffect(() => {
    if (currentUser && messages.length > 0) {
      localStorage.setItem(
        `fiorella_session_${currentUser.id}`,
        JSON.stringify(messages.slice(-20)),
      );
    }
  }, [messages, currentUser]);

  useEffect(() => {
    if (hidden || isChatOpen) return;
    const talk = () => setLine(pick(TALK[pathKey()] || TALK.default));
    talk();
    const id = window.setInterval(talk, 8000);
    return () => window.clearInterval(id);
  }, [hidden, isChatOpen]);

  useEffect(() => {
    const onVisibility = () => {
      tabHidden.current = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (hidden || isChatOpen) return;
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
  }, [events, hidden, reducedMotion, isChatOpen]);

  const toggleChat = () => {
    const nextState = !isChatOpen;
    setIsChatOpen(nextState);
    setAction(nextState ? "point" : "idle");
  };

  const handleSendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = {
      id: `${Date.now()}-user`,
      sender: "user",
      text: trimmed,
    };
    const updatedMessages = [...messages, userMsg];

    setMessages(updatedMessages);
    setLoading(true);
    setAction("walk");

    try {
      const token = localStorage.getItem("token") || localStorage.getItem("access_token");
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch("/api/v1/fiorella/chat", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: trimmed,
          active_module: pathKey(),
          history: updatedMessages.slice(-10),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const detail = typeof data?.detail === "string" ? data.detail : `HTTP ${res.status}`;
        throw new Error(detail);
      }

      const aiMsg: ChatMessage = {
        id: `${Date.now()}-fiorella`,
        sender: "fiorella",
        text: data.respuesta || "Solicitud procesada con éxito.",
      };

      setMessages((prev) => [...prev, aiMsg]);
      if (data.animacion) setAction(data.animacion as FiorellaAction);

      // La acción de navegación/reporte/confirmación queda disponible para el
      // componente de chat si Fiorella la devuelve. No se ejecuta aquí para
      // evitar acciones duplicadas.
    } catch (err) {
      console.error("Fiorella chat error:", err);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-error`,
          sender: "fiorella",
          text: err instanceof Error
            ? `No pude completar la solicitud: ${err.message}`
            : "Ocurrió una desconexión momentánea con el servidor de IA.",
        },
      ]);
      setAction("alert");
    } finally {
      setLoading(false);
    }
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
      onHide={() => {
        localStorage.setItem("hide-fiorella", "1");
        setHidden(true);
      }}
      isChatOpen={isChatOpen}
      messages={messages}
      loading={loading}
      activeModule={pathKey()}
      onSendMessage={handleSendMessage}
      onCloseChat={() => {
        setIsChatOpen(false);
        setAction("idle");
      }}
      onMinimizeChat={() => {
        setIsChatOpen(false);
        setAction("idle");
      }}
    />
  );
}
