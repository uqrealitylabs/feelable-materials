import { createElement, type ReactNode } from "react";
import type {
  FeelableMaterialConfig,
  MaterialKind,
} from "../materials/materialPresets.js";
import { FeelableSurface } from "./FeelableSurface.js";

export type FeelableMaterialCardProps = {
  material: MaterialKind | FeelableMaterialConfig;
  logo?: ReactNode | undefined;
  underline?: boolean | undefined;
  ariaLabel: string;
  reducedMotion?: boolean | undefined;
};

export function FeelableMaterialCard({
  material,
  logo,
  underline = false,
  ariaLabel,
  reducedMotion = false,
}: FeelableMaterialCardProps) {
  return createElement(
    "group",
    { userData: { ariaLabel } },
    createElement(
      FeelableSurface,
      { material, ariaLabel, reducedMotion },
      logo,
      underline
        ? createElement("mesh", {
            userData: { feelableUnderline: true },
          })
        : null,
    ),
  );
}
