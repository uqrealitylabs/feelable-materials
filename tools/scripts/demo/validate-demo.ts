import { existsSync, readFileSync } from "node:fs";

const htmlPath = "examples/demo/index.html";
const issues: string[] = [];

if (!existsSync("dist/index.js")) issues.push("run npm run build first");
if (!existsSync("dist/react.js")) issues.push("run npm run build first");
if (!existsSync(htmlPath)) issues.push(`missing ${htmlPath}`);

if (existsSync(htmlPath)) {
  const html = readFileSync(htmlPath, "utf8");
  for (const importPath of ["../../dist/index.js", "../../dist/react.js"]) {
    if (!html.includes(importPath))
      issues.push(`demo must import ${importPath}`);
  }
  for (const name of ["cloth", "rubber", "glass", "grass", "enamel"]) {
    if (!html.includes(name)) issues.push(`demo missing ${name}`);
  }
  if (html.includes("../src/"))
    issues.push("demo must not import private source internals");
}

if (issues.length > 0) {
  console.error(issues.join("\n"));
  process.exit(1);
}

console.log("Feelable Materials demo is valid.");
