import type { MeshPhysicalMaterialParameters } from "three";
import type { MaterialKind } from "../../../dist/index.js";

export const materialItems = [
  {
    id: "velvet",
    material: "cloth",
    label: "Orange velvet",
    detail: "woven drape + broad press",
    finish: {
      color: "#b83b12",
      roughness: 0.76,
      sheen: 1,
      sheenColor: "#ff7138",
      sheenRoughness: 0.76,
      anisotropy: 0.35,
    },
  },
  {
    id: "satin",
    material: "cloth",
    label: "Satin",
    detail: "fine weave + directional sheen",
    finish: {
      color: "#7777ef",
      roughness: 0.28,
      sheen: 0.75,
      sheenColor: "#e0e4ff",
      sheenRoughness: 0.3,
      anisotropy: 0.65,
    },
  },
  {
    id: "silicone",
    material: "rubber",
    label: "Silicone",
    detail: "deep press + quick return",
    finish: { color: "#ff7168", roughness: 0.55 },
  },
  {
    id: "gel",
    material: "rubber",
    label: "Translucent gel",
    detail: "soft return + coloured transmission",
    finish: {
      color: "#ff8b69",
      roughness: 0.16,
      transmission: 0.72,
      thickness: 1.2,
      ior: 1.42,
      attenuationColor: "#ff4c56",
      attenuationDistance: 1.4,
      clearcoat: 0.35,
      clearcoatRoughness: 0.12,
    },
  },
  {
    id: "glass",
    material: "glass",
    label: "Frosted glass",
    detail: "thin transmission + fading smudge",
    finish: {
      color: "#d8fbff",
      roughness: 0.18,
      transmission: 0.9,
      ior: 1.45,
    },
  },
  {
    id: "turf",
    material: "grass",
    label: "Turf",
    detail: "rooted tapered blade field",
    finish: { color: "#4f9548", roughness: 0.88 },
  },
  {
    id: "aluminium",
    material: "mail",
    label: "Brushed aluminium",
    detail: "shallow flex + anisotropic metal",
    finish: {
      color: "#d8d9dc",
      roughness: 0.3,
      metalness: 1,
      anisotropy: 0.72,
    },
  },
  {
    id: "ceramic",
    material: "enamel",
    label: "Glazed ceramic",
    detail: "hard body + clear glaze",
    finish: {
      color: "#fff3d2",
      roughness: 0.42,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
    },
  },
  {
    id: "jade",
    material: "enamel",
    label: "Polished jade",
    detail: "hard contact + subsurface colour",
    finish: {
      color: "#5ea77b",
      roughness: 0.24,
      transmission: 0.32,
      thickness: 1.6,
      ior: 1.61,
      attenuationColor: "#176344",
      attenuationDistance: 0.55,
      clearcoat: 0.55,
      clearcoatRoughness: 0.1,
    },
  },
  {
    id: "holographic",
    material: "mail",
    label: "Holographic foil",
    detail: "shallow flex + iridescent metal",
    finish: {
      color: "#d9ccff",
      roughness: 0.26,
      metalness: 1,
      iridescence: 1,
      iridescenceIOR: 1.8,
    },
  },
] as const satisfies ReadonlyArray<{
  id: string;
  material: MaterialKind;
  label: string;
  detail: string;
  finish: MeshPhysicalMaterialParameters & {
    color: string;
    roughness: number;
  };
}>;

export type DemoMaterialItem = (typeof materialItems)[number];
export type DemoMaterial = DemoMaterialItem["id"];
