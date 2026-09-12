import type { TargetAndTransition } from "motion/react";
import type { FiorellaAction } from "./types";

/**
 * Movimientos orgánicos para imagen estática usando física de resorte, 
 * squash & stretch simétrico y aceleraciones tipo anticipación/impacto.
 */
export const spriteMotion: Record<FiorellaAction, TargetAndTransition> = {
  idle: {
    y: [0, -5, 0],
    scaleY: [1, 1.03, 0.98, 1],
    scaleX: [1, 0.97, 1.02, 1],
    transition: {
      duration: 2.2,
      repeat: Infinity,
      ease: [0.45, 0.05, 0.55, 0.95],
    },
  },

  walk: {
    y: [0, -8, -1, -6, 0],
    rotate: [-2.5, 3, -1.5, 2.5, -2.5],
    scaleY: [0.96, 1.05, 0.95, 1.04, 0.96],
    scaleX: [1.04, 0.95, 1.05, 0.96, 1.04],
    transition: {
      duration: 0.75,
      repeat: Infinity,
      ease: [0.36, 0, 0.66, 1],
    },
  },

  jump: {
    y: [0, 8, -45, -2, 0],
    scaleY: [1, 0.82, 1.18, 0.92, 1],
    scaleX: [1, 1.18, 0.85, 1.08, 1],
    transition: {
      duration: 0.65,
      times: [0, 0.15, 0.55, 0.85, 1],
      ease: [0.22, 1, 0.36, 1],
    },
  },

  point: {
    rotate: [0, -4, 6, -2, 0],
    scale: [1, 1.03, 0.98, 1],
    transition: {
      duration: 0.9,
      ease: "backOut",
    },
  },

  wave: {
    rotate: [0, -12, 10, -8, 6, 0],
    scaleY: [1, 1.02, 0.98, 1],
    transition: {
      duration: 1.1,
      ease: [0.34, 1.56, 0.64, 1],
    },
  },

  celebrate: {
    y: [0, 5, -28, 0, -12, 0],
    scaleY: [1, 0.85, 1.15, 0.9, 1.05, 1],
    scaleX: [1, 1.15, 0.88, 1.1, 0.95, 1],
    rotate: [0, -3, 3, -2, 1, 0],
    transition: {
      duration: 1.1,
      times: [0, 0.12, 0.45, 0.7, 0.85, 1],
      ease: [0.175, 0.885, 0.32, 1.275],
    },
  },

  surprised: {
    scaleY: [1, 0.75, 1.22, 0.95, 1],
    scaleX: [1, 1.25, 0.82, 1.05, 1],
    y: [0, 6, -16, -2, 0],
    transition: {
      duration: 0.5,
      times: [0, 0.15, 0.45, 0.8, 1],
      ease: "backOut",
    },
  },

  sleep: {
    y: [0, 3, 0],
    scaleY: [1, 0.97, 1],
    scaleX: [1, 1.03, 1],
    rotate: [0, 2, 0],
    opacity: [1, 0.85, 1],
    transition: {
      duration: 3.5,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },

  think: {
    rotate: [0, 5, 3, 5, 0],
    y: [0, -3, -1, -3, 0],
    scale: [1, 1.02, 1, 1.02, 1],
    transition: {
      duration: 2.8,
      repeat: Infinity,
      ease: [0.45, 0.05, 0.55, 0.95],
    },
  },

  alert: {
    scale: [1, 1.12, 0.96, 1.04, 1],
    rotate: [0, -6, 6, -3, 0],
    transition: {
      duration: 0.45,
      ease: [0.68, -0.55, 0.265, 1.55],
    },
  },

  peek: {
    x: [-20, 0, -2, 0],
    scaleX: [0.9, 1.05, 0.98, 1],
    transition: {
      duration: 0.7,
      ease: "backOut",
    },
  },

  hide: {
    opacity: [1, 0],
    scale: [1, 0.85],
    y: [0, 10],
    transition: {
      duration: 0.35,
      ease: "easeIn",
    },
  },
};

export const reducedSpriteMotion: Record<FiorellaAction, TargetAndTransition> = {
  idle: { opacity: 1 },
  walk: { opacity: 1 },
  jump: { opacity: 1 },
  point: { opacity: 1 },
  wave: { opacity: 1 },
  celebrate: { opacity: 1 },
  surprised: { opacity: 1 },
  sleep: { opacity: 0.8 },
  think: { opacity: 1 },
  alert: { opacity: 1 },
  peek: { opacity: 1 },
  hide: { opacity: 0 },
};