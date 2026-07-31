import type { MaterialEventKind } from "../materials/materialPresets.js";
import { clamp } from "./numbers.js";

const MAX_CONTACT_POINTS = 10_000;

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
  const maxPoints = options.maxPoints ?? 8;
  const fadeMs = options.fadeMs ?? 1400;
  if (
    !Number.isSafeInteger(maxPoints) ||
    maxPoints < 0 ||
    maxPoints > MAX_CONTACT_POINTS
  )
    throw new RangeError(
      `maxPoints must be an integer between 0 and ${MAX_CONTACT_POINTS}`,
    );
  if (!Number.isFinite(fadeMs) || fadeMs < 0)
    throw new RangeError("fadeMs must be a finite non-negative number");
  return {
    points: [],
    maxPoints,
    fadeMs,
  };
}

export function addContact(
  history: ContactHistory,
  point: { x: number; y: number; velocity?: [number, number] },
  strength: number,
  eventKind: MaterialEventKind,
) {
  history.points.unshift({
    uv: [clamp(point.x, 0, 1), clamp(point.y, 0, 1)],
    age: 0,
    pressure: clamp(strength, 0, 1),
    velocity: (point.velocity ?? [0, 0]).map((value) =>
      Number.isFinite(value) ? value : 0,
    ) as [number, number],
    phase: toContactPhase(eventKind),
  });
  history.points.length = Math.min(history.points.length, history.maxPoints);

  return history;
}

export function stepContactHistory(history: ContactHistory, deltaMs: number) {
  const elapsedMs = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 0;
  history.points.forEach((point) => {
    point.age += elapsedMs;
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
