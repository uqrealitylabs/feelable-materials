export type MaterialKind =
  | "cloth"
  | "rubber"
  | "glass"
  | "grass"
  | "mail"
  | "enamel";
export type FeelableMaterialBehavior =
  | "crease"
  | "squish"
  | "smudge"
  | "bend"
  | "gloss";
export type MaterialEventKind =
  | "hover"
  | "contact"
  | "press"
  | "fastSwipe"
  | "wipe"
  | "damage"
  | "cut"
  | "release";

export type FeelableMaterialConfig = {
  kind: MaterialKind;
  behavior: FeelableMaterialBehavior;
  decay: number;
  radius: number;
  deformation: number;
  elasticity: number;
  smear: number;
  roughness: number;
  bladeCount: number;
  damageVelocity: number;
  cutVelocity: number;
  resistance: number;
};

export const materialPresets: Record<MaterialKind, FeelableMaterialConfig> = {
  cloth: {
    kind: "cloth",
    behavior: "crease",
    decay: 0.86,
    radius: 0.28,
    deformation: 0.72,
    elasticity: 0.34,
    smear: 0.06,
    roughness: 0.78,
    bladeCount: 0,
    damageVelocity: 0.42,
    cutVelocity: Number.POSITIVE_INFINITY,
    resistance: 0.28,
  },
  rubber: {
    kind: "rubber",
    behavior: "squish",
    decay: 0.78,
    radius: 0.34,
    deformation: 0.9,
    elasticity: 0.86,
    smear: 0.02,
    roughness: 0.62,
    bladeCount: 0,
    damageVelocity: 0.36,
    cutVelocity: Number.POSITIVE_INFINITY,
    resistance: 0.62,
  },
  glass: {
    kind: "glass",
    behavior: "smudge",
    decay: 0.94,
    radius: 0.22,
    deformation: 0,
    elasticity: 0.18,
    smear: 1,
    roughness: 0.08,
    bladeCount: 0,
    damageVelocity: Number.POSITIVE_INFINITY,
    cutVelocity: Number.POSITIVE_INFINITY,
    resistance: 0.08,
  },
  grass: {
    kind: "grass",
    behavior: "bend",
    decay: 0.82,
    radius: 0.3,
    deformation: 0.7,
    elasticity: 0.62,
    smear: 0.05,
    roughness: 0.72,
    bladeCount: 420,
    damageVelocity: Number.POSITIVE_INFINITY,
    cutVelocity: 0.32,
    resistance: 0.35,
  },
  mail: {
    kind: "mail",
    behavior: "bend",
    decay: 0.84,
    radius: 0.26,
    deformation: 0.38,
    elasticity: 0.5,
    smear: 0.12,
    roughness: 0.76,
    bladeCount: 0,
    damageVelocity: Number.POSITIVE_INFINITY,
    cutVelocity: Number.POSITIVE_INFINITY,
    resistance: 0.2,
  },
  enamel: {
    kind: "enamel",
    behavior: "gloss",
    decay: 0.9,
    radius: 0.18,
    deformation: 0.03,
    elasticity: 0.05,
    smear: 0.18,
    roughness: 0.12,
    bladeCount: 0,
    damageVelocity: Number.POSITIVE_INFINITY,
    cutVelocity: Number.POSITIVE_INFINITY,
    resistance: 0.04,
  },
};

export function isMaterialKind(value: unknown): value is MaterialKind {
  return typeof value === "string" && Object.hasOwn(materialPresets, value);
}

export function getMaterialKind(
  value: unknown = "",
  fallback: MaterialKind = "cloth",
): MaterialKind {
  const name = typeof value === "string" ? value.trim().toLowerCase() : "";

  return isMaterialKind(name)
    ? name
    : isMaterialKind(fallback)
      ? fallback
      : "cloth";
}

export function getMaterialConfig(
  value: unknown = "",
  fallback?: MaterialKind,
) {
  return materialPresets[getMaterialKind(value, fallback)];
}
