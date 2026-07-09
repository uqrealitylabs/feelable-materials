import { useCallback } from "react";
import { type PointerUvEvent, readPointerUv } from "../math/pointerUv.js";

export function usePointerUv() {
  return useCallback((event: PointerUvEvent) => readPointerUv(event), []);
}
