import { useFrame } from "@react-three/fiber";
import { createElement, type ReactNode, useRef } from "react";
import {
  type UsePokeSurfaceOptions,
  usePokeSurface,
} from "../hooks/usePokeSurface.js";
import {
  type FeelableMaterialConfig,
  getMaterialPreset,
  type MaterialKind,
} from "../materials/materialPresets.js";
import { getMaterialResponse, type PokeState } from "../math/pokeModel.js";

type MutableMesh = {
  scale: { set: (x: number, y: number, z: number) => void };
  position: { z: number };
  userData: Record<string, unknown>;
};

const noopMesh: MutableMesh = {
  scale: { set() {} },
  position: { z: 0 },
  userData: {},
};

export type FeelableSurfaceProps = UsePokeSurfaceOptions & {
  material: MaterialKind | FeelableMaterialConfig;
  children?: ReactNode | undefined;
  userData?: Record<string, unknown> | undefined;
  ariaLabel?: string | undefined;
};

export function applyFeelableMeshResponse(
  mesh: MutableMesh,
  config: FeelableMaterialConfig,
  state: PokeState,
) {
  const response = getMaterialResponse(config, state);
  mesh.scale.set(
    1 + response.bulge * 0.08,
    1 + response.bulge * 0.08,
    Math.max(0.92, 1 - response.depression * 0.1),
  );
  mesh.position.z = response.highlight * 0.015 - response.contactShadow * 0.01;
  mesh.userData.feelableResponse = response;
}

export function FeelableSurface({
  material,
  children,
  userData,
  ariaLabel,
  ...options
}: FeelableSurfaceProps) {
  const poke = usePokeSurface(material, options);
  const config = getMaterialPreset(material);
  const meshRef = useRef<MutableMesh>(noopMesh);
  useFrame((_state, delta) => {
    poke.step(delta * 1000);
    applyFeelableMeshResponse(meshRef.current, config, poke.stateRef.current);
  });

  return createElement(
    "mesh",
    {
      ref: meshRef,
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
