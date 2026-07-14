export type {
  MaterialRegion,
  MaterialRegionManifest,
  MaterialRegionSource,
} from "./materialRegions.js";
export {
  createLinkedInRegionManifest,
  createMaterialRegionManifest,
  listRegionMaterials,
  validateMaterialRegionManifest,
} from "./materialRegions.js";
export type {
  FeelableMaterialBehavior,
  FeelableMaterialConfig,
  MaterialEventKind,
  MaterialKind,
} from "./materials/materialPresets.js";
export {
  getMaterialConfig,
  getMaterialKind,
  getMaterialPreset,
  isMaterialKind,
  materialConfigs,
  materialPresets,
} from "./materials/materialPresets.js";
export type { ContactHistory, ContactPoint } from "./math/contactHistory.js";
export {
  addContact,
  createContactHistory,
  stepContactHistory,
} from "./math/contactHistory.js";
export { gaussianInfluence } from "./math/gaussianDrift.js";
export {
  getMaterialHapticPattern,
  materialHaptics,
  shouldTriggerMaterialHaptic,
  triggerMaterialHaptic,
} from "./math/haptics.js";
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
  createPokeModel,
  createPokeState,
  getMaterialEventKind,
  getMaterialResponse,
  getPokeInfluence,
  getPokeVelocity,
  releasePoke,
  stepPoke,
  updatePokeModel,
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
