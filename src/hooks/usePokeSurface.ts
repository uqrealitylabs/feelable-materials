import { useCallback, useMemo, useRef } from "react";
import {
  type FeelableMaterialConfig,
  getMaterialPreset,
  type MaterialKind,
} from "../materials/materialPresets.js";
import { type PointerUvEvent, readPointerUv } from "../math/pointerUv.js";
import {
  applyPoke,
  createPokeState,
  type PokeState,
  releasePoke,
  stepPoke,
} from "../math/pokeModel.js";
import { resolveReducedMotionSurface } from "../math/reducedMotionSurface.js";
import {
  createPokeUniforms,
  syncPokeUniforms,
} from "../shaders/sharedPokeUniforms.js";

export type UsePokeSurfaceOptions = {
  hoverPressure?: number | undefined;
  pressPressure?: number | undefined;
  reducedMotion?: boolean | undefined;
  initialState?: Partial<PokeState> | undefined;
};

export function usePokeSurface(
  material: MaterialKind | FeelableMaterialConfig,
  options: UsePokeSurfaceOptions = {},
) {
  const config = getMaterialPreset(material);
  const stateRef = useRef(createPokeState(options.initialState));
  const uniformsRef = useRef(createPokeUniforms(stateRef.current));
  const reduced = resolveReducedMotionSurface(options.reducedMotion);

  const pokeAt = useCallback(
    (event: PointerUvEvent, pressure: number) => {
      if (reduced.reducedMotion) return;

      const uv = readPointerUv(event);
      applyPoke(stateRef.current, uv.x, uv.y, pressure * reduced.pressureScale);
      syncPokeUniforms(uniformsRef.current, stateRef.current);
    },
    [reduced.pressureScale, reduced.reducedMotion],
  );

  const handlers = useMemo(
    () => ({
      onPointerMove: (event: PointerUvEvent) =>
        pokeAt(event, options.hoverPressure ?? 0.25),
      onPointerDown: (event: PointerUvEvent) =>
        pokeAt(event, options.pressPressure ?? 1),
      onPointerUp: () => releasePoke(stateRef.current),
      onPointerLeave: () => releasePoke(stateRef.current),
    }),
    [options.hoverPressure, options.pressPressure, pokeAt],
  );

  return {
    config,
    stateRef,
    uniformsRef,
    handlers,
    step: (deltaMs = 16.67) => {
      stepPoke(stateRef.current, config, deltaMs);
      syncPokeUniforms(uniformsRef.current, stateRef.current);
      return stateRef.current;
    },
  };
}
