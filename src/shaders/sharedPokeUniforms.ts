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

  uniforms.uPoke.value = [state.x, state.y, state.pressure];
  uniforms.uPokeVelocity.value = [
    state.x - state.previousX,
    state.y - state.previousY,
  ];
  uniforms.uSmudge.value = state.smudge;

  return uniforms;
}
