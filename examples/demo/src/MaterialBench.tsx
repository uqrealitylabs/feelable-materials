import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  type BufferAttribute,
  DataTexture,
  DoubleSide,
  type Group,
  PlaneGeometry,
  PMREMGenerator,
  type WebGLRenderTarget,
} from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { PokeState } from "../../../dist/index.js";
import { FeelableSurface, GrassLogoSurface } from "../../../dist/react.js";
import { type Cloth, clothIsMoving, createCloth, stepCloth } from "./cloth";
import {
  type DemoMaterialItem,
  type Quality,
  qualityCounts,
} from "./demo-data";

const CAMERA_ZOOM = 70;
const WIDTH = 6.4;
const HEIGHT = 4;
const query = new URLSearchParams(
  typeof window === "undefined" ? "" : window.location.search,
);
const smoke = query.has("smoke");
const smokeShader = smoke ? query.get("shader") : null;
const smokeNormalMap =
  smokeShader === "mapped" || smokeShader === "bump"
    ? new DataTexture(
        Uint8Array.of(
          191,
          64,
          218,
          255,
          64,
          191,
          218,
          255,
          191,
          191,
          218,
          255,
          64,
          64,
          218,
          255,
        ),
        2,
        2,
      )
    : null;
if (smokeNormalMap) smokeNormalMap.needsUpdate = true;
const grassMask = (x: number, y: number) =>
  x > 0.04 && x < 0.96 && y > 0.08 && y < 0.92;

function updateClothNormals(geometry: PlaneGeometry) {
  const positions = geometry.getAttribute("position").array as Float32Array;
  const normals = geometry.getAttribute("normal").array as Float32Array;
  const indices = (geometry.index as BufferAttribute).array;
  normals.fill(0);
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const a = indices[triangle] * 3;
    const b = indices[triangle + 1] * 3;
    const c = indices[triangle + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const x = aby * acz - abz * acy;
    const y = abz * acx - abx * acz;
    const z = abx * acy - aby * acx;
    normals[a] += x;
    normals[a + 1] += y;
    normals[a + 2] += z;
    normals[b] += x;
    normals[b + 1] += y;
    normals[b + 2] += z;
    normals[c] += x;
    normals[c + 1] += y;
    normals[c + 2] += z;
  }
  for (let vertex = 0; vertex < normals.length; vertex += 3) {
    const length = Math.hypot(
      normals[vertex],
      normals[vertex + 1],
      normals[vertex + 2],
    );
    if (length) {
      normals[vertex] /= length;
      normals[vertex + 1] /= length;
      normals[vertex + 2] /= length;
    }
  }
  geometry.getAttribute("normal").needsUpdate = true;
}

function updateClothGeometry(geometry: PlaneGeometry, cloth: Cloth) {
  const position = geometry.getAttribute("position") as BufferAttribute;
  position.copyArray(cloth.positions);
  position.needsUpdate = true;
  updateClothNormals(geometry);
  if (smokeShader === "mapped") geometry.computeTangents();
  geometry.computeBoundingSphere();
}

function SurfaceMaterial({ item }: { item: DemoMaterialItem }) {
  const color = item.finish.color;
  if (smokeShader === "bump")
    return (
      <meshPhysicalMaterial
        {...item.finish}
        bumpMap={smokeNormalMap}
        bumpScale={0.08}
        side={DoubleSide}
      />
    );
  if (smokeShader === "mapped")
    return (
      <meshPhysicalMaterial
        {...item.finish}
        normalMap={smokeNormalMap}
        clearcoat={1}
        clearcoatNormalMap={smokeNormalMap}
        anisotropy={0.5}
        side={DoubleSide}
      />
    );
  if (smokeShader === "basic")
    return <meshBasicMaterial color={color} side={DoubleSide} />;
  if (smokeShader === "lambert")
    return <meshLambertMaterial color={color} side={DoubleSide} />;
  if (smokeShader === "matcap")
    return <meshMatcapMaterial color={color} side={DoubleSide} />;
  if (smokeShader === "normal") return <meshNormalMaterial side={DoubleSide} />;
  if (smokeShader === "phong")
    return <meshPhongMaterial color={color} side={DoubleSide} />;
  if (smokeShader === "toon")
    return <meshToonMaterial color={color} side={DoubleSide} />;
  return item.id === "silicone" ? (
    <meshStandardMaterial {...item.finish} />
  ) : (
    <meshPhysicalMaterial
      {...item.finish}
      {...(item.material === "cloth" ? { side: DoubleSide } : {})}
    />
  );
}

function BaseSurface({
  item,
  quality,
  reducedMotion,
}: {
  item: DemoMaterialItem;
  quality: Quality;
  reducedMotion: boolean;
}) {
  if (item.material === "cloth")
    return (
      <ClothSurface
        item={item}
        quality={quality}
        reducedMotion={reducedMotion}
      />
    );
  return (
    <FeelableSurface material={item.material} reducedMotion={reducedMotion}>
      <planeGeometry args={[WIDTH, HEIGHT, 48, 30]} />
      <SurfaceMaterial item={item} />
    </FeelableSurface>
  );
}

function ClothSurface({
  item,
  quality,
  reducedMotion,
}: {
  item: DemoMaterialItem;
  quality: Quality;
  reducedMotion: boolean;
}) {
  const columns = quality === "low" ? 16 : quality === "standard" ? 20 : 28;
  const rows = quality === "low" ? 10 : quality === "standard" ? 12 : 18;
  const cloth = useMemo(
    () =>
      createCloth(
        WIDTH,
        HEIGHT,
        columns,
        rows,
        item.id === "satin"
          ? { bend: 0.7, damping: 0.965, shape: 42 }
          : { bend: 0.35, damping: 0.9, shape: 22 },
      ),
    [columns, item.id, rows],
  );
  const geometry = useMemo(() => {
    const next = new PlaneGeometry(WIDTH, HEIGHT, columns, rows);
    updateClothGeometry(next, cloth);
    return next;
  }, [cloth, columns, rows]);
  const group = useRef<Group>(null);
  const lastContact = useRef({ x: 0.5, y: 0.5, pressure: 0 });
  const pendingContact = useRef(false);
  const settling = useRef(0);
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => {
    lastContact.current.pressure = 0;
    cloth.positions.set(cloth.rest);
    cloth.previous.set(cloth.rest);
    cloth.accumulator = 0;
    updateClothGeometry(geometry, cloth);
    if (reducedMotion) {
      pendingContact.current = false;
      settling.current = 0;
      invalidate();
      return;
    }
    pendingContact.current = true;
    settling.current = 2.5;
    invalidate();
  }, [cloth, geometry, invalidate, reducedMotion]);
  useFrame((_state, delta) => {
    if (reducedMotion) return;
    const poke = group.current?.children[0]?.userData.pokeState as
      | PokeState
      | undefined;
    const x = poke?.x ?? lastContact.current.x;
    const y = poke?.y ?? lastContact.current.y;
    const pressure = poke?.pressure ?? 0;
    const contactChanged =
      Math.abs(x - lastContact.current.x) > 0.001 ||
      Math.abs(y - lastContact.current.y) > 0.001 ||
      Math.abs(pressure - lastContact.current.pressure) > 0.001;
    lastContact.current.x = x;
    lastContact.current.y = y;
    lastContact.current.pressure = pressure;
    if (contactChanged) {
      pendingContact.current = true;
      settling.current = 2.5;
    }
    if (!pendingContact.current && !clothIsMoving(cloth)) return;
    const steps = stepCloth(cloth, delta, pressure > 0.001 ? poke : undefined);
    if (steps) {
      pendingContact.current = false;
      settling.current = Math.max(0, settling.current - steps / 120);
      updateClothGeometry(geometry, cloth);
    }
    if (
      settling.current > 0 &&
      (pendingContact.current || clothIsMoving(cloth))
    )
      invalidate();
  });
  return (
    <group ref={group}>
      <FeelableSurface material="cloth" reducedMotion={reducedMotion}>
        <primitive object={geometry} attach="geometry" />
        <SurfaceMaterial item={item} />
      </FeelableSurface>
    </group>
  );
}

function GrassSurface({
  count,
  item,
  reducedMotion,
}: {
  count: number;
  item: DemoMaterialItem;
  reducedMotion: boolean;
}) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[WIDTH, HEIGHT, 0.1]} />
        <meshStandardMaterial color="#254d2d" roughness={1} />
      </mesh>
      <group position={[0, 0, 0.08]} scale={[WIDTH, HEIGHT, 1]}>
        <GrassLogoSurface
          count={count}
          seed={17}
          mask={grassMask}
          reducedMotion={reducedMotion}
        >
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial {...item.finish} />
        </GrassLogoSurface>
      </group>
    </group>
  );
}

function SelectedSurface({
  item,
  quality,
  reducedMotion,
}: {
  item: DemoMaterialItem;
  quality: Quality;
  reducedMotion: boolean;
}) {
  const { size } = useThree();
  const scale = Math.min(
    1,
    size.width / (7 * CAMERA_ZOOM),
    size.height / (4.8 * CAMERA_ZOOM),
  );
  return (
    <group scale={scale} rotation={[0.07, -0.1, -0.012]}>
      {item.material === "grass" ? (
        <GrassSurface
          count={qualityCounts[quality]}
          item={item}
          reducedMotion={reducedMotion}
        />
      ) : (
        <BaseSurface
          key={item.id}
          item={item}
          quality={quality}
          reducedMotion={reducedMotion}
        />
      )}
    </group>
  );
}

function StudioEnvironment({ quality }: { quality: Quality }) {
  const { gl, invalidate, scene } = useThree();
  useEffect(() => {
    gl.transmissionResolutionScale =
      quality === "low" ? 0.5 : quality === "standard" ? 0.75 : 1;
    invalidate();
  }, [gl, invalidate, quality]);
  useEffect(() => {
    let target: WebGLRenderTarget | undefined;
    const build = () => {
      const room = new RoomEnvironment();
      const pmrem = new PMREMGenerator(gl);
      const next = pmrem.fromScene(room);
      room.dispose();
      pmrem.dispose();
      target?.dispose();
      target = next;
      scene.environment = next.texture;
      invalidate();
    };
    build();
    gl.domElement.addEventListener("webglcontextrestored", build);
    return () => {
      gl.domElement.removeEventListener("webglcontextrestored", build);
      if (scene.environment === target?.texture) scene.environment = null;
      target?.dispose();
    };
  }, [gl, invalidate, scene]);
  return null;
}

function SmokeTelemetry({ item }: { item: DemoMaterialItem }) {
  const { gl, scene } = useThree();
  useFrame(() => {
    let pressure = 0;
    scene.traverse((object) => {
      if (object.userData.feelableMaterial === item.material)
        pressure = object.userData.pokeState?.pressure ?? 0;
    });
    gl.domElement.dataset.feelableMaterial = item.id;
    gl.domElement.dataset.feelablePressure = pressure.toFixed(2);
    gl.domElement.dataset.feelableDraws = String(gl.info.render.calls);
  });
  return null;
}

export default function MaterialBench({
  item,
  quality,
  reducedMotion,
}: {
  item: DemoMaterialItem;
  quality: Quality;
  reducedMotion: boolean;
}) {
  const [webglAvailable, setWebglAvailable] = useState<boolean>();
  useEffect(() => {
    try {
      const context = document.createElement("canvas").getContext("webgl2");
      setWebglAvailable(Boolean(context));
      context?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      setWebglAvailable(false);
    }
  }, []);
  if (webglAvailable !== true)
    return (
      <div className="canvas-message" role="status">
        {webglAvailable === false ? "No WebGL." : "Loading…"}
      </div>
    );
  return (
    <Canvas
      aria-label={`Interactive ${item.label} preview`}
      role="img"
      frameloop={smoke ? "always" : "demand"}
      orthographic
      camera={{ position: [0, 0, 10], zoom: CAMERA_ZOOM }}
      dpr={
        quality === "low" ? 1 : quality === "standard" ? [1, 1.5] : [1, 1.75]
      }
    >
      <color attach="background" args={["#10121a"]} />
      <StudioEnvironment quality={quality} />
      {smoke && <SmokeTelemetry item={item} />}
      <hemisphereLight args={["#d8f6ff", "#332d45", 0.55]} />
      <directionalLight position={[3, 4, 6]} intensity={2.35} />
      <directionalLight position={[-4, -2, 3]} intensity={0.5} />
      <SelectedSurface
        item={item}
        quality={quality}
        reducedMotion={reducedMotion}
      />
    </Canvas>
  );
}
