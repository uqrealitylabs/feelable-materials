import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  findActionPinIssues,
  findWorkflowIssues,
} from "../../tools/scripts/assert-actions-pinned";

const scan = (source: string) => {
  const root = mkdtempSync(join(tmpdir(), "feelable-workflow-"));
  try {
    writeFileSync(join(root, "case.yml"), source);
    return findActionPinIssues(root);
  } finally {
    rmSync(root, { recursive: true });
  }
};

describe("workflow policy", () => {
  it("accepts the repository workflows", () => {
    expect(findWorkflowIssues()).toEqual([]);
  });

  it.each([
    ['"uses": owner/action@main', "quoted key"],
    ["uses : owner/action@v1", "spaced key"],
    ["{uses: owner/action@latest}", "flow mapping"],
    ['"u\\u0073es": owner/action@main', "escaped key"],
    ["? uses\n: owner/action@main", "explicit key"],
    ["step: &step\n  uses: owner/action@main\ncopy: *step", "alias"],
    ["uses: 42", "non-string value"],
    ["uses: owner/action", "missing ref"],
    ["jobs: [", "invalid YAML"],
  ])("rejects %s (%s)", (source) => {
    expect(scan(source)).not.toEqual([]);
  });

  it.each([
    ["uses: ./local-action", "local action"],
    [`uses: owner/action@${"a".repeat(40)}`, "commit SHA"],
    [`uses: docker://image@sha256:${"b".repeat(64)}`, "image digest"],
  ])("accepts %s (%s)", (source) => {
    expect(scan(source)).toEqual([]);
  });
});
