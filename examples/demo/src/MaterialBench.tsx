import { Canvas, useThree } from "@react-three/fiber";
import { useCallback, useState } from "react";
import { WebGLRenderer, type WebGLRendererParameters } from "three";
import {
  materialPresets,
  type MaterialKind,
} from "../../../dist/index.js";
import { FeelableSurface, GrassLogoSurface } from "../../../dist/react.js";
import { materialItems, qualityCounts, type DemoMaterial, type Quality } from "./demo-data";

const CAMERA_ZOOM = 70;
const ignoreRaycast = () => undefined;
const grassMask = (x: number, y: number) => x > 0.04 && x < 0.96 && y > 0.08 && y < 0.92;

const palette: Record<MaterialKind, string> = {
  cloth: "#d7b7ff",
  rubber: "#ff7b72",
  glass: "#68e8ff",
  grass: "#a7d88b",
  mail: "#f0c97b",
  enamel: "#fff3d2",
};

function SurfaceShape({ material }: { material: DemoMaterial }) {
  if (material === "rubber") return <mesh raycast={ignoreRaycast} position={[0, 0, 0.11]}><sphereGeometry args={[0.38, 24, 16]} /><meshStandardMaterial color="#ffb3a7" roughness={0.34} /></mesh>;
  if (material === "glass") return <mesh raycast={ignoreRaycast} position={[0, 0, 0.11]}><torusGeometry args={[0.34, 0.08, 16, 32]} /><meshPhysicalMaterial color="#d5fbff" roughness={0.06} transmission={0.35} thickness={0.2} /></mesh>;
  if (material === "cloth") return <mesh raycast={ignoreRaycast} position={[0, 0, 0.11]} rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[0.62, 0.62, 0.03]} /><meshStandardMaterial color="#f0dcff" roughness={0.82} /></mesh>;
  if (material === "enamel") return <mesh raycast={ignoreRaycast} position={[0, 0, 0.11]}><boxGeometry args={[0.62, 0.62, 0.04]} /><meshPhysicalMaterial color="#fff3d2" roughness={0.1} metalness={0.05} /></mesh>;
  return <mesh raycast={ignoreRaycast} position={[0, 0, 0.11]}><boxGeometry args={[0.82, 0.52, 0.03]} /><meshStandardMaterial color="#d7efad" roughness={0.9} /></mesh>;
}

function BaseSurface({ material, reducedMotion, selected, onSelect }: { material: MaterialKind; reducedMotion: boolean; selected: boolean; onSelect: () => void }) {
  return <group onClick={onSelect} scale={selected ? 1.06 : 1}><FeelableSurface material={material} reducedMotion={reducedMotion}><planeGeometry args={[2.55, 1.5, 24, 14]} /><meshPhysicalMaterial color={palette[material]} roughness={materialPresets[material].roughness} metalness={material === "enamel" ? 0.08 : 0} transmission={material === "glass" ? 0.2 : 0} /></FeelableSurface><SurfaceShape material={material} /></group>;
}

function GrassSurface({ count, reducedMotion, selected, onSelect }: { count: number; reducedMotion: boolean; selected: boolean; onSelect: () => void }) {
  return <group onClick={onSelect} scale={selected ? 1.06 : 1}><mesh raycast={ignoreRaycast}><boxGeometry args={[2.55, 1.5, 0.08]} /><meshStandardMaterial color="#254d2d" roughness={1} /></mesh><group position={[0, 0, 0.08]} scale={[2.55, 1.5, 1]}><GrassLogoSurface count={count} seed={17} mask={grassMask} reducedMotion={reducedMotion}><planeGeometry args={[1, 1]} /><meshStandardMaterial color={palette.grass} roughness={materialPresets.grass.roughness} /></GrassLogoSurface></group></group>;
}

function Gallery({ selected, quality, reducedMotion, onSelect }: { selected: DemoMaterial; quality: Quality; reducedMotion: boolean; onSelect: (material: DemoMaterial) => void }) {
  const { size } = useThree();
  const compact = size.width < 700;
  const columns = compact ? 2 : 3;
  const rows = Math.ceil(materialItems.length / columns);
  const xGap = compact ? 3.1 : 3.55;
  const yGap = compact ? 2.45 : 2.8;
  const count = qualityCounts[quality];
  const contentWidth = (columns - 1) * xGap + 2.55 * 1.06;
  const contentHeight = (rows - 1) * yGap + 1.5 * 1.06;
  const scale = Math.min(1, size.width / (contentWidth * CAMERA_ZOOM), size.height / (contentHeight * CAMERA_ZOOM));
  return <group scale={scale}>{materialItems.map((item, index) => { const x = (index % columns - (columns - 1) / 2) * xGap; const y = (rows - 1) / 2 * yGap - Math.floor(index / columns) * yGap; const isSelected = selected === item.id; return <group position={[x, y, 0]} key={item.id}>{item.id === "grass" ? <GrassSurface count={count} reducedMotion={reducedMotion} selected={isSelected} onSelect={() => onSelect(item.id)} /> : <BaseSurface material={item.id} reducedMotion={reducedMotion} selected={isSelected} onSelect={() => onSelect(item.id)} />}</group>; })}</group>;
}

export default function MaterialBench({ selected, quality, reducedMotion, onSelect }: { selected: DemoMaterial; quality: Quality; reducedMotion: boolean; onSelect: (material: DemoMaterial) => void }) {
  const [webglError, setWebglError] = useState(false);
  const createRenderer = useCallback((options: WebGLRendererParameters) => {
    try {
      return new WebGLRenderer(options);
    } catch {
      setWebglError(true);
      // Keep R3F setup pending until React replaces the failed canvas.
      return new Promise<never>(() => undefined) as never;
    }
  }, []);
  if (webglError) return <div className="canvas-message" role="status">WebGL is unavailable in this browser.</div>;
  return <Canvas aria-label="Interactive material preview" role="img" fallback={<div className="canvas-message" role="status">WebGL is unavailable in this browser.</div>} frameloop="demand" orthographic camera={{ position: [0, 0, 10], zoom: CAMERA_ZOOM }} dpr={[1, 1.75]} gl={createRenderer}><ambientLight intensity={1.8} /><directionalLight position={[3, 4, 6]} intensity={3.2} /><Gallery selected={selected} quality={quality} reducedMotion={reducedMotion} onSelect={onSelect} /></Canvas>;
}
