import type { MaterialEventKind } from "../materials/materialPresets.js";

export type ContactPoint = {
  uv: [number, number];
  pressure: number;
  velocity: [number, number];
  age: number;
  phase: "hover" | "press" | "drag" | "release";
};

export type ContactHistory = {
  points: ContactPoint[];
  maxPoints: number;
  fadeMs: number;
};

export function createContactHistory(
  options: { maxPoints?: number; fadeMs?: number } = {},
): ContactHistory {
  return {
    points: [],
    maxPoints: options.maxPoints ?? 8,
    fadeMs: options.fadeMs ?? 1400,
  };
}

export function addContact(
  history: ContactHistory,
  point: { x: number; y: number; velocity?: [number, number] },
  strength: number,
  eventKind: MaterialEventKind,
) {
  history.points.unshift({
    uv: [point.x, point.y],
    age: 0,
    pressure: Math.max(0, Math.min(1, strength)),
    velocity: point.velocity ?? [0, 0],
    phase: toContactPhase(eventKind),
  });
  history.points.length = Math.min(history.points.length, history.maxPoints);

  return history;
}

export function stepContactHistory(history: ContactHistory, deltaMs: number) {
  history.points.forEach((point) => {
    point.age += Math.max(0, deltaMs);
  });
  history.points = history.points.filter((point) => point.age < history.fadeMs);

  return history;
}

function toContactPhase(eventKind: MaterialEventKind): ContactPoint["phase"] {
  if (eventKind === "hover") return "hover";
  if (eventKind === "release") return "release";
  if (eventKind === "press" || eventKind === "contact") return "press";
  return "drag";
}
