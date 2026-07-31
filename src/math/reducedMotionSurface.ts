import { materialPresets } from "../materials/materialPresets.js";

const MAX_GRASS_BLADE_COUNT = 100_000;

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
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    count > MAX_GRASS_BLADE_COUNT
  )
    throw new RangeError(
      `grass blade count must be an integer between 0 and ${MAX_GRASS_BLADE_COUNT}`,
    );
  const { bladeCountScale } = resolveReducedMotionSurface(reducedMotion);
  return Math.round(count * bladeCountScale);
}
