// frontend/src/components/fiorella/FiorellaController.tsx

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
  getToken,
} from "../../lib/api";


// ============================================================
// FRASES SEGÚN MÓDULO
// ============================================================

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

  "/export": [
    "Excel para analizar, PDF para presentar.",
  ],

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


// ============================================================
// TIPOS
// ============================================================

type FiorellaControllerProps = {
  events?: FiorellaEvents;
};


type StoredUser = {
  id?: string | number;
  usuario_id?: string | number;

  username?: string;

  nombre?: string;
  name?: string;

  role?: string;
};


type FiorellaChatResponse = {
  respuesta?: string;

  animacion?: FiorellaAction;

  conversation_id?: number | null;

  tools_used?: string[];

  model_used?: string;

  error?: string | null;

  requires_confirmation?: boolean;

  action_id?: string | null;

  action?: {
    type?: string;
    route?: string;
    [key: string]: unknown;
  } | null;
};


// ============================================================
// HELPERS
// ============================================================

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
  values: string[],
): string {

  if (!values.length) {
    return "";
  }

  return values[
    Math.floor(
      Math.random() * values.length,
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


// ============================================================
// COMPONENTE
// ============================================================

export default function FiorellaController({
  events = {},
}: FiorellaControllerProps) {

  const [
    hidden,
    setHidden,
  ] = useState<boolean>(
    () =>
      localStorage.getItem(
        "hide-fiorella",
      ) === "1",
  );


  const [
    action,
    setAction,
  ] = useState<FiorellaAction>(
    "idle",
  );


  const [
    x,
    setX,
  ] = useState<number>(
    48,
  );


  const [
    facing,
    setFacing,
  ] = useState<1 | -1>(
    1,
  );


  const [
    line,
    setLine,
  ] = useState<string>(
    "¡Hola! Soy Fiorella.",
  );


  const [
    isChatOpen,
    setIsChatOpen,
  ] = useState<boolean>(
    false,
  );


  const [
    loading,
    setLoading,
  ] = useState<boolean>(
    false,
  );


  const [
    messages,
    setMessages,
  ] = useState<ChatMessage[]>(
    [],
  );


  const [
    currentUser,
    setCurrentUser,
  ] = useState<{
    id: string;
    name: string;
  } | null>(
    null,
  );


  // ==========================================================
  // ID DE CONVERSACIÓN
  // ==========================================================

  const [
    conversationId,
    setConversationId,
  ] = useState<number | null>(
    null,
  );


  const engine = useRef(
    new FiorellaBehaviorEngine(),
  );


  const tabHidden = useRef<boolean>(
    false,
  );


  const reducedMotion = useMemo(
    () =>
      window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches ?? false,
    [],
  );


  // ==========================================================
  // CARGAR USUARIO / SESIÓN
  // ==========================================================

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
          JSON.parse(
            rawUser,
          ) as StoredUser;


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

      } catch (error) {

        console.warn(
          "Fiorella: no se pudo leer el usuario almacenado.",
          error,
        );
      }
    }


    setCurrentUser(
      activeUser,
    );


    // --------------------------------------------------------
    // HISTORIAL VISUAL LOCAL
    // --------------------------------------------------------

    const sessionKey =
      `fiorella_session_${activeUser.id}`;


    const localHistory =
      localStorage.getItem(
        sessionKey,
      );


    let parsedMessages:
      ChatMessage[] = [];


    if (localHistory) {

      try {

        const parsed =
          JSON.parse(
            localHistory,
          );


        if (
          Array.isArray(
            parsed,
          )
        ) {

          parsedMessages =
            parsed;
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
            + "Estoy lista para ayudarte. "
            + `Estás en ${currentModule()}.`,
        },
      ]);
    }


    // --------------------------------------------------------
    // RECUPERAR CONVERSACIÓN
    // --------------------------------------------------------

    const conversationKey =
      `fiorella_conversation_${activeUser.id}`;


    const storedConversation =
      localStorage.getItem(
        conversationKey,
      );


    if (storedConversation) {

      const parsedId =
        Number(
          storedConversation,
        );


      if (
        Number.isInteger(
          parsedId,
        )
        && parsedId > 0
      ) {

        setConversationId(
          parsedId,
        );
      }
    }

  }, []);


  // ==========================================================
  // GUARDAR MENSAJES LOCALMENTE
  // ==========================================================

  useEffect(() => {

    if (
      !currentUser
      || messages.length === 0
    ) {
      return;
    }


    localStorage.setItem(
      `fiorella_session_${currentUser.id}`,
      JSON.stringify(
        messages.slice(
          -30,
        ),
      ),
    );

  }, [
    messages,
    currentUser,
  ]);


  // ==========================================================
  // GUARDAR conversation_id
  // ==========================================================

  useEffect(() => {

    if (
      !currentUser
    ) {
      return;
    }


    const key =
      `fiorella_conversation_${currentUser.id}`;


    if (
      conversationId
    ) {

      localStorage.setItem(
        key,
        String(
          conversationId,
        ),
      );

    } else {

      localStorage.removeItem(
        key,
      );
    }

  }, [
    conversationId,
    currentUser,
  ]);


  // ==========================================================
  // FRASES CONTEXTUALES
  // ==========================================================

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
          TALK[
            talkKey()
          ]
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


    return () => {

      window.clearInterval(
        timer,
      );
    };

  }, [
    hidden,
    isChatOpen,
  ]);


  // ==========================================================
  // VISIBILIDAD DE PESTAÑA
  // ==========================================================

  useEffect(() => {

    const onVisibility =
      () => {

        tabHidden.current =
          document.hidden;
      };


    document.addEventListener(
      "visibilitychange",
      onVisibility,
    );


    return () => {

      document.removeEventListener(
        "visibilitychange",
        onVisibility,
      );
    };

  }, []);


  // ==========================================================
  // COMPORTAMIENTO DE FIORELLA
  // ==========================================================

  useEffect(() => {

    if (
      hidden
      || isChatOpen
    ) {
      return;
    }


    let cancelled =
      false;


    let timer =
      0;


    const maxX = () =>
      Math.max(
        60,
        window.innerWidth - 180,
      );


    const wander =
      (): FiorellaAction => {

        return WANDER_POOL[
          Math.floor(
            Math.random()
            * WANDER_POOL.length,
          )
        ];
      };


    const tick = () => {

      if (
        cancelled
      ) {
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


        setAction(
          next,
        );


        if (
          next === "walk"
          && !reducedMotion
        ) {

          setX(
            (
              previousX,
            ) => {

              const target =
                20
                + Math.random()
                * maxX();


              setFacing(
                target
                >= previousX
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

      cancelled =
        true;


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


  // ==========================================================
  // ABRIR / CERRAR CHAT
  // ==========================================================

  const toggleChat =
    () => {

      const next =
        !isChatOpen;


      setIsChatOpen(
        next,
      );


      setAction(
        next
          ? "point"
          : "idle",
      );
    };


  // ==========================================================
  // PROCESAR ACCIONES DEL BACKEND
  // ==========================================================

  const processBackendAction =
    (
      data:
        FiorellaChatResponse,
    ) => {

      const backendAction =
        data.action;


      if (
        !backendAction
      ) {
        return;
      }


      if (
        backendAction.type === "navigate"
        && typeof backendAction.route === "string"
      ) {

        const route =
          backendAction.route;


        if (
          route.startsWith("/")
        ) {

          window.history.pushState(
            {},
            "",
            route,
          );


          window.dispatchEvent(
            new PopStateEvent(
              "popstate",
            ),
          );
        }
      }
    };


  // ==========================================================
  // ENVIAR MENSAJE
  // ==========================================================

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


      // ------------------------------------------------------
      // VERIFICAR TOKEN
      // ------------------------------------------------------

      const token =
        getToken();


      if (
        !token
      ) {

        setMessages(
          (
            previous,
          ) => [
            ...previous,
            {
              id:
                `${Date.now()}-auth-error`,
              sender:
                "fiorella",
              text:
                "Tu sesión no está disponible. Inicia sesión nuevamente.",
            },
          ],
        );


        setAction(
          "alert",
        );


        return;
      }


      // ------------------------------------------------------
      // AGREGAR MENSAJE DE USUARIO
      // ------------------------------------------------------

      const userMessage:
        ChatMessage = {

          id:
            `${Date.now()}-user`,

          sender:
            "user",

          text:
            trimmed,
        };


      setMessages(
        (
          previous,
        ) => [
          ...previous,
          userMessage,
        ],
      );


      setLoading(
        true,
      );


      setAction(
        "think",
      );


      try {

        // ====================================================
        // ENDPOINT CORRECTO
        //
        // main.py:
        //   prefix="/api/v1"
        //
        // fiorella.py:
        //   @router.post("/chat")
        //
        // URL FINAL:
        //   /api/v1/chat
        // ====================================================

        const data =
          await api<FiorellaChatResponse>(
            "/api/v1/chat",
            {
              method:
                "POST",

              body:
                JSON.stringify({
                  message:
                    trimmed,

                  active_module:
                    currentModule(),

                  conversation_id:
                    conversationId,
                }),
            },
          );


        // ----------------------------------------------------
        // GUARDAR conversation_id
        // ----------------------------------------------------

        if (
          data.conversation_id
          && Number.isFinite(
            Number(
              data.conversation_id,
            ),
          )
        ) {

          setConversationId(
            Number(
              data.conversation_id,
            ),
          );
        }


        // ----------------------------------------------------
        // RESPUESTA
        // ----------------------------------------------------

        const responseText =
          typeof data.respuesta
            === "string"
          && data.respuesta.trim()
            ? data.respuesta
            : "Fiorella respondió sin contenido.";


        const aiMessage:
          ChatMessage = {

          id:
            `${Date.now()}-fiorella`,

          sender:
            "fiorella",

          text:
            responseText,
        };


        setMessages(
          (
            previous,
          ) => [
            ...previous,
            aiMessage,
          ],
        );


        // ----------------------------------------------------
        // ANIMACIÓN
        // ----------------------------------------------------

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


        // ----------------------------------------------------
        // DEBUG ÚTIL
        // ----------------------------------------------------

        console.info(
          "[Fiorella] respuesta:",
          {
            conversationId:
              data.conversation_id,

            model:
              data.model_used,

            tools:
              data.tools_used,

            error:
              data.error,

            action:
              data.action,
          },
        );


        // ----------------------------------------------------
        // ACCIONES DEL BACKEND
        // ----------------------------------------------------

        processBackendAction(
          data,
        );


        // ----------------------------------------------------
        // CONFIRMACIÓN
        // ----------------------------------------------------

        if (
          data.requires_confirmation
          && data.action_id
        ) {

          console.info(
            "[Fiorella] acción pendiente:",
            data.action_id,
          );
        }

      } catch (
        error
      ) {

        console.error(
          "[Fiorella] chat error:",
          error,
        );


        let message =
          "No pude comunicarme con el servidor de Fiorella.";


        if (
          error instanceof Error
        ) {

          message =
            error.message;


          if (
            message
              .toLowerCase()
              .includes(
                "401",
              )
            || message
              .toLowerCase()
              .includes(
                "credencial",
              )
          ) {

            message =
              "Tu sesión expiró. Inicia sesión nuevamente.";
          }


          if (
            message
              .toLowerCase()
              .includes(
                "gemini",
              )
          ) {

            message =
              `El backend respondió, pero Gemini no está disponible: ${message}`;
          }
        }


        setMessages(
          (
            previous,
          ) => [
            ...previous,

            {
              id:
                `${Date.now()}-error`,

              sender:
                "fiorella",

              text:
                message,
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


  // ==========================================================
  // FIORELLA OCULTA
  // ==========================================================

  if (
    hidden
  ) {

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


          setHidden(
            false,
          );
        }}
      >
        💬 Fiorella
      </button>
    );
  }


  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <Fiorella

      action={
        action
      }

      x={
        x
      }

      facing={
        facing === -1
          ? "left"
          : "right"
      }

      line={
        line
      }

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

        setIsChatOpen(
          false,
        );


        setAction(
          "idle",
        );
      }}

      onMinimizeChat={() => {

        setIsChatOpen(
          false,
        );


        setAction(
          "idle",
        );
      }}
    />
  );
}