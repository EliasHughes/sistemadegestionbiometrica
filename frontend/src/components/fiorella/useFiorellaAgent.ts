import { useCallback, useState } from "react";

export type FiorellaAction =
  | { type: "navigate"; route: string }
  | { type: "download_report"; format: "excel" | "pdf"; url?: string }
  | { type: "show_chart"; title: string; data: unknown[] }
  | { type: "confirm_action"; action_id: string; preview: unknown };

export interface FiorellaResponse {
  respuesta: string;
  animacion?: string;
  action?: FiorellaAction | null;
  conversation_id?: number;
  tools_used?: string[];
}

export function useFiorellaAgent(accessToken: string | null) {
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);

  const send = useCallback(
    async (message: string, activeModule: string): Promise<FiorellaResponse> => {
      if (!accessToken) throw new Error("Sesión no autenticada");

      setLoading(true);
      try {
        const res = await fetch("/api/v1/fiorella/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            message,
            active_module: activeModule,
            conversation_id: conversationId,
          }),
        });

        if (!res.ok) throw new Error(`Fiorella HTTP ${res.status}`);

        const data: FiorellaResponse = await res.json();
        if (data.conversation_id) setConversationId(data.conversation_id);
        return data;
      } finally {
        setLoading(false);
      }
    },
    [accessToken, conversationId],
  );

  const confirm = useCallback(
    async (actionId: string) => {
      if (!accessToken) throw new Error("Sesión no autenticada");

      const res = await fetch(`/api/v1/fiorella/confirm/${actionId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) throw new Error(`Confirmación HTTP ${res.status}`);
      return res.json();
    },
    [accessToken],
  );

  const navigateAction = (action: FiorellaAction | null | undefined, navigate: (path: string) => void) => {
    if (action?.type === "navigate") {
      navigate(action.route);
    }
  };

  return { send, confirm, navigateAction, loading, conversationId };
}
