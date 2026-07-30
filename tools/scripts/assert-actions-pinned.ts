import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const workflowRoot = ".github/workflows";
const expectedWorkflows = [
  "checks.yml",
  "publish.yml",
  "release.yml",
  "security.yml",
];
const mutableRefs = new Set(["main", "master", "latest"]);
const shaRef = /^[a-f0-9]{40}$/i;

export function findWorkflowFileIssues(root = workflowRoot) {
  const actual = readdirSync(root).filter(
    (file) => file.endsWith(".yml") || file.endsWith(".yaml"),
  );
  return [
    ...expectedWorkflows
      .filter((file) => !actual.includes(file))
      .map((file) => `${root}/${file} is missing`),
    ...actual
      .filter((file) => !expectedWorkflows.includes(file))
      .map((file) => `${root}/${file} is not an allowed workflow`),
  ];
}

function workflowFiles(root = workflowRoot) {
  return readdirSync(root)
    .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
    .map((file) => join(root, file));
}

export function findActionPinIssues(root = workflowRoot) {
  const issues: string[] = [];

  for (const file of workflowFiles(root)) {
    let workflow: unknown;
    try {
      workflow = parse(readFileSync(file, "utf8"));
    } catch (error) {
      issues.push(`${file} is invalid YAML: ${String(error)}`);
      continue;
    }

    const seen = new Set<object>();
    const visit = (value: unknown) => {
      if (typeof value !== "object" || value === null || seen.has(value))
        return;
      seen.add(value);

      for (const [key, child] of Object.entries(value)) {
        if (key === "uses") {
          if (typeof child !== "string") {
            issues.push(`${file} has a non-string uses value`);
          } else if (!child.startsWith("./")) {
            const ref = child.slice(child.lastIndexOf("@") + 1);
            if (!child.includes("@"))
              issues.push(`${file} ${child} is missing a ref`);
            else if (mutableRefs.has(ref))
              issues.push(`${file} ${child} uses mutable @${ref}`);
            else if (!shaRef.test(ref))
              issues.push(`${file} ${child} is not SHA-pinned`);
          }
        }
        visit(child);
      }
    };
    visit(workflow);
  }

  return issues;
}

if (process.argv[1]?.endsWith("assert-actions-pinned.ts")) {
  const issues = [...findWorkflowFileIssues(), ...findActionPinIssues()];
  if (issues.length > 0) {
    console.error(issues.join("\n"));
    process.exit(1);
  }
  console.log("Workflow actions are SHA-pinned.");
}
