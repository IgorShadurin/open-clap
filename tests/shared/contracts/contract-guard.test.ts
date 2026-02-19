import { assertTestDatabaseGuard } from "../../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  "build",
  "node_modules",
  "out",
]);

const CONTRACT_DECLARATION_PATTERNS = [
  /\binterface\s+DaemonTask\b/,
  /\binterface\s+ImmediateAction\b/,
  /\binterface\s+TaskExecutionResult\b/,
  /\btype\s+DaemonTaskStatus\b/,
];

function collectCodeFiles(rootDirectory: string): string[] {
  const files: string[] = [];
  const stack: string[] = [rootDirectory];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (/\.(ts|tsx|mts)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

test("shared contract types are declared only in shared/contracts/task.ts", () => {
  const workspaceRoot = process.cwd();
  const canonicalContractFile = path.join(
    workspaceRoot,
    "shared/contracts/task.ts",
  );
  const files = collectCodeFiles(workspaceRoot);
  const violations: string[] = [];

  for (const filePath of files) {
    if (filePath === canonicalContractFile) {
      continue;
    }

    const source = fs.readFileSync(filePath, "utf8");
    for (const pattern of CONTRACT_DECLARATION_PATTERNS) {
      if (pattern.test(source)) {
        violations.push(`${path.relative(workspaceRoot, filePath)}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});
