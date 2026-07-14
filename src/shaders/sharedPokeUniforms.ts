import type { PokeState } from "../math/pokeModel.js";

export type PokeUniforms = {
  uPoke: { value: [number, number, number] };
  uPokeVelocity: { value: [number, number] };
  uSmudge: { value: number };
};

export function createPokeUniforms(state?: PokeState): PokeUniforms {
  return syncPokeUniforms(
    {
      uPoke: { value: [0.5, 0.5, 0] },
      uPokeVelocity: { value: [0, 0] },
      uSmudge: { value: 0 },
    },
    state,
  );
}

export function syncPokeUniforms(
  uniforms: PokeUniforms,
  state: PokeState | undefined,
) {
  if (!state) return uniforms;

  uniforms.uPoke.value[0] = state.x;
  uniforms.uPoke.value[1] = state.y;
  uniforms.uPoke.value[2] = state.pressure;
  uniforms.uPokeVelocity.value[0] = state.x - state.previousX;
  uniforms.uPokeVelocity.value[1] = state.y - state.previousY;
  uniforms.uSmudge.value = state.stains;

  return uniforms;
}
