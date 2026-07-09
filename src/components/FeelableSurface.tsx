import { useFrame } from "@react-three/fiber";
import { createElement, type ReactNode } from "react";
import {
  type UsePokeSurfaceOptions,
  usePokeSurface,
} from "../hooks/usePokeSurface.js";
import {
  type FeelableMaterialConfig,
  getMaterialPreset,
  type MaterialKind,
} from "../materials/materialPresets.js";

export type FeelableSurfaceProps = UsePokeSurfaceOptions & {
  material: MaterialKind | FeelableMaterialConfig;
  children?: ReactNode | undefined;
  userData?: Record<string, unknown> | undefined;
  ariaLabel?: string | undefined;
};

export function FeelableSurface({
  material,
  children,
  userData,
  ariaLabel,
  ...options
}: FeelableSurfaceProps) {
  const poke = usePokeSurface(material, options);
  const config = getMaterialPreset(material);
  useFrame(poke.step);

  return createElement(
    "mesh",
    {
      ...poke.handlers,
      "aria-label": ariaLabel,
      userData: {
        feelableMaterial: config.kind,
        pokeState: poke.stateRef.current,
        pokeUniforms: poke.uniformsRef.current,
        ...userData,
      },
    },
    children,
  );
}
