import { useEffect, useRef, useState } from "react";

function base64ToBytes(value: string) {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export default function FiorellaVoice() {
  const socket = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    return () => socket.current?.close();
  }, []);

  async function start() {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/api/v1/fiorella/live`);
    socket.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "output_transcript") {
        setTranscript((old) => `${old} ${msg.text}`.trim());
      }

      if (msg.type === "audio") {
        // El backend entrega PCM. Para producción usa AudioWorklet para reproducir
        // PCM continuamente sin convertir cada paquete a WAV.
        // Esta UI deja el canal preparado.
        const bytes = base64ToBytes(msg.data);
        console.debug("Fiorella audio bytes:", bytes.length);
      }
    };
  }

  function sendText(text: string) {
    socket.current?.send(JSON.stringify({ type: "text", text }));
  }

  function stop() {
    socket.current?.send(JSON.stringify({ type: "close" }));
    socket.current?.close();
    socket.current = null;
  }

  return (
    <div>
      <button onClick={connected ? stop : start}>
        {connected ? "Detener voz" : "Hablar con Fiorella"}
      </button>
      <button
        disabled={!connected}
        onClick={() => sendText("Hola Fiorella, dime qué puedes hacer.")}
      >
        Probar voz
      </button>
      <p>{transcript}</p>
    </div>
  );
}
