import {
  getMaterialKind,
  type MaterialKind,
} from "./materials/materialPresets.js";

export type MaterialRegionSource =
  | { type: "svg-selector"; selector: string }
  | { type: "closed-path"; pathId: string }
  | { type: "color"; value: string; tolerance: number }
  | {
      type: "mask-channel";
      texture: string;
      channel: "r" | "g" | "b" | "a";
    };

export type MaterialRegion = {
  id: string;
  source: MaterialRegionSource;
  material: MaterialKind;
  zIndex?: number | undefined;
};

export type MaterialRegionManifest = {
  asset: string;
  backgroundMaterial?: MaterialKind | undefined;
  regions: MaterialRegion[];
};

export function createMaterialRegionManifest(manifest: MaterialRegionManifest) {
  validateMaterialRegionManifest(manifest);
  return manifest;
}

export function createLinkedInRegionManifest(asset: string) {
  return createMaterialRegionManifest({
    asset,
    backgroundMaterial: "enamel",
    regions: [
      {
        id: "linkedin-badge",
        source: { type: "svg-selector", selector: "#badge" },
        material: "enamel",
        zIndex: 0,
      },
      {
        id: "linkedin-glyph",
        source: { type: "svg-selector", selector: "#glyph" },
        material: "glass",
        zIndex: 1,
      },
    ],
  });
}

export function validateMaterialRegionManifest(
  manifest: MaterialRegionManifest,
) {
  const issues: string[] = [];
  if (!manifest.asset.trim()) issues.push("asset is required");
  if (manifest.regions.length === 0) issues.push("regions are required");

  const ids = new Set<string>();
  for (const region of manifest.regions) {
    if (!region.id.trim()) issues.push("region id is required");
    if (ids.has(region.id)) issues.push(`duplicate region id: ${region.id}`);
    ids.add(region.id);
    if (getMaterialKind(region.material) !== region.material) {
      issues.push(`${region.id} material is unsupported`);
    }
    validateRegionSource(region.source, issues, region.id);
  }

  if (issues.length > 0) {
    throw new Error(`Invalid material region manifest: ${issues.join("; ")}`);
  }
}

export function listRegionMaterials(manifest: MaterialRegionManifest) {
  return Array.from(
    new Set(
      [
        manifest.backgroundMaterial,
        ...manifest.regions.map((region) => region.material),
      ].filter(Boolean),
    ),
  ) as MaterialKind[];
}

function validateRegionSource(
  source: MaterialRegionSource,
  issues: string[],
  id: string,
) {
  if (source.type === "svg-selector" && !source.selector.trim()) {
    issues.push(`${id} selector is required`);
  }
  if (source.type === "closed-path" && !source.pathId.trim()) {
    issues.push(`${id} pathId is required`);
  }
  if (source.type === "color") {
    if (!/^#[0-9a-f]{6}$/i.test(source.value)) {
      issues.push(`${id} color must be #RRGGBB`);
    }
    if (source.tolerance < 0 || source.tolerance > 1) {
      issues.push(`${id} tolerance must be between 0 and 1`);
    }
  }
  if (source.type === "mask-channel" && !source.texture.trim()) {
    issues.push(`${id} texture is required`);
  }
}
