import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename } from "node:path";

const htmlPath = "demo-dist/index.html";
const sourcePaths = [
  "examples/demo/src/main.tsx",
  "examples/demo/src/MaterialBench.tsx",
];
const issues: string[] = [];
const expectedBase = process.env.DEMO_BASE_PATH;

if (!existsSync(htmlPath)) issues.push("run npm run demo:build first");
for (const path of sourcePaths)
  if (!existsSync(path)) issues.push(`missing ${path}`);

if (existsSync(htmlPath)) {
  const html = readFileSync(htmlPath, "utf8");
  for (const text of ["Feelable Materials", "assets/"]) {
    if (!html.includes(text)) issues.push(`built demo is missing ${text}`);
  }
  if (html.includes("esm.sh") || html.includes("unpkg.com"))
    issues.push("demo must not use a CDN import map");
  const assets = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map(
    ([, path]) => path,
  );
  if (assets.length === 0) issues.push("built demo has no linked assets");
  if (expectedBase)
    for (const path of assets)
      if (!path?.startsWith(`${expectedBase}assets/`))
        issues.push(`built asset ${path} must use ${expectedBase}`);
  const assetDir = "demo-dist/assets";
  const files = existsSync(assetDir) ? readdirSync(assetDir) : [];
  for (const path of assets)
    if (!existsSync(`${assetDir}/${basename(path ?? "")}`))
      issues.push(`built asset is missing: ${path}`);
  const lazyChunk = files.find(
    (file) => file.startsWith("MaterialBench-") && file.endsWith(".js"),
  );
  const entries = assets
    .filter((path) => path?.endsWith(".js"))
    .map((path) => `${assetDir}/${basename(path ?? "")}`)
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path, "utf8"));
  if (!lazyChunk || !entries.some((entry) => entry.includes(lazyChunk)))
    issues.push("built entry must reference the material bench chunk");
}

const source = sourcePaths
  .filter((path) => existsSync(path))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
for (const text of [
  "FeelableSurface",
  'frameloop="demand"',
  "vite:preloadError",
  "../../../dist/index.js",
  "../../../dist/react.js",
]) {
  if (!source.includes(text)) issues.push(`demo source is missing ${text}`);
}

if (issues.length > 0) {
  console.error(issues.join("\n"));
  process.exit(1);
}

console.log("Feelable Materials demo build is valid.");
