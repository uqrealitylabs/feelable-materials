import type { PokeState } from "../math/pokeModel.js";

export type PokeUniforms = {
  uPoke: { value: [number, number, number] };
  uPokeVelocity: { value: [number, number] };
  uSmudge: { value: number };
  uSmudgePosition: { value: [number, number] };
};

export function createPokeUniforms(state?: PokeState): PokeUniforms {
  return syncPokeUniforms(
    {
      uPoke: { value: [0.5, 0.5, 0] },
      uPokeVelocity: { value: [0, 0] },
      uSmudge: { value: 0 },
      uSmudgePosition: { value: [0.5, 0.5] },
    },
    state,
  );
}

export function syncPokeUniforms(
  uniforms: PokeUniforms,
  state: PokeState | undefined,
  velocity?: { x: number; y: number } | undefined,
) {
  if (!state) return uniforms;

  uniforms.uPoke.value[0] = state.x;
  uniforms.uPoke.value[1] = state.y;
  uniforms.uPoke.value[2] = state.pressure;
  uniforms.uPokeVelocity.value[0] = velocity?.x ?? state.x - state.previousX;
  uniforms.uPokeVelocity.value[1] = velocity?.y ?? state.y - state.previousY;
  if (
    state.stains > uniforms.uSmudge.value ||
    (state.active && state.targetPressure > 0.55)
  ) {
    uniforms.uSmudgePosition.value[0] = state.x;
    uniforms.uSmudgePosition.value[1] = state.y;
  }
  uniforms.uSmudge.value = state.stains;

  return uniforms;
}
