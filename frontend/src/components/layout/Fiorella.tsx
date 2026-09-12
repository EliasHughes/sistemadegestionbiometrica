import { useEffect, useRef, useState } from "react";
import anime from "animejs";

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

export default function Fiorella() {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [hidden, setHidden] = useState(() => localStorage.getItem("hide-fiorella") === "1");
  const [src, setSrc] = useState("/fiorella-idle.png");
  const [line, setLine] = useState("¡Hola! Soy Fiorella.");
  const live = useRef(true);

  useEffect(() => {
    if (hidden) return;
    const talk = () => setLine(pick(TALK[pathKey()] || TALK.default));
    talk();
    const id = window.setInterval(talk, 8000);
    return () => window.clearInterval(id);
  }, [hidden]);

  useEffect(() => {
    if (hidden) return;
    live.current = true;
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return;

    const maxX = () => Math.max(60, window.innerWidth - 180);

    const idle = () => {
      setSrc("/fiorella-idle.png");
      anime({
        targets: img,
        translateY: [0, -8, 0],
        duration: 1800,
        easing: "easeInOutSine",
        complete: () => live.current && next(),
      });
    };

    const walk = () => {
      setSrc("/fiorella-walk.png");
      const to = 20 + Math.random() * maxX();
      const from = parseFloat(stage.style.left || "40");
      img.style.transform = to >= from ? "scaleX(1)" : "scaleX(-1)";
      anime({
        targets: stage,
        left: to,
        duration: 2600 + Math.random() * 1400,
        easing: "easeInOutQuad",
        complete: () => live.current && next(),
      });
    };

    const jump = () => {
      setSrc("/fiorella-jump.png");
      anime({
        targets: img,
        translateY: [0, -48, 0],
        duration: 700,
        easing: "easeOutQuad",
        complete: () => live.current && next(),
      });
    };

    const point = () => {
      setSrc("/fiorella-point.png");
      anime({
        targets: img,
        rotate: [0, 4, 0],
        duration: 1400,
        easing: "easeInOutSine",
        complete: () => live.current && next(),
      });
    };

    const next = () => {
      const r = Math.random();
      if (r < 0.34) walk();
      else if (r < 0.58) idle();
      else if (r < 0.80) point();
      else jump();
    };

    stage.style.left = "48px";
    idle();

    return () => {
      live.current = false;
      anime.remove(stage);
      anime.remove(img);
    };
  }, [hidden]);

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
    <div ref={stageRef} className="fiorella-stage" style={{ left: 48 }}>
      <div className="fiorella-bubble">
        <div className="flex justify-between gap-2">
          <b className="text-[#c8102e]">Fiorella</b>
          <button
            type="button"
            className="text-zinc-400 text-xs"
            onClick={() => {
              localStorage.setItem("hide-fiorella", "1");
              setHidden(true);
            }}
          >
            ×
          </button>
        </div>
        <p className="mt-1">{line}</p>
      </div>
      <img
        ref={imgRef}
        src={src}
        alt="Fiorella"
        className="fiorella-sprite"
        draggable={false}
        onError={() => setSrc("/5hpmW.jpg")}
        onClick={() => {
          setSrc("/fiorella-jump.png");
          setLine(pick(TALK[pathKey()] || TALK.default));
          if (imgRef.current) {
            anime({ targets: imgRef.current, translateY: [0, -48, 0], duration: 600, easing: "easeOutQuad" });
          }
        }}
      />
    </div>
  );
}