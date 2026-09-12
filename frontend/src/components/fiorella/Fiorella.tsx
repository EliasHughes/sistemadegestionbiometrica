// frontend/src/components/fiorella/Fiorella.tsx
import { useState } from "react";
import { motion } from "motion/react";
import { SPRITE_MAP, FALLBACK_SPRITE } from "./types";
import { spriteMotion, reducedSpriteMotion } from "./animations";
import type { FiorellaAction } from "./types";
import "./Fiorella.css";

type FiorellaProps = {
  action: FiorellaAction;
  x: number;
  facing: 1 | -1;
  line: string;
  reducedMotion: boolean;
  /** Sección 6.3 del plan: delante o detrás de los widgets del dashboard. */
  layer?: "front" | "behind";
  onSpriteClick: () => void;
  onHide: () => void;
};

/**
 * Componente base (sección 8 del plan). No decide nada por sí mismo:
 * solo dibuja el estado que le pasa FiorellaController.
 */
export default function Fiorella({
  action,
  x,
  facing,
  line,
  reducedMotion,
  layer = "front",
  onSpriteClick,
  onHide,
}: FiorellaProps) {
  const [broken, setBroken] = useState(false);
  const src = broken ? FALLBACK_SPRITE : SPRITE_MAP[action];
  const motionTarget = reducedMotion ? reducedSpriteMotion[action] : spriteMotion[action];

  return (
    <motion.div
      className={`fiorella-stage${layer === "behind" ? " fiorella-behind" : ""}`}
      animate={{ x }}
      transition={{ duration: reducedMotion ? 0.3 : 2.2, ease: "easeInOut" }}
    >
      <div className="fiorella-bubble">
        <div className="flex justify-between gap-2">
          <b className="text-[#c8102e]">Fiorella</b>
          <button type="button" className="text-zinc-400 text-xs" onClick={onHide}>
            ×
          </button>
        </div>
        <p className="mt-1">{line}</p>
      </div>
      <motion.img
        key={action}
        src={src}
        alt="Fiorella"
        className="fiorella-sprite"
        draggable={false}
        animate={motionTarget}
        style={{ scaleX: facing }}
        onError={() => setBroken(true)}
        onClick={onSpriteClick}
      />
    </motion.div>
  );
}
