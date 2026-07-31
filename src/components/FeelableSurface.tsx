import { type ThreeElements, useFrame, useThree } from "@react-three/fiber";
import { createElement, type ReactNode, useEffect, useRef } from "react";
import {
  type UsePokeSurfaceOptions,
  usePokeSurface,
} from "../hooks/usePokeSurface.js";
import type { MaterialKind } from "../materials/materialPresets.js";
import type { PokeUniforms } from "../shaders/sharedPokeUniforms.js";

type CompiledShader = {
  uniforms: Record<string, unknown>;
  vertexShader: string;
  fragmentShader: string;
};

type MaterialLike = {
  isMaterial?: boolean | undefined;
  needsUpdate: boolean;
  onBeforeCompile: (shader: CompiledShader, renderer: unknown) => void;
  [feelablePatch]?: MaterialLike["onBeforeCompile"] | undefined;
};

type MaterialObject = {
  material?: unknown;
  children?: MaterialObject[];
  geometry?: {
    attributes?: { normal?: unknown; position?: unknown; uv?: unknown };
  };
  userData?: Record<string, unknown>;
};

type MeshLike = MaterialObject;
type MaterialPatches = Map<MaterialLike, () => void>;

type FeelableShaderUniforms = {
  uFeelablePoke: PokeUniforms["uPoke"];
  uFeelableRadius: { value: number };
  uFeelableDepth: { value: number };
  uFeelableTint: { value: number };
  uFeelableSmudge: PokeUniforms["uSmudge"];
};

const BEGIN_VERTEX = "#include <begin_vertex>";
const COLOR_FRAGMENT = "#include <color_fragment>";
const feelablePatch = Symbol("feelable-material-patch");

export type FeelableSurfaceProps = UsePokeSurfaceOptions & {
  material: MaterialKind;
  children?: ReactNode | undefined;
  meshProps?:
    | Omit<
        ThreeElements["mesh"],
        | "children"
        | "material"
        | "onLostPointerCapture"
        | "onPointerCancel"
        | "onPointerDown"
        | "onPointerLeave"
        | "onPointerMove"
        | "onPointerUp"
        | "ref"
        | "userData"
      >
    | undefined;
  userData?: Record<string, unknown> | undefined;
};

export function patchFeelableMaterial(
  material: MaterialLike,
  uniforms: FeelableShaderUniforms,
) {
  if (material[feelablePatch])
    throw new Error("material is already owned by a feelable surface");
  const original = material.onBeforeCompile;
  const patched: MaterialLike["onBeforeCompile"] = (shader, renderer) => {
    original.call(material, shader, renderer);
    const vertex = shader.vertexShader.includes(BEGIN_VERTEX);
    if (!vertex) return;
    const fragment = shader.fragmentShader.includes(COLOR_FRAGMENT);

    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `
uniform vec3 uFeelablePoke;
uniform float uFeelableRadius;
uniform float uFeelableDepth;
varying vec2 vFeelableUv;
${shader.vertexShader.replace(
  BEGIN_VERTEX,
  `${BEGIN_VERTEX}
vec2 feelableUv = uv;
float feelableTip = 1.0;
#ifdef USE_INSTANCING
  feelableUv = instanceMatrix[3].xy + 0.5;
  feelableTip = uv.y;
#endif
vFeelableUv = feelableUv;
vec2 feelableDelta = feelableUv - uFeelablePoke.xy;
float feelableInfluence = exp(-dot(feelableDelta, feelableDelta) / pow(max(uFeelableRadius, 0.0001), 2.0) * 2.4) * uFeelablePoke.z;
transformed -= normal * feelableInfluence * uFeelableDepth * feelableTip;`,
)}`;
    if (fragment)
      shader.fragmentShader = `
uniform vec3 uFeelablePoke;
uniform float uFeelableRadius;
uniform float uFeelableDepth;
uniform float uFeelableTint;
uniform float uFeelableSmudge;
varying vec2 vFeelableUv;
${shader.fragmentShader.replace(
  COLOR_FRAGMENT,
  `${COLOR_FRAGMENT}
float feelableDistance = distance(vFeelableUv, uFeelablePoke.xy);
float feelableContact = exp(-pow(feelableDistance / max(uFeelableRadius, 0.0001), 2.0) * 2.4) * uFeelablePoke.z;
float feelableMark = exp(-pow(feelableDistance / max(uFeelableRadius, 0.0001), 2.0) * 2.4) * uFeelableSmudge;
float feelableRelief = feelableContact * uFeelableDepth * clamp(0.5 + (vFeelableUv.x - uFeelablePoke.x) / max(uFeelableRadius, 0.0001), 0.0, 1.0);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), clamp(feelableContact * uFeelableTint, 0.0, 0.35));
diffuseColor.rgb *= 1.0 - clamp(feelableRelief * 0.35, 0.0, 0.25);
diffuseColor.rgb *= 1.0 - clamp(feelableMark * 0.18, 0.0, 0.18);`,
)}`;
  };
  const cacheKey = `${original.toString()}\n${patched.toString()}`;
  patched.toString = () => cacheKey;
  material.onBeforeCompile = patched;
  material[feelablePatch] = patched;
  material.needsUpdate = true;
  return () => {
    if (material[feelablePatch] === patched) delete material[feelablePatch];
    if (material.onBeforeCompile === patched) {
      material.onBeforeCompile = original;
      material.needsUpdate = true;
    }
  };
}

export function patchFeelableMeshMaterials(
  mesh: MeshLike,
  uniforms: FeelableShaderUniforms,
) {
  const patches: MaterialPatches = new Map();
  syncFeelableMeshMaterials(mesh, uniforms, patches);
  return () => clearFeelableMaterialPatches(patches);
}

function syncFeelableMeshMaterials(
  mesh: MeshLike,
  uniforms: FeelableShaderUniforms,
  patches: MaterialPatches,
  materials = new Set<MaterialLike>(),
) {
  materials.clear();
  collectFeelableMaterials(mesh, materials, true);
  for (const material of materials)
    if (!patches.has(material) && material[feelablePatch])
      throw new Error("a material cannot be shared between feelable surfaces");
  for (const [material, cleanup] of patches)
    if (
      !materials.has(material) ||
      material[feelablePatch] !== material.onBeforeCompile
    ) {
      cleanup();
      patches.delete(material);
    }
  for (const material of materials)
    if (!patches.has(material)) {
      patches.set(material, patchFeelableMaterial(material, uniforms));
    }
}

function collectFeelableMaterials(
  object: MaterialObject,
  materials: Set<MaterialLike>,
  root = false,
) {
  if (!root && object.userData?.feelableMaterial) return;
  const value = object.material as MaterialLike | MaterialLike[] | undefined;
  let attached = false;
  if (Array.isArray(value)) {
    for (const material of value)
      if (material?.isMaterial) {
        materials.add(material);
        attached = true;
      }
  } else if (value?.isMaterial) {
    materials.add(value);
    attached = true;
  }
  const attributes = object.geometry?.attributes;
  if (
    attached &&
    (!attributes?.position || !attributes.normal || !attributes.uv)
  )
    throw new Error(
      "feelable surface geometry requires position, normal, and UV attributes",
    );
  for (const child of object.children ?? [])
    collectFeelableMaterials(child, materials);
}

function clearFeelableMaterialPatches(patches: MaterialPatches) {
  for (const cleanup of patches.values()) cleanup();
  patches.clear();
}

export function FeelableSurface({
  material,
  children,
  meshProps,
  userData,
  ...options
}: FeelableSurfaceProps) {
  const webgl = useThree((state) =>
    Boolean((state.gl as { isWebGLRenderer?: boolean }).isWebGLRenderer),
  );
  if (!webgl) throw new Error("FeelableSurface requires Three.WebGLRenderer");
  const poke = usePokeSurface(material, options);
  const { config } = poke;
  const meshRef = useRef<MeshLike>(null);
  const patchesRef = useRef<MaterialPatches>(null);
  if (!patchesRef.current) patchesRef.current = new Map();
  const patches = patchesRef.current;
  const materialsRef = useRef<Set<MaterialLike>>(null);
  if (!materialsRef.current) materialsRef.current = new Set();
  const materials = materialsRef.current;
  const shaderUniformsRef = useRef<FeelableShaderUniforms>(null);
  if (!shaderUniformsRef.current)
    shaderUniformsRef.current = {
      uFeelablePoke: poke.uniformsRef.current.uPoke,
      uFeelableRadius: { value: config.radius },
      uFeelableDepth: { value: config.deformation * 0.12 },
      uFeelableTint: { value: (1 - config.roughness) * 0.35 },
      uFeelableSmudge: poke.uniformsRef.current.uSmudge,
    };
  const shaderUniforms = shaderUniformsRef.current;
  shaderUniforms.uFeelableRadius.value = config.radius;
  shaderUniforms.uFeelableDepth.value = config.deformation * 0.12;
  shaderUniforms.uFeelableTint.value = (1 - config.roughness) * 0.35;
  useEffect(() => () => clearFeelableMaterialPatches(patches), [patches]);
  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    syncFeelableMeshMaterials(mesh, shaderUniforms, patches, materials);
    poke.step(delta * 1000);
  });

  return createElement(
    "mesh",
    {
      ...meshProps,
      ref: meshRef,
      ...poke.handlers,
      userData: {
        ...userData,
        feelableMaterial: config.kind,
        pokeState: poke.stateRef.current,
        pokeUniforms: poke.uniformsRef.current,
      },
    },
    children,
  );
}
