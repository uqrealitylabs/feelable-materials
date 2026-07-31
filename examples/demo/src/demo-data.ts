import type { MaterialKind } from "../../../dist/index.js";

export type Quality = "low" | "standard" | "high";
export type DemoMaterial = MaterialKind;

export const qualityCounts: Record<Quality, number> = { low: 180, standard: 420, high: 720 };
export const materialItems: Array<{ id: DemoMaterial; label: string; detail: string }> = [
  { id: "cloth", label: "Cloth", detail: "broad press + slow return" },
  { id: "rubber", label: "Rubber", detail: "deep press + quick return" },
  { id: "glass", label: "Glass", detail: "smudge + hard surface" },
  { id: "grass", label: "Grass", detail: "masked blade field" },
  { id: "mail", label: "Mail", detail: "shallow press + return" },
  { id: "enamel", label: "Enamel", detail: "tight gloss response" },
];
