export type {
  FeelableMaterialBehavior,
  FeelableMaterialConfig,
  MaterialKind,
} from "./materials/materialPresets.js";
export {
  getMaterialPreset,
  isMaterialKind,
  materialPresets,
} from "./materials/materialPresets.js";
export { gaussianInfluence } from "./math/gaussianDrift.js";
export type { PointerUvEvent } from "./math/pointerUv.js";
export { readPointerUv } from "./math/pointerUv.js";
export type {
  GrassBladeInstance,
  GrassBladeOptions,
  PokeState,
} from "./math/pokeModel.js";
export {
  applyPoke,
  createGrassBladeInstances,
  createPokeState,
  getMaterialResponse,
  getPokeInfluence,
  getPokeVelocity,
  releasePoke,
  stepPoke,
} from "./math/pokeModel.js";
export {
  resolveGrassBladeCount,
  resolveReducedMotionSurface,
} from "./math/reducedMotionSurface.js";
export type { PokeUniforms } from "./shaders/sharedPokeUniforms.js";
export {
  createPokeUniforms,
  syncPokeUniforms,
} from "./shaders/sharedPokeUniforms.js";
