import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const scratch = mkdtempSync(join(tmpdir(), "feelable-consumer-"));
process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));
const packOutput = execFileSync(
  "npm",
  [
    "pack",
    "--silent",
    "--pack-destination",
    scratch,
    "--cache",
    join(scratch, "cache"),
  ],
  { cwd: root, encoding: "utf8" },
);
const filename = packOutput.trim().split(/\s+/).at(-1);
if (!filename) throw new Error("npm pack returned no filename");
const tarball = join(scratch, filename);

writeFileSync(
  join(scratch, "package.json"),
  JSON.stringify({ type: "module", dependencies: {} }, null, 2),
);

execFileSync(
  "npm",
  [
    "install",
    "--ignore-scripts",
    "--cache",
    join(scratch, "cache"),
    tarball,
    "react@19.2.1",
    "react-dom@19.2.1",
    "three@0.185.1",
    "@react-three/fiber@9.4.0",
  ],
  { cwd: scratch, stdio: "inherit" },
);

execFileSync(
  "node",
  [
    "--input-type=module",
    "--eval",
    [
      'import { readFileSync } from "node:fs";',
      'import { createElement } from "react";',
      'import { renderToString } from "react-dom/server";',
      'import { Canvas } from "@react-three/fiber";',
      'import { createPokeState, materialPresets } from "@uqrealitylabs/feelable-materials";',
      'import { FeelableSurface } from "@uqrealitylabs/feelable-materials/react";',
      'if (!materialPresets.enamel) throw new Error("enamel preset missing");',
      'if (typeof createPokeState !== "function") throw new Error("poke export missing");',
      'if (typeof FeelableSurface !== "function") throw new Error("react export missing");',
      'const fallback = createElement("p", null, "WebGL unavailable");',
      'const surface = createElement(FeelableSurface, { material: "cloth" }, createElement("planeGeometry", { args: [1, 1, 2, 2] }), createElement("meshBasicMaterial"));',
      'if (!renderToString(createElement(Canvas, { fallback }, surface)).includes("WebGL unavailable")) throw new Error("SSR fallback missing");',
      'if (!readFileSync(new URL(import.meta.resolve("@uqrealitylabs/feelable-materials/react")), "utf8").startsWith("\\"use client\\";")) throw new Error("client boundary missing");',
    ].join("\n"),
  ],
  { cwd: scratch, stdio: "inherit" },
);
