// frontend/src/components/fiorella/useFiorellaChat.ts

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ChatMessage } from "./Fiorella";
import type { FiorellaAction } from "./types";
import { api, getToken } from "../../lib/api";

const FIORELLA_CHAT_IDLE_MS = 30 * 60 * 1000;
const FIORELLA_MAX_LOCAL_MESSAGES = 30;

type StoredUser = {
  id?: string | number;
  usuario_id?: string | number;
  username?: string;
  nombre?: string;
  name?: string;
  role?: string;
};

type ActiveUser = {
  id: string;
  name: string;
};

export type FiorellaChatResponse = {
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
  url?: string;
  filename?: string;
  [key: string]: unknown;
} | null;
};

type UseFiorellaChatOptions = {
  getActiveModule: () => string;
  onAnimation: (action: FiorellaAction) => void;
  onBackendAction?: (data: FiorellaChatResponse) => void;
};

function readActiveUser(): ActiveUser {
  const raw =
    localStorage.getItem("user") ||
    localStorage.getItem("auth_user");

  if (!raw) {
    return { id: "guest", name: "Usuario" };
  }

  try {
    const parsed = JSON.parse(raw) as StoredUser;

    return {
      id: String(
        parsed.id ??
          parsed.usuario_id ??
          parsed.username ??
          "user_1",
      ),
      name: String(
        parsed.nombre ??
          parsed.name ??
          parsed.username ??
          "Usuario",
      ),
    };
  } catch (error) {
    console.warn(
      "Fiorella: no se pudo leer el usuario almacenado.",
      error,
    );

    return { id: "guest", name: "Usuario" };
  }
}

function buildGreeting(
  user: ActiveUser,
  activeModule: string,
): ChatMessage {
  return {
    id: `init-${Date.now()}`,
    sender: "fiorella",
    text:
      `¡Hola ${user.name}! ` +
      "Estoy lista para ayudarte. " +
      `Estás en ${activeModule}.`,
  };
}

const sessionKey = (id: string) =>
  `fiorella_session_${id}`;

const activityKey = (id: string) =>
  `fiorella_last_activity_${id}`;

const conversationKey = (id: string) =>
  `fiorella_conversation_${id}`;

export function useFiorellaChat({
  getActiveModule,
  onAnimation,
  onBackendAction,
}: UseFiorellaChatOptions) {
  const [currentUser, setCurrentUser] =
    useState<ActiveUser | null>(null);

  const [messages, setMessages] =
    useState<ChatMessage[]>([]);

  const [loading, setLoading] =
    useState(false);

  const [conversationId, setConversationId] =
    useState<number | null>(null);

  const chatIdleTimer =
    useRef<number | null>(null);

  const cancelIdleTimer = useCallback(() => {
    if (chatIdleTimer.current !== null) {
      window.clearTimeout(chatIdleTimer.current);
      chatIdleTimer.current = null;
    }
  }, []);

  const removeStoredConversation = useCallback(
    (userId: string) => {
      localStorage.removeItem(sessionKey(userId));
      localStorage.removeItem(activityKey(userId));
      localStorage.removeItem(conversationKey(userId));
    },
    [],
  );

  const clearChat = useCallback(() => {
    cancelIdleTimer();

    if (currentUser) {
      removeStoredConversation(currentUser.id);
      setMessages([
        buildGreeting(
          currentUser,
          getActiveModule(),
        ),
      ]);
    } else {
      setMessages([]);
    }

    setConversationId(null);
    setLoading(false);
    onAnimation("idle");
  }, [
    cancelIdleTimer,
    currentUser,
    getActiveModule,
    onAnimation,
    removeStoredConversation,
  ]);

  const scheduleIdleCleanup = useCallback(
    (user: ActiveUser) => {
      cancelIdleTimer();

      localStorage.setItem(
        activityKey(user.id),
        String(Date.now()),
      );

      chatIdleTimer.current = window.setTimeout(
        () => {
          removeStoredConversation(user.id);
          setConversationId(null);
          setLoading(false);
          setMessages([
            buildGreeting(
              user,
              getActiveModule(),
            ),
          ]);
          onAnimation("idle");
          chatIdleTimer.current = null;
        },
        FIORELLA_CHAT_IDLE_MS,
      );
    },
    [
      cancelIdleTimer,
      getActiveModule,
      onAnimation,
      removeStoredConversation,
    ],
  );

  useEffect(() => {
    const activeUser = readActiveUser();
    setCurrentUser(activeUser);

    const storedHistory =
      localStorage.getItem(
        sessionKey(activeUser.id),
      );

    const lastActivityRaw =
      localStorage.getItem(
        activityKey(activeUser.id),
      );

    const lastActivity =
      lastActivityRaw
        ? Number(lastActivityRaw)
        : 0;

    const sessionExpired =
      lastActivity > 0 &&
      Date.now() - lastActivity >=
        FIORELLA_CHAT_IDLE_MS;

    let parsedMessages: ChatMessage[] = [];

    if (storedHistory && !sessionExpired) {
      try {
        const parsed = JSON.parse(storedHistory);
        if (Array.isArray(parsed)) {
          parsedMessages = parsed;
        }
      } catch {
        parsedMessages = [];
      }
    }

    if (parsedMessages.length > 0) {
      setMessages(parsedMessages);
    } else {
      if (sessionExpired) {
        removeStoredConversation(activeUser.id);
      }

      setMessages([
        buildGreeting(
          activeUser,
          getActiveModule(),
        ),
      ]);
    }

    const storedConversation =
      localStorage.getItem(
        conversationKey(activeUser.id),
      );

    if (storedConversation && !sessionExpired) {
      const parsedId = Number(storedConversation);

      if (
        Number.isInteger(parsedId) &&
        parsedId > 0
      ) {
        setConversationId(parsedId);
      }
    }

    if (!sessionExpired) {
      scheduleIdleCleanup(activeUser);
    }

    return cancelIdleTimer;
  }, [
    cancelIdleTimer,
    getActiveModule,
    removeStoredConversation,
    scheduleIdleCleanup,
  ]);

  useEffect(() => {
    if (!currentUser || messages.length === 0) {
      return;
    }

    localStorage.setItem(
      sessionKey(currentUser.id),
      JSON.stringify(
        messages.slice(
          -FIORELLA_MAX_LOCAL_MESSAGES,
        ),
      ),
    );
  }, [currentUser, messages]);

  useEffect(() => {
    if (!currentUser) return;

    const key = conversationKey(currentUser.id);

    if (conversationId) {
      localStorage.setItem(
        key,
        String(conversationId),
      );
    } else {
      localStorage.removeItem(key);
    }
  }, [conversationId, currentUser]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();

      if (!trimmed || loading) {
        return;
      }

      if (currentUser) {
        scheduleIdleCleanup(currentUser);
      }

      const token = getToken();

      if (!token) {
        setMessages((previous) => [
          ...previous,
          {
            id: `${Date.now()}-auth-error`,
            sender: "fiorella",
            text:
              "Tu sesión no está disponible. " +
              "Inicia sesión nuevamente.",
          },
        ]);

        onAnimation("alert");
        return;
      }

      const userMessage: ChatMessage = {
        id: `${Date.now()}-user`,
        sender: "user",
        text: trimmed,
      };

      setMessages((previous) => [
        ...previous,
        userMessage,
      ]);

      setLoading(true);
      onAnimation("think");

      try {
        const data =
          await api<FiorellaChatResponse>(
            "/api/v1/chat",
            {
              method: "POST",
              body: JSON.stringify({
                message: trimmed,
                active_module:
                  getActiveModule(),
                conversation_id:
                  conversationId,
              }),
            },
          );

        if (
          data.conversation_id &&
          Number.isFinite(
            Number(data.conversation_id),
          )
        ) {
          setConversationId(
            Number(data.conversation_id),
          );
        }

        const responseText =
          typeof data.respuesta === "string" &&
          data.respuesta.trim()
            ? data.respuesta
            : "Fiorella respondió sin contenido.";

        setMessages((previous) => [
          ...previous,
          {
            id: `${Date.now()}-fiorella`,
            sender: "fiorella",
            text: responseText,
          },
        ]);

        onAnimation(
          data.animacion || "point",
        );

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

        onBackendAction?.(data);

        if (
          data.requires_confirmation &&
          data.action_id
        ) {
          console.info(
            "[Fiorella] acción pendiente:",
            data.action_id,
          );
        }
      } catch (error) {
        console.error(
          "[Fiorella] chat error:",
          error,
        );

        let message =
          "No pude comunicarme con el servidor de Fiorella.";

        if (error instanceof Error) {
          const raw = error.message;
          const lower = raw.toLowerCase();

          if (
            lower.includes("401") ||
            lower.includes("credencial")
          ) {
            message =
              "Tu sesión expiró. " +
              "Inicia sesión nuevamente.";
          } else if (lower.includes("429")) {
            message =
              "OpenRouter alcanzó temporalmente " +
              "el límite de solicitudes. " +
              "Intenta nuevamente en unos segundos.";
          } else if (
            lower.includes("402") ||
            lower.includes("credit")
          ) {
            message =
              "OpenRouter no pudo procesar " +
              "la solicitud por disponibilidad " +
              "de crédito del proveedor.";
          } else if (
            lower.includes("timeout")
          ) {
            message =
              "OpenRouter tardó demasiado " +
              "en responder. Intenta nuevamente.";
          } else {
            message = raw;
          }
        }

        setMessages((previous) => [
          ...previous,
          {
            id: `${Date.now()}-error`,
            sender: "fiorella",
            text: message,
          },
        ]);

        onAnimation("alert");
      } finally {
        setLoading(false);
      }
    },
    [
      conversationId,
      currentUser,
      getActiveModule,
      loading,
      onAnimation,
      onBackendAction,
      scheduleIdleCleanup,
    ],
  );

  return {
    currentUser,
    messages,
    loading,
    conversationId,
    clearChat,
    sendMessage,
  };
}
