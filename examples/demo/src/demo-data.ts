import type { MaterialKind } from "../../../dist/index.js";

export type Quality = "low" | "standard" | "high";
export type DemoMaterial = MaterialKind | "regions";

export const qualityCounts: Record<Quality, number> = { low: 180, standard: 420, high: 720 };
export const materialItems: Array<{ id: DemoMaterial; label: string; detail: string }> = [
  { id: "cloth", label: "Cloth", detail: "crease + slow return" },
  { id: "rubber", label: "Rubber", detail: "compression + rebound" },
  { id: "glass", label: "Glass", detail: "smudge + hard surface" },
  { id: "mail", label: "Mail / grass", detail: "masked blade field" },
  { id: "enamel", label: "Enamel", detail: "tight gloss response" },
  { id: "regions", label: "Glass × enamel", detail: "shared contact, split response" },
];
