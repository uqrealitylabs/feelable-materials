import type {
  MaterialEventKind,
  MaterialKind,
} from "../materials/materialPresets.js";
import { clamp } from "./numbers.js";

export const materialHaptics: Record<
  MaterialKind,
  Partial<Record<MaterialEventKind, number[]>>
> = {
  glass: {
    contact: [8],
    fastSwipe: [4, 16, 4],
    wipe: [4, 16, 4],
    release: [3],
  },
  enamel: { contact: [4], press: [5], release: [2] },
  cloth: { press: [12], damage: [8, 20, 8] },
  rubber: { press: [18, 25, 18], damage: [5, 8, 5, 8, 5] },
  grass: { contact: [3, 10, 3], cut: [10] },
  mail: { contact: [10, 20, 10], press: [12, 18, 12] },
};

export type VibrationLike = {
  vibrate: (pattern: number | number[]) => boolean;
};

export type HapticOptions = {
  navigator?: VibrationLike;
  reducedMotion?: boolean;
};

export function shouldTriggerMaterialHaptic(
  lastAt: number,
  now: number,
  intervalMs = 180,
) {
  return now - lastAt >= Math.max(0, intervalMs);
}

export function getMaterialHapticPattern(
  material: MaterialKind,
  eventKind: MaterialEventKind,
  intensity = 1,
) {
  const pattern = materialHaptics[material][eventKind] ?? [];
  const scale = clamp(intensity, 0, 1);
  if (scale === 0) return [];

  return pattern.map((duration) => Math.max(1, Math.round(duration * scale)));
}

export function triggerMaterialHaptic(
  material: MaterialKind,
  eventKind: MaterialEventKind,
  intensity = 1,
  options: HapticOptions = {},
) {
  if (options.reducedMotion) return false;
  if (typeof options.navigator?.vibrate !== "function") return false;
  const pattern = getMaterialHapticPattern(material, eventKind, intensity);
  if (pattern.length === 0) return false;

  try {
    return options.navigator.vibrate(pattern);
  } catch {
    return false;
  }
}
