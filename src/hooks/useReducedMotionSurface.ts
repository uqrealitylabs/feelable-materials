import { useMemo } from "react";
import { resolveReducedMotionSurface } from "../math/reducedMotionSurface.js";

export function useReducedMotionSurface(reducedMotion = false) {
  return useMemo(
    () => resolveReducedMotionSurface(reducedMotion),
    [reducedMotion],
  );
}
