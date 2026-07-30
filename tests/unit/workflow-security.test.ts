import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findActionPinIssues } from "../../tools/scripts/assert-actions-pinned.ts";

const pinned = "a".repeat(40);

function issuesFor(step: string) {
  const root = mkdtempSync(join(tmpdir(), "workflow-security-"));
  try {
    const indented = step
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n");
    writeFileSync(join(root, "test.yml"), `steps:\n${indented}\n`);
    return findActionPinIssues(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("workflow action pins", () => {
  it.each([
    '- "uses": actions/checkout@main',
    "- uses : actions/checkout@main",
    "- { uses: actions/checkout@main }",
    "steps: [{ uses: actions/checkout@main }]",
    "build: { uses: owner/repo/.github/workflows/build.yml@main }",
    '- "u\\u0073es": actions/checkout@main',
    "- ? uses\n  : actions/checkout@main",
  ])("rejects noncanonical YAML: %s", (step) => {
    expect(issuesFor(step)).toEqual([expect.stringContaining("mutable @main")]);
  });

  it("accepts a canonical immutable action reference", () => {
    expect(issuesFor(`- uses: actions/checkout@${pinned}`)).toEqual([]);
  });
});
