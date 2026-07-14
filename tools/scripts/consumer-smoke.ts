import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const scratch = mkdtempSync(join(tmpdir(), "feelable-consumer-"));
const packOutput = execFileSync(
  "npm",
  [
    "pack",
    "--json",
    "--pack-destination",
    scratch,
    "--cache",
    join(scratch, "cache"),
  ],
  { cwd: root, encoding: "utf8" },
);
const [{ filename }] = JSON.parse(packOutput) as [{ filename: string }];
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
    "three@0.177.0",
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
      'import { createPokeState, materialConfigs } from "@uqrealitylabs/feelable-materials";',
      'import { FeelableSurface } from "@uqrealitylabs/feelable-materials/react";',
      'if (!materialConfigs.enamel) throw new Error("enamel preset missing");',
      'if (typeof createPokeState !== "function") throw new Error("poke export missing");',
      'if (typeof FeelableSurface !== "function") throw new Error("react export missing");',
    ].join("\n"),
  ],
  { cwd: scratch, stdio: "inherit" },
);
