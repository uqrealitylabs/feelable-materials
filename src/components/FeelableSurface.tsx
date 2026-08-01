import { type ThreeElements, useFrame, useThree } from "@react-three/fiber";
import {
  createElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useRef,
} from "react";
import { ObjectSpaceNormalMap } from "three";
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
  normalMap?: unknown;
  normalMapType?: number;
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
  uFeelableBladeField: { value: number };
  uFeelableSmudge: PokeUniforms["uSmudge"];
  uFeelableSmudgePosition: PokeUniforms["uSmudgePosition"];
  uFeelableWeave: { value: number };
  uFeelableContactRoughness: { value: number };
};

const BEGIN_VERTEX = "#include <begin_vertex>";
const BEGIN_NORMAL_VERTEX = "#include <beginnormal_vertex>";
const PROJECT_VERTEX = "#include <project_vertex>";
const NORMAL_FRAGMENT = "#include <normal_fragment_maps>";
const ROUGHNESS_FRAGMENT = "#include <roughnessmap_fragment>";
const UNSUPPORTED_NORMAL_MAP = "object-space map unsupported";
const feelablePatch = Symbol("feelable-material-patch");
const vertexHeader = `
uniform vec3 uFeelablePoke;
uniform float uFeelableRadius;
uniform float uFeelableDepth;
uniform float uFeelableWeave;
uniform float uFeelableBladeField;
varying vec2 vFeelableUv;
varying vec3 vFeelableViewPosition;
`;
const vertexPatch = `
vec2 feelableUv = uv;
float feelableTip = 1.0;
vec3 feelableDirection = normal;
FEELABLE_DIRECTION
#ifdef USE_INSTANCING
  if (uFeelableBladeField > 0.5) {
    feelableUv = instanceMatrix[3].xy + 0.5;
    feelableTip = uv.y;
  }
#endif
vFeelableUv = feelableUv;
vec2 feelableDelta = feelableUv - uFeelablePoke.xy;
feelableDelta *= mix(vec2(1.0), vec2(0.74, 1.22), uFeelableWeave);
float feelableRadius = max(uFeelableRadius, 0.0001);
float feelableInfluence = exp(-dot(feelableDelta, feelableDelta) / (feelableRadius * feelableRadius) * 2.4) * uFeelablePoke.z;
transformed -= normalize(feelableDirection) * feelableInfluence * uFeelableDepth * feelableTip;
`;
const basicDirection = `
#if defined(USE_MORPHNORMALS) && !defined(USE_ENVMAP) && !defined(USE_SKINNING)
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  feelableDirection = objectNormal;
#elif defined(USE_ENVMAP) || defined(USE_SKINNING)
  feelableDirection = objectNormal;
#endif`;
const viewPositionPatch = `
vFeelableViewPosition = -mvPosition.xyz;`;
const fragmentHeader = `
uniform vec3 uFeelablePoke;
uniform float uFeelableRadius;
uniform float uFeelableSmudge;
uniform vec2 uFeelableSmudgePosition;
uniform float uFeelableWeave;
uniform float uFeelableContactRoughness;
varying vec2 vFeelableUv;
varying vec3 vFeelableViewPosition;
`;
const contactPatch = `
vec2 feelableDelta = vFeelableUv - uFeelablePoke.xy;
feelableDelta *= mix(vec2(1.0), vec2(0.74, 1.22), uFeelableWeave);
float feelableRadius = max(uFeelableRadius, 0.0001);
float feelableGaussian = exp(-dot(feelableDelta, feelableDelta) / (feelableRadius * feelableRadius) * 2.4);`;
const roughnessPatch = `
float feelableContactMark = clamp(feelableGaussian * uFeelablePoke.z * uFeelableContactRoughness * 0.45, 0.0, 0.45);
roughnessFactor = mix(roughnessFactor, 0.04, feelableContactMark);
vec2 feelableSmudgeDelta = vFeelableUv - uFeelableSmudgePosition;
float feelableMark = exp(-dot(feelableSmudgeDelta, feelableSmudgeDelta) / (feelableRadius * feelableRadius) * 2.4) * uFeelableSmudge;
roughnessFactor = mix(roughnessFactor, 1.0, clamp(feelableMark * 0.65, 0.0, 0.65));`;
const normalPatch = `
vec3 feelableNormal = normalize(cross(dFdx(vFeelableViewPosition), dFdy(vFeelableViewPosition)));
float feelableNormalMix = clamp(feelableGaussian * uFeelablePoke.z * 2.0, 0.0, 1.0);
normal = normalize(mix(normal, feelableNormal, feelableNormalMix));
nonPerturbedNormal = normalize(mix(nonPerturbedNormal, feelableNormal, feelableNormalMix));
if (uFeelableWeave > 0.5) {
  vec2 feelableWeaveUv = vFeelableUv * vec2(72.0, 48.0);
  float feelableWeaveFade = 1.0 - smoothstep(0.35, 0.75, max(fwidth(feelableWeaveUv.x), fwidth(feelableWeaveUv.y)));
  float feelableWeaveHeight = sin(feelableWeaveUv.x * 6.283185) * sin(feelableWeaveUv.y * 6.283185) * feelableWeaveFade;
  vec3 feelableSigmaX = normalize(dFdx(-vFeelableViewPosition));
  vec3 feelableSigmaY = normalize(dFdy(-vFeelableViewPosition));
  vec3 feelableR1 = cross(feelableSigmaY, normal);
  vec3 feelableR2 = cross(normal, feelableSigmaX);
  float feelableDet = dot(feelableSigmaX, feelableR1);
  vec2 feelableWeaveGradient = vec2(dFdx(feelableWeaveHeight), dFdy(feelableWeaveHeight)) * 0.12;
  normal = normalize(abs(feelableDet) * normal - sign(feelableDet) * (feelableWeaveGradient.x * feelableR1 + feelableWeaveGradient.y * feelableR2));
  nonPerturbedNormal = normal;
}
#ifdef USE_TANGENT
  vec3 feelableTangent = normalize(vTangent - normal * dot(vTangent, normal));
  vec3 feelableBitangent = normalize(vBitangent - normal * dot(vBitangent, normal) - feelableTangent * dot(vBitangent, feelableTangent));
#endif
#if defined(USE_NORMALMAP_TANGENTSPACE) || defined(USE_CLEARCOAT_NORMALMAP) || defined(USE_ANISOTROPY)
  #ifdef USE_TANGENT
    tbn = mat3(feelableTangent, feelableBitangent, normal);
  #else
    tbn = getTangentFrame(-vFeelableViewPosition, normal,
      #if defined(USE_NORMALMAP)
        vNormalMapUv
      #elif defined(USE_CLEARCOAT_NORMALMAP)
        vClearcoatNormalMapUv
      #else
        vUv
      #endif
    );
  #endif
  #ifdef DOUBLE_SIDED
    tbn[0] *= faceDirection;
    tbn[1] *= faceDirection;
  #endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
  #ifdef USE_TANGENT
    tbn2 = mat3(feelableTangent, feelableBitangent, normal);
  #else
    tbn2 = getTangentFrame(-vFeelableViewPosition, normal, vClearcoatNormalMapUv);
  #endif
  #ifdef DOUBLE_SIDED
    tbn2[0] *= faceDirection;
    tbn2[1] *= faceDirection;
  #endif
#endif
`;

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
  assertSupportedNormalMap(material);
  if (material[feelablePatch])
    throw new Error("material is already owned by a feelable surface");
  const original = material.onBeforeCompile;
  const patched: MaterialLike["onBeforeCompile"] = (shader, renderer) => {
    assertSupportedNormalMap(material);
    original.call(material, shader, renderer);
    const normal = shader.fragmentShader.includes(NORMAL_FRAGMENT);
    if (
      !shader.vertexShader.includes(BEGIN_VERTEX) ||
      (normal && !shader.vertexShader.includes(BEGIN_NORMAL_VERTEX)) ||
      !shader.vertexShader.includes(PROJECT_VERTEX)
    )
      return;
    const roughness = shader.fragmentShader.includes(ROUGHNESS_FRAGMENT);
    const patchedVertex = vertexPatch.replace(
      "FEELABLE_DIRECTION",
      normal
        ? "feelableDirection = objectNormal;"
        : shader.vertexShader.includes(BEGIN_NORMAL_VERTEX)
          ? basicDirection
          : "",
    );

    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader =
      vertexHeader +
      shader.vertexShader.replace(
        PROJECT_VERTEX,
        patchedVertex + PROJECT_VERTEX + viewPositionPatch,
      );
    if (normal) {
      let fragment = shader.fragmentShader;
      if (roughness)
        fragment = fragment.replace(
          ROUGHNESS_FRAGMENT,
          ROUGHNESS_FRAGMENT + contactPatch + roughnessPatch,
        );
      shader.fragmentShader =
        fragmentHeader +
        fragment.replace(
          NORMAL_FRAGMENT,
          (roughness ? normalPatch : contactPatch + normalPatch) +
            NORMAL_FRAGMENT,
        );
    }
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

function assertSupportedNormalMap(material: MaterialLike) {
  if (material.normalMap && material.normalMapType === ObjectSpaceNormalMap)
    throw new Error(UNSUPPORTED_NORMAL_MAP);
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
  for (const material of materials) {
    assertSupportedNormalMap(material);
    if (!patches.has(material) && material[feelablePatch])
      throw new Error("material already owned");
  }
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
    throw new Error("position/normal/UV required");
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
}: FeelableSurfaceProps): ReactElement {
  const webgl = useThree((state) =>
    Boolean((state.gl as { isWebGLRenderer?: boolean }).isWebGLRenderer),
  );
  if (!webgl) throw new Error("WebGLRenderer required");
  const poke = usePokeSurface(material, options);
  const { config } = poke;
  const meshRef = useRef<MeshLike>(null);
  const patchesRef = useRef<MaterialPatches>(null);
  if (!patchesRef.current) patchesRef.current = new Map();
  const patches = patchesRef.current;
  const materialsRef = useRef<Set<MaterialLike>>(null);
  if (!materialsRef.current) materialsRef.current = new Set();
  const materials = materialsRef.current;
  const syncErrorRef = useRef("");
  const shaderUniformsRef = useRef<FeelableShaderUniforms>(null);
  if (!shaderUniformsRef.current)
    shaderUniformsRef.current = {
      uFeelablePoke: poke.uniformsRef.current.uPoke,
      uFeelableRadius: { value: config.radius },
      uFeelableDepth: { value: config.deformation * 0.12 },
      uFeelableBladeField: { value: 0 },
      uFeelableSmudge: poke.uniformsRef.current.uSmudge,
      uFeelableSmudgePosition: poke.uniformsRef.current.uSmudgePosition,
      uFeelableWeave: { value: 0 },
      uFeelableContactRoughness: { value: 0 },
    };
  const shaderUniforms = shaderUniformsRef.current;
  shaderUniforms.uFeelableRadius.value = config.radius;
  shaderUniforms.uFeelableDepth.value = config.deformation * 0.12;
  shaderUniforms.uFeelableBladeField.value = config.kind === "grass" ? 1 : 0;
  shaderUniforms.uFeelableWeave.value = config.kind === "cloth" ? 1 : 0;
  shaderUniforms.uFeelableContactRoughness.value =
    config.kind === "enamel" ? 1 : 0;
  useEffect(() => () => clearFeelableMaterialPatches(patches), [patches]);
  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    try {
      syncFeelableMeshMaterials(mesh, shaderUniforms, patches, materials);
      syncErrorRef.current = "";
    } catch (error) {
      clearFeelableMaterialPatches(patches);
      const message = (error as Error).message;
      if (syncErrorRef.current !== message) console.error(message);
      syncErrorRef.current = message;
    }
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
