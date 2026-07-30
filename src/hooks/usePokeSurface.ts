import { useThree } from "@react-three/fiber";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  getMaterialConfig,
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
  material: MaterialKind,
  options: UsePokeSurfaceOptions = {},
) {
  const invalidate = useThree((state) => state.invalidate);
  const eventTarget = useThree(
    (state) => state.events.connected ?? state.gl.domElement,
  );
  const config = getMaterialConfig(material);
  const stateRef = useRef(createPokeState(options.initialState));
  const uniformsRef = useRef(createPokeUniforms(stateRef.current));
  const previousMaterialRef = useRef(material);
  const pressedPointerRef = useRef<number | null>(null);
  const captureTargetRef = useRef<PointerUvEvent["target"]>(undefined);
  const reduced = resolveReducedMotionSurface(options.reducedMotion);

  useLayoutEffect(() => {
    if (previousMaterialRef.current === material) return;
    previousMaterialRef.current = material;
    const state = stateRef.current;
    state.stains = 0;
    state.scratches = 0;
    state.cuts = 0;
    syncPokeUniforms(uniformsRef.current, state);
    invalidate();
  }, [invalidate, material]);

  const pokeAt = useCallback(
    (event: PointerUvEvent, pressure: number) => {
      const uv = readPointerUv(event);
      applyPoke(stateRef.current, uv.x, uv.y, pressure * reduced.pressureScale);
      syncPokeUniforms(uniformsRef.current, stateRef.current);
      invalidate();
    },
    [invalidate, reduced.pressureScale],
  );

  const release = useCallback(
    (event?: PointerUvEvent) => {
      const pressed = pressedPointerRef.current;
      const pointerId = event?.pointerId ?? pressed ?? 0;
      if (
        pressed !== null &&
        event?.pointerId !== undefined &&
        pointerId !== pressed
      )
        return;
      if (pressed !== null) event?.stopPropagation?.();
      try {
        captureTargetRef.current?.releasePointerCapture?.(pointerId);
      } catch {
        // Capture can already be gone after browser cancellation.
      }
      pressedPointerRef.current = null;
      captureTargetRef.current = undefined;
      releasePoke(stateRef.current);
      syncPokeUniforms(uniformsRef.current, stateRef.current);
      invalidate();
    },
    [invalidate],
  );

  useEffect(() => {
    const releaseNativePointer = (event: PointerEvent) => {
      if (event.pointerId === pressedPointerRef.current)
        release({ pointerId: event.pointerId });
    };
    eventTarget.addEventListener("pointercancel", releaseNativePointer);
    eventTarget.addEventListener("lostpointercapture", releaseNativePointer);
    return () => {
      eventTarget.removeEventListener("pointercancel", releaseNativePointer);
      eventTarget.removeEventListener(
        "lostpointercapture",
        releaseNativePointer,
      );
    };
  }, [eventTarget, release]);

  useEffect(() => {
    if (!reduced.reducedMotion) return;
    release();
    stateRef.current.pressure = 0;
    stateRef.current.previousX = stateRef.current.x;
    stateRef.current.previousY = stateRef.current.y;
    syncPokeUniforms(uniformsRef.current, stateRef.current);
  }, [reduced.reducedMotion, release]);

  const handlers = useMemo(
    () => ({
      onPointerMove: (event: PointerUvEvent) => {
        if (reduced.reducedMotion) return;
        const pressed = pressedPointerRef.current;
        if (pressed !== null && (event.pointerId ?? 0) !== pressed) return;
        event.stopPropagation?.();
        pokeAt(
          event,
          pressed === null
            ? Math.min(options.hoverPressure ?? 0.25, 0.55)
            : (options.pressPressure ?? 1),
        );
      },
      onPointerDown: (event: PointerUvEvent) => {
        if (reduced.reducedMotion) return;
        const pointerId = event.pointerId ?? 0;
        if (
          pressedPointerRef.current !== null &&
          pressedPointerRef.current !== pointerId
        )
          return;
        event.stopPropagation?.();
        pressedPointerRef.current = pointerId;
        captureTargetRef.current = undefined;
        try {
          if (event.target?.setPointerCapture) {
            event.target.setPointerCapture(pointerId);
            captureTargetRef.current = event.target;
          }
        } catch {
          captureTargetRef.current = undefined;
        }
        pokeAt(event, options.pressPressure ?? 1);
      },
      onPointerUp: release,
      onPointerCancel: release,
      onLostPointerCapture: release,
      onPointerLeave: (event?: PointerUvEvent) => {
        if (!captureTargetRef.current) return release(event);
        if (
          event?.pointerId !== undefined &&
          event.pointerId !== pressedPointerRef.current
        )
          return;
        event?.stopPropagation?.();
      },
    }),
    [
      options.hoverPressure,
      options.pressPressure,
      pokeAt,
      reduced.reducedMotion,
      release,
    ],
  );

  return {
    config,
    stateRef,
    uniformsRef,
    handlers,
    step: (deltaMs = 16.67) => {
      if (reduced.reducedMotion) return stateRef.current;
      const velocity = stepPoke(stateRef.current, config, deltaMs);
      syncPokeUniforms(uniformsRef.current, stateRef.current, velocity);
      const state = stateRef.current;
      const stainChanging =
        config.kind === "glass" && state.targetPressure > 0.55
          ? state.stains < 1
          : state.stains > 0;
      if (
        Math.abs(state.pressure - state.targetPressure) >= 0.001 ||
        stainChanging
      )
        invalidate();
      return stateRef.current;
    },
  };
}
