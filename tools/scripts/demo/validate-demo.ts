import { existsSync, readFileSync } from "node:fs";

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
  if (expectedBase && !html.includes(expectedBase))
    issues.push(`built assets must use ${expectedBase}`);
}

const source = sourcePaths
  .filter((path) => existsSync(path))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
for (const text of [
  "FeelableSurface",
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
