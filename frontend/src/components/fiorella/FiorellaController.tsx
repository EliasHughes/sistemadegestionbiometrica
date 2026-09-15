import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import Fiorella, {
  ChatMessage,
} from "./Fiorella";

import {
  FiorellaBehaviorEngine,
} from "./FiorellaBehavior";

import type {
  FiorellaAction,
  FiorellaEvents,
} from "./types";

import {
  api,
} from "../../lib/api";


const TALK: Record<string, string[]> = {
  "/login": [
    "¡Hola! Pon usuario y clave.",
    "Te espero aquí.",
  ],

  "/dashboard": [
    "Miro el tablero contigo.",
    "Si el semáforo se pone rojo, salto.",
    "Un vistazo a los relojes.",
  ],

  "/records": [
    "Estos ponches salen de SQL.",
    "Sin salida = turno abierto.",
  ],

  "/devices": [
    "Ping verde = respiro.",
    "Sin IP no hay SDK.",
  ],

  "/collaborators": [
    "Ficha primero, reloj después.",
    "Dry-run antes de copiar huellas.",
  ],

  "/export": [
    "Excel para analizar, PDF para firmar.",
  ],

  default: [
    "Camino un rato y descanso.",
    "Clic y salto. La x me esconde.",
  ],
};


function currentModule(): string {
  return window.location.pathname || "/dashboard";
}


function talkKey(): string {
  const path = currentModule();

  return TALK[path]
    ? path
    : "default";
}


function pick(
  arr: string[],
): string {
  return arr[
    Math.floor(
      Math.random() * arr.length,
    )
  ];
}


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


type StoredUser = {
  id?: string | number;
  usuario_id?: string | number;
  username?: string;
  nombre?: string;
  name?: string;
};


type FiorellaChatResponse = {
  respuesta?: string;
  animacion?: FiorellaAction;

  conversation_id?: number;

  accion?: string | null;
  ruta?: string | null;

  requires_confirmation?: boolean;
  action_id?: string | null;

  tools_used?: string[];

  [key: string]: unknown;
};


export default function FiorellaController({
  events = {},
}: FiorellaControllerProps) {

  const [hidden, setHidden] = useState(
    () =>
      localStorage.getItem(
        "hide-fiorella",
      ) === "1",
  );

  const [action, setAction] =
    useState<FiorellaAction>("idle");

  const [x, setX] = useState(48);

  const [facing, setFacing] =
    useState<1 | -1>(1);

  const [line, setLine] =
    useState(
      "¡Hola! Soy Fiorella.",
    );

  const [
    isChatOpen,
    setIsChatOpen,
  ] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    messages,
    setMessages,
  ] = useState<ChatMessage[]>([]);

  const [
    currentUser,
    setCurrentUser,
  ] = useState<{
    id: string;
    name: string;
  } | null>(null);

  /*
   * conversationId es la memoria lógica del chat.
   *
   * El backend devuelve este ID y debemos enviarlo de nuevo
   * en cada mensaje siguiente.
   */
  const [
    conversationId,
    setConversationId,
  ] = useState<number | null>(null);


  const engine = useRef(
    new FiorellaBehaviorEngine(),
  );

  const tabHidden =
    useRef(false);


  const reducedMotion = useMemo(
    () =>
      window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches ?? false,
    [],
  );


  // ============================================================
  // CARGAR USUARIO Y MEMORIA LOCAL
  // ============================================================

  useEffect(() => {

    const rawUser =
      localStorage.getItem("user")
      || localStorage.getItem("auth_user");

    let activeUser: {
      id: string;
      name: string;
    } = {
      id: "guest",
      name: "Usuario",
    };


    if (rawUser) {
      try {
        const parsed =
          JSON.parse(rawUser) as StoredUser;

        activeUser = {
          id: String(
            parsed.id
            ?? parsed.usuario_id
            ?? parsed.username
            ?? "user_1",
          ),

          name: String(
            parsed.nombre
            ?? parsed.name
            ?? parsed.username
            ?? "Usuario",
          ),
        };

      } catch {
        console.warn(
          "Fiorella: datos de usuario inválidos en localStorage.",
        );
      }
    }


    setCurrentUser(activeUser);


    // ----------------------------------------------------------
    // Historial visual local
    // ----------------------------------------------------------

    const sessionKey =
      `fiorella_session_${activeUser.id}`;

    const localHistory =
      localStorage.getItem(sessionKey);

    let parsedMessages:
      ChatMessage[] = [];


    if (localHistory) {
      try {
        const parsed =
          JSON.parse(localHistory);

        if (Array.isArray(parsed)) {
          parsedMessages = parsed;
        }

      } catch {
        parsedMessages = [];
      }
    }


    if (
      parsedMessages.length > 0
    ) {
      setMessages(
        parsedMessages,
      );

    } else {
      setMessages([
        {
          id: "init",
          sender: "fiorella",
          text:
            `¡Hola ${activeUser.name}! `
            + "Estoy lista para ayudarte en "
            + `el módulo ${currentModule()}. `
            + "¿Qué deseas realizar?",
        },
      ]);
    }


    // ----------------------------------------------------------
    // Recuperar conversation_id del backend
    // ----------------------------------------------------------

    const conversationKey =
      `fiorella_conversation_${activeUser.id}`;

    const storedConversation =
      localStorage.getItem(
        conversationKey,
      );

    if (storedConversation) {
      const parsedId =
        Number(storedConversation);

      if (
        Number.isInteger(parsedId)
        && parsedId > 0
      ) {
        setConversationId(
          parsedId,
        );
      }
    }

  }, []);


  // ============================================================
  // GUARDAR HISTORIAL VISUAL LOCAL
  // ============================================================

  useEffect(() => {

    if (
      currentUser
      && messages.length > 0
    ) {
      localStorage.setItem(
        `fiorella_session_${currentUser.id}`,
        JSON.stringify(
          messages.slice(-30),
        ),
      );
    }

  }, [
    messages,
    currentUser,
  ]);


  // ============================================================
  // GUARDAR ID DE CONVERSACIÓN
  // ============================================================

  useEffect(() => {

    if (
      !currentUser
      || !conversationId
    ) {
      return;
    }

    localStorage.setItem(
      `fiorella_conversation_${currentUser.id}`,
      String(conversationId),
    );

  }, [
    conversationId,
    currentUser,
  ]);


  // ============================================================
  // FRASES CONTEXTUALES
  // ============================================================

  useEffect(() => {

    if (
      hidden
      || isChatOpen
    ) {
      return;
    }


    const talk = () => {
      setLine(
        pick(
          TALK[talkKey()]
          || TALK.default,
        ),
      );
    };


    talk();

    const timer =
      window.setInterval(
        talk,
        8000,
      );


    return () =>
      window.clearInterval(
        timer,
      );

  }, [
    hidden,
    isChatOpen,
  ]);


  // ============================================================
  // VISIBILIDAD DE PESTAÑA
  // ============================================================

  useEffect(() => {

    const onVisibility = () => {
      tabHidden.current =
        document.hidden;
    };


    document.addEventListener(
      "visibilitychange",
      onVisibility,
    );


    return () =>
      document.removeEventListener(
        "visibilitychange",
        onVisibility,
      );

  }, []);


  // ============================================================
  // COMPORTAMIENTO / ANIMACIÓN
  // ============================================================

  useEffect(() => {

    if (
      hidden
      || isChatOpen
    ) {
      return;
    }


    let cancelled = false;
    let timer = 0;


    const maxX = () =>
      Math.max(
        60,
        window.innerWidth - 180,
      );


    const wander =
      (): FiorellaAction =>
        WANDER_POOL[
          Math.floor(
            Math.random()
            * WANDER_POOL.length,
          )
        ];


    const tick = () => {

      if (cancelled) {
        return;
      }


      if (
        !tabHidden.current
      ) {
        const next =
          engine.current.decide(
            events,
            wander,
          );

        setAction(next);


        if (
          next === "walk"
          && !reducedMotion
        ) {
          setX(
            (prevX) => {

              const target =
                20
                + Math.random()
                * maxX();

              setFacing(
                target >= prevX
                  ? 1
                  : -1,
              );

              return target;
            },
          );
        }
      }


      const delay =
        reducedMotion
          ? 2500
          : 900
            + Math.random()
            * 600;


      timer =
        window.setTimeout(
          tick,
          delay,
        );
    };


    timer =
      window.setTimeout(
        tick,
        200,
      );


    return () => {
      cancelled = true;

      window.clearTimeout(
        timer,
      );
    };

  }, [
    events,
    hidden,
    reducedMotion,
    isChatOpen,
  ]);


  // ============================================================
  // ABRIR / CERRAR CHAT
  // ============================================================

  const toggleChat = () => {

    const nextState =
      !isChatOpen;

    setIsChatOpen(
      nextState,
    );

    setAction(
      nextState
        ? "point"
        : "idle",
    );
  };


  // ============================================================
  // ENVIAR MENSAJE A FASTAPI / GEMINI
  // ============================================================

  const handleSendMessage =
    async (
      text: string,
    ) => {

      const trimmed =
        text.trim();


      if (
        !trimmed
        || loading
      ) {
        return;
      }


      const userMsg:
        ChatMessage = {
          id: `${Date.now()}-user`,
          sender: "user",
          text: trimmed,
        };


      setMessages(
        (prev) => [
          ...prev,
          userMsg,
        ],
      );


      setLoading(true);
      setAction("walk");


      try {

        /*
         * Endpoint REAL:
         *
         * main.py:
         *   prefix="/api/v1"
         *
         * fiorella.py:
         *   @router.post("/chat")
         *
         * Resultado:
         *   POST /api/v1/chat
         *
         * api() agrega automáticamente:
         * Authorization: Bearer <access_token>
         */
        const data =
          await api<FiorellaChatResponse>(
            "/api/v1/chat",
            {
              method: "POST",

              body: JSON.stringify({
                message:
                  trimmed,

                active_module:
                  currentModule(),

                conversation_id:
                  conversationId,
              }),
            },
          );


        // ------------------------------------------------------
        // MEMORIA
        // ------------------------------------------------------

        if (
          data.conversation_id
        ) {
          setConversationId(
            Number(
              data.conversation_id,
            ),
          );
        }


        // ------------------------------------------------------
        // RESPUESTA VISUAL
        // ------------------------------------------------------

        const responseText =
          typeof data.respuesta
            === "string"
          && data.respuesta.trim()
            ? data.respuesta
            : "Solicitud procesada con éxito.";


        const aiMsg:
          ChatMessage = {
            id:
              `${Date.now()}-fiorella`,

            sender:
              "fiorella",

            text:
              responseText,
          };


        setMessages(
          (prev) => [
            ...prev,
            aiMsg,
          ],
        );


        // ------------------------------------------------------
        // ANIMACIÓN
        // ------------------------------------------------------

        if (
          data.animacion
        ) {
          setAction(
            data.animacion,
          );

        } else {
          setAction(
            "point",
          );
        }


        // ------------------------------------------------------
        // DEBUG DE HERRAMIENTAS
        // ------------------------------------------------------

        if (
          Array.isArray(
            data.tools_used,
          )
          && data.tools_used.length
        ) {
          console.info(
            "Fiorella tools:",
            data.tools_used,
          );
        }


        // ------------------------------------------------------
        // ACCIÓN QUE REQUIERE CONFIRMACIÓN
        // ------------------------------------------------------

        if (
          data.requires_confirmation
          && data.action_id
        ) {
          console.info(
            "Fiorella requiere confirmación:",
            data.action_id,
          );
        }


      } catch (err) {

        console.error(
          "Fiorella chat error:",
          err,
        );


        let errorMessage =
          "Ocurrió una desconexión momentánea con el servidor de IA.";


        if (
          err instanceof Error
        ) {

          if (
            err.message.includes(
              "401",
            )
            || err.message
              .toLowerCase()
              .includes(
                "credenciales",
              )
          ) {
            errorMessage =
              "Tu sesión expiró. Inicia sesión nuevamente.";

          } else {
            errorMessage =
              `No pude completar la solicitud: ${err.message}`;
          }
        }


        setMessages(
          (prev) => [
            ...prev,

            {
              id:
                `${Date.now()}-error`,

              sender:
                "fiorella",

              text:
                errorMessage,
            },
          ],
        );


        setAction(
          "alert",
        );

      } finally {

        setLoading(
          false,
        );
      }
    };


  // ============================================================
  // FIORELLA OCULTA
  // ============================================================

  if (hidden) {
    return (
      <button
        type="button"

        className="
          fixed
          bottom-4
          right-4
          z-[60]
          rounded-full
          bg-[#c8102e]
          text-white
          text-xs
          font-semibold
          px-3
          py-2
          shadow-lg
          hover:bg-[#a11e30]
        "

        onClick={() => {
          localStorage.removeItem(
            "hide-fiorella",
          );

          setHidden(false);
        }}
      >
        💬 Fiorella
      </button>
    );
  }


  // ============================================================
  // RENDER PRINCIPAL
  // ============================================================

  return (
    <Fiorella
      action={action}

      x={x}

      facing={
        facing === -1
          ? "left"
          : "right"
      }

      line={line}

      reducedMotion={
        reducedMotion
      }

      onSpriteClick={
        toggleChat
      }

      onHide={() => {

        localStorage.setItem(
          "hide-fiorella",
          "1",
        );

        setHidden(
          true,
        );
      }}

      isChatOpen={
        isChatOpen
      }

      messages={
        messages
      }

      loading={
        loading
      }

      activeModule={
        currentModule()
      }

      onSendMessage={
        handleSendMessage
      }

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