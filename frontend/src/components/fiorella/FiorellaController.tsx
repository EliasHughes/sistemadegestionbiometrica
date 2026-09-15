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
    []
  );

  useEffect(() => {
    const rawUser = localStorage.getItem("user") || localStorage.getItem("auth_user");
    let activeUser = { id: "guest", name: "Usuario" };

    if (rawUser) {
      try {
        const parsed = JSON.parse(rawUser);
        activeUser = {
          id: parsed.id || parsed.usuario_id || "user_1",
          name: parsed.nombre || parsed.username || "Usuario",
        };
      } catch (e) {}
    }

    setCurrentUser(activeUser);

    const sessionKey = `fiorella_session_${activeUser.id}`;
    const localHistory = localStorage.getItem(sessionKey);

    let parsedMessages: ChatMessage[] = [];
    if (localHistory) {
      try {
        const parsed = JSON.parse(localHistory);
        if (Array.isArray(parsed)) {
          parsedMessages = parsed;
        }
      } catch (e) {
        parsedMessages = [];
      }
    }

    if (parsedMessages.length > 0) {
      setMessages(parsedMessages);
    } else {
      const initialGreeting: ChatMessage = {
        id: "init",
        sender: "fiorella",
        text: `¡Hola ${activeUser.name}! Estoy lista para ayudarte en el módulo ${pathKey()}. ¿Qué deseas realizar?`,
      };
      setMessages([initialGreeting]);
    }
  }, []);

  useEffect(() => {
    if (currentUser && Array.isArray(messages) && messages.length > 0) {
      localStorage.setItem(
        `fiorella_session_${currentUser.id}`,
        JSON.stringify(messages.slice(-20))
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
    if (nextState) {
      setAction("point");
    } else {
      setAction("idle");
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text,
    };

    setMessages((prev) => [...(Array.isArray(prev) ? prev : []), userMsg]);
    setLoading(true);
    setAction("walk");

    try {
      // Ruta corregida a /api/v1/fiorella/chat
      const res = await fetch("/api/v1/fiorella/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentUser?.id || "guest",
          user_name: currentUser?.name || "Usuario",
          message: text,
          active_module: pathKey(),
        }),
      });

      if (!res.ok) throw new Error("Error en la respuesta del servidor");

      const data = await res.json();

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "fiorella",
        text: data.respuesta || "Solicitud procesada con éxito.",
      };

      setMessages((prev) => [...(Array.isArray(prev) ? prev : []), aiMsg]);
      setAction(data.animacion || "point");
    } catch (err) {
      setMessages((prev) => [
        ...(Array.isArray(prev) ? prev : []),
        {
          id: Date.now().toString(),
          sender: "fiorella",
          text: "Ocurrió una desconexión momentánea con el servidor de IA.",
        },
      ]);
      setAction("idle");
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
      messages={Array.isArray(messages) ? messages : []}
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