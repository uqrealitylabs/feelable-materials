import { Canvas, useThree } from "@react-three/fiber";
import {
  createLinkedInRegionManifest,
  materialPresets,
  type MaterialKind,
} from "../../../dist/index.js";
import { FeelableSurface, GrassLogoSurface } from "../../../dist/react.js";
import { materialItems, qualityCounts, type DemoMaterial, type Quality } from "./demo-data";

const regionManifest = createLinkedInRegionManifest("demo-linkedin.svg");

const palette: Record<MaterialKind, string> = {
  cloth: "#d7b7ff",
  rubber: "#ff7b72",
  glass: "#68e8ff",
  grass: "#a7d88b",
  mail: "#f0c97b",
  enamel: "#fff3d2",
};

function SurfaceShape({ material }: { material: DemoMaterial }) {
  if (material === "rubber") return <mesh position={[0, 0, 0.11]}><sphereGeometry args={[0.38, 24, 16]} /><meshStandardMaterial color="#ffb3a7" roughness={0.34} /></mesh>;
  if (material === "glass") return <mesh position={[0, 0, 0.11]}><torusGeometry args={[0.34, 0.08, 16, 32]} /><meshPhysicalMaterial color="#d5fbff" roughness={0.06} transmission={0.35} thickness={0.2} /></mesh>;
  if (material === "cloth") return <mesh position={[0, 0, 0.11]} rotation={[0, 0, Math.PI / 4]}><boxGeometry args={[0.62, 0.62, 0.03]} /><meshStandardMaterial color="#f0dcff" roughness={0.82} /></mesh>;
  if (material === "enamel") return <mesh position={[0, 0, 0.11]}><boxGeometry args={[0.62, 0.62, 0.04]} /><meshPhysicalMaterial color="#fff3d2" roughness={0.1} metalness={0.05} /></mesh>;
  return <mesh position={[0, 0, 0.11]}><boxGeometry args={[0.82, 0.52, 0.03]} /><meshStandardMaterial color="#d7efad" roughness={0.9} /></mesh>;
}

function BaseSurface({ material, reducedMotion, selected, onSelect }: { material: MaterialKind; reducedMotion: boolean; selected: boolean; onSelect: () => void }) {
  return <group onClick={onSelect} scale={selected ? 1.06 : 1}><FeelableSurface material={material} reducedMotion={reducedMotion} ariaLabel={`${material} interactive surface`}><boxGeometry args={[2.55, 1.5, 0.12]} /><meshPhysicalMaterial color={palette[material]} roughness={materialPresets[material].roughness} metalness={material === "enamel" ? 0.08 : 0} transmission={material === "glass" ? 0.2 : 0} /></FeelableSurface><SurfaceShape material={material} /></group>;
}

function MailSurface({ count, reducedMotion, selected, onSelect }: { count: number; reducedMotion: boolean; selected: boolean; onSelect: () => void }) {
  return <group onClick={onSelect} scale={selected ? 1.06 : 1}><GrassLogoSurface count={count} seed={17} mask={(x, y) => x > 0.08 && x < 0.92 && y > 0.2 && y < 0.8} reducedMotion={reducedMotion} ariaLabel="Mail logo grass surface"><planeGeometry args={[2.55, 1.5, 1, 2]} /><meshStandardMaterial color={palette.grass} roughness={materialPresets.grass.roughness} /></GrassLogoSurface><mesh position={[0, 0, 0.1]}><boxGeometry args={[0.82, 0.52, 0.03]} /><meshStandardMaterial color="#d7efad" roughness={0.9} /></mesh></group>;
}

function RegionSurface({ reducedMotion, selected, onSelect }: { reducedMotion: boolean; selected: boolean; onSelect: () => void }) {
  return <group onClick={onSelect} scale={selected ? 1.06 : 1}><FeelableSurface material="enamel" reducedMotion={reducedMotion} ariaLabel="Enamel badge region"><boxGeometry args={[2.55, 1.5, 0.12]} /><meshPhysicalMaterial color="#fff3d2" roughness={materialPresets.enamel.roughness} metalness={0.08} /></FeelableSurface><FeelableSurface material="glass" reducedMotion={reducedMotion} ariaLabel="Glass glyph region"><boxGeometry args={[0.78, 0.78, 0.08]} /><meshPhysicalMaterial color="#68e8ff" roughness={materialPresets.glass.roughness} transmission={0.2} /></FeelableSurface></group>;
}

function Gallery({ selected, quality, reducedMotion, onSelect }: { selected: DemoMaterial; quality: Quality; reducedMotion: boolean; onSelect: (material: DemoMaterial) => void }) {
  const { size } = useThree();
  const compact = size.width < 700;
  const columns = compact ? 2 : 3;
  const rows = Math.ceil(materialItems.length / columns);
  const xGap = compact ? 3.1 : 3.55;
  const yGap = compact ? 2.45 : 2.8;
  const count = qualityCounts[quality];
  return <group>{materialItems.map((item, index) => { const x = (index % columns - (columns - 1) / 2) * xGap; const y = (rows - 1) / 2 * yGap - Math.floor(index / columns) * yGap; const isSelected = selected === item.id; return <group position={[x, y, 0]} key={item.id}>{item.id === "mail" ? <MailSurface count={count} reducedMotion={reducedMotion} selected={isSelected} onSelect={() => onSelect(item.id)} /> : item.id === "regions" ? <RegionSurface reducedMotion={reducedMotion} selected={isSelected} onSelect={() => onSelect(item.id)} /> : <BaseSurface material={item.id} reducedMotion={reducedMotion} selected={isSelected} onSelect={() => onSelect(item.id)} />}</group>; })}</group>;
}

export default function MaterialBench({ selected, quality, reducedMotion, onSelect }: { selected: DemoMaterial; quality: Quality; reducedMotion: boolean; onSelect: (material: DemoMaterial) => void }) {
  void regionManifest;
  return <Canvas orthographic camera={{ position: [0, 0, 10], zoom: 70 }} dpr={[1, 1.75]} gl={{ antialias: true, powerPreference: "high-performance" }} fallback={<div>WebGL is unavailable in this browser.</div>}><ambientLight intensity={1.8} /><directionalLight position={[3, 4, 6]} intensity={3.2} /><Gallery selected={selected} quality={quality} reducedMotion={reducedMotion} onSelect={onSelect} /></Canvas>;
}
