export type MaterialKind = "cloth" | "rubber" | "glass" | "grass" | "mail";
export type FeelableMaterialBehavior = "crease" | "squish" | "smudge" | "bend";

export type FeelableMaterialConfig = {
  kind: MaterialKind;
  behavior: FeelableMaterialBehavior;
  pointerResponse: true;
  pressBoost: number;
  decay: number;
  radius: number;
  deformation: number;
  elasticity: number;
  smear: number;
  roughness: number;
  bladeCount: number;
};

export const materialPresets: Record<MaterialKind, FeelableMaterialConfig> = {
  cloth: {
    kind: "cloth",
    behavior: "crease",
    pointerResponse: true,
    pressBoost: 1.4,
    decay: 0.86,
    radius: 0.28,
    deformation: 0.72,
    elasticity: 0.34,
    smear: 0.06,
    roughness: 0.45,
    bladeCount: 0,
  },
  rubber: {
    kind: "rubber",
    behavior: "squish",
    pointerResponse: true,
    pressBoost: 1.75,
    decay: 0.78,
    radius: 0.34,
    deformation: 0.9,
    elasticity: 0.86,
    smear: 0.02,
    roughness: 0.32,
    bladeCount: 0,
  },
  glass: {
    kind: "glass",
    behavior: "smudge",
    pointerResponse: true,
    pressBoost: 1.15,
    decay: 0.94,
    radius: 0.22,
    deformation: 0.22,
    elasticity: 0.18,
    smear: 0.64,
    roughness: 0.08,
    bladeCount: 0,
  },
  grass: {
    kind: "grass",
    behavior: "bend",
    pointerResponse: true,
    pressBoost: 1.55,
    decay: 0.82,
    radius: 0.3,
    deformation: 0.7,
    elasticity: 0.62,
    smear: 0.05,
    roughness: 0.72,
    bladeCount: 420,
  },
  mail: {
    kind: "mail",
    behavior: "bend",
    pointerResponse: true,
    pressBoost: 1.55,
    decay: 0.82,
    radius: 0.26,
    deformation: 0.58,
    elasticity: 0.5,
    smear: 0.04,
    roughness: 0.4,
    bladeCount: 0,
  },
};

export function isMaterialKind(value: string): value is MaterialKind {
  return value in materialPresets;
}

export function getMaterialPreset(
  material: MaterialKind | FeelableMaterialConfig,
) {
  return typeof material === "string" ? materialPresets[material] : material;
}
