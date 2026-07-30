import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse } from "yaml";

const workflowRoot = ".github/workflows";
const shaRef = /^[a-f0-9]{40}$/i;
const dockerDigest = /@sha256:[a-f0-9]{64}$/i;
const expectedWorkflows = [
  "checks.yml",
  "publish.yml",
  "release.yml",
  "security.yml",
];

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
      issues.push(`${file}: ${error instanceof Error ? error.message : error}`);
      continue;
    }

    const seen = new WeakSet<object>();
    const visit = (value: unknown) => {
      if (!value || typeof value !== "object" || seen.has(value)) return;
      seen.add(value);
      for (const [key, child] of Object.entries(value)) {
        if (key === "uses") {
          if (typeof child !== "string") {
            issues.push(`${file}: uses must be a string`);
          } else if (
            !child.startsWith("./") &&
            !(child.startsWith("docker://") && dockerDigest.test(child)) &&
            !shaRef.test(child.slice(child.lastIndexOf("@") + 1))
          ) {
            issues.push(`${file}: ${child} is not SHA-pinned`);
          }
        }
        visit(child);
      }
    };
    visit(workflow);
  }

  return issues;
}

export function findWorkflowIssues(root = workflowRoot) {
  const files = workflowFiles(root);
  const names = files.map((file) => basename(file)).sort();
  const issues = findActionPinIssues(root);
  if (names.join() !== expectedWorkflows.join())
    issues.push(`workflow files must be ${expectedWorkflows.join(", ")}`);

  try {
    const release = parse(readFileSync(join(root, "release.yml"), "utf8"));
    const jobs =
      release && typeof release === "object" && !Array.isArray(release)
        ? (release as Record<string, unknown>).jobs
        : undefined;
    if (
      !jobs ||
      typeof jobs !== "object" ||
      Array.isArray(jobs) ||
      Object.keys(jobs).join() !== "github,npm"
    )
      issues.push("release.yml jobs must be exactly github, npm");
  } catch {
    // The syntax error is already reported by findActionPinIssues.
  }

  return issues;
}

if (process.argv[1]?.endsWith("assert-actions-pinned.ts")) {
  const issues = findWorkflowIssues();
  if (issues.length > 0) {
    console.error(issues.join("\n"));
    process.exit(1);
  }
  console.log("Workflow topology and action pins are valid.");
}
