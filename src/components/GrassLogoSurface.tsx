import { createElement, type ReactNode, useMemo } from "react";
import {
  createGrassBladeInstances,
  type GrassBladeOptions,
} from "../math/pokeModel.js";
import { resolveGrassBladeCount } from "../math/reducedMotionSurface.js";
import { FeelableSurface } from "./FeelableSurface.js";

export type GrassLogoSurfaceProps = GrassBladeOptions & {
  children?: ReactNode | undefined;
  ariaLabel?: string | undefined;
  reducedMotion?: boolean | undefined;
};

export function GrassLogoSurface({
  children,
  ariaLabel,
  reducedMotion,
  count: rawCount,
  mask,
  seed,
}: GrassLogoSurfaceProps) {
  const count = resolveGrassBladeCount(rawCount, reducedMotion);
  const blades = useMemo(
    () => createGrassBladeInstances({ count, mask, seed }),
    [count, mask, seed],
  );

  return createElement(
    FeelableSurface,
    {
      material: "grass",
      ariaLabel,
      reducedMotion,
      userData: { grassBlades: blades },
    },
    createElement(
      "instancedMesh",
      {
        args: [undefined, undefined, blades.length],
        frustumCulled: false,
        userData: { grassBlades: blades },
      },
      children,
    ),
  );
}
