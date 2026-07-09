import { materialPresets } from "../materials/materialPresets.js";

export function resolveReducedMotionSurface(reducedMotion = false) {
  return {
    reducedMotion,
    pressureScale: reducedMotion ? 0 : 1,
    bladeCountScale: reducedMotion ? 0.25 : 1,
  };
}

export function resolveGrassBladeCount(
  count = materialPresets.grass.bladeCount,
  reducedMotion = false,
) {
  const { bladeCountScale } = resolveReducedMotionSurface(reducedMotion);
  return Math.max(1, Math.round(count * bladeCountScale));
}
