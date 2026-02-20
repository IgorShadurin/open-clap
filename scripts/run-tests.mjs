import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function collectTestFiles(rootDir) {
  const result = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) {
      continue;
    }

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (entry.isFile() && fullPath.endsWith(".test.ts")) {
        result.push(fullPath);
      }
    }
  }

  result.sort((left, right) => left.localeCompare(right));
  return result;
}

function runCommand(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit",
    });

    child.on("error", (error) => reject(error));
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Command failed: ${command} ${args.join(" ")} (exit ${code ?? -1})`));
    });
  });
}

async function runTestFile(filePath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "openclap-test-"));
  const sqliteDbPath = path.join(tempDir, "test.sqlite");
  const daemonLogFilePath = path.join(tempDir, "logs", "daemon.log");
  const env = {
    ...process.env,
    DATABASE_URL: `file:${sqliteDbPath}`,
    DAEMON_LOG_FILE: daemonLogFilePath,
    NODE_ENV: "test",
    OPENCLAP_TEST_TMPDIR: tempDir,
    PRISMA_HIDE_UPDATE_MESSAGE: "1",
    SQLITE_DB_PATH: sqliteDbPath,
  };

  try {
    await runCommand("npx", ["prisma", "db", "push", "--accept-data-loss"], env);
    await runCommand("npx", ["tsx", "--test", filePath], env);
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}

async function main() {
  const mode = process.argv[2] ?? "all";
  const rootDir = process.cwd();
  const searchRoots = mode === "daemon" ? ["tests/daemon"] : ["tests"];
  const files = searchRoots.flatMap((relativeRoot) => collectTestFiles(path.join(rootDir, relativeRoot)));

  if (files.length < 1) {
    console.error("No test files found.");
    process.exit(1);
  }

  for (const filePath of files) {
    console.log(`\n[isolated-test] ${path.relative(rootDir, filePath)}`);
    await runTestFile(filePath);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
