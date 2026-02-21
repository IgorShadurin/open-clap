import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const mode = args.find((arg) => !arg.startsWith("--")) ?? "all";
const verbose = args.includes("--verbose") || process.env.OPENCLAP_TEST_VERBOSE === "1";

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
    let stdout = "";
    let stderr = "";

    const child = spawn(command, args, {
      env,
      stdio: verbose ? "inherit" : ["ignore", "pipe", "pipe"],
    });

    if (!verbose) {
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on("error", (error) => reject(error));
    child.on("exit", (code) => {
      if (!verbose && stderr.length > 0) {
        process.stderr.write(stderr);
      }

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const message = `Command failed: ${command} ${args.join(" ")} (exit ${code ?? -1})`;
      if (verbose) {
        reject(new Error(message));
        return;
      }

      reject(new Error(`${message}\n${stdout}\n${stderr}`));
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
    if (verbose) {
      await runCommand("npx", ["prisma", "db", "push", "--accept-data-loss"], env);
      await runCommand("npx", ["tsx", "--test", filePath], env);
      return { filePath, tests: "?", pass: "?", fail: "?" };
    }

    await runCommand("npx", ["prisma", "db", "push", "--accept-data-loss"], env);
    const { stdout } = await runCommand("npx", ["tsx", "--test", filePath], env);

    const testsMatch = stdout.match(/ℹ tests (\d+)/);
    const passMatch = stdout.match(/ℹ pass (\d+)/);
    const failMatch = stdout.match(/ℹ fail (\d+)/);

    return {
      filePath,
      tests: testsMatch?.[1] ?? "?",
      pass: passMatch?.[1] ?? "?",
      fail: failMatch?.[1] ?? "0",
    };
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
}

async function main() {
  const rootDir = process.cwd();
  const searchRoots = mode === "daemon" ? ["tests/daemon"] : ["tests"];
  const files = searchRoots.flatMap((relativeRoot) => collectTestFiles(path.join(rootDir, relativeRoot)));

  if (files.length < 1) {
    console.error("No test files found.");
    process.exit(1);
  }

  let totalTests = 0;
  let totalPassed = 0;
  let totalFailed = 0;
  let filesWithFailures = 0;

  for (const filePath of files) {
    const summary = await runTestFile(filePath);
    const relativePath = path.relative(rootDir, summary.filePath);

    const testsCount = summary.tests === "?" ? summary.tests : Number(summary.tests);
    const passCount = summary.pass === "?" ? summary.pass : Number(summary.pass);
    const failCount = summary.fail === "?" ? summary.fail : Number(summary.fail);

    if (typeof testsCount === "number" && !Number.isNaN(testsCount)) {
      totalTests += testsCount;
    }

    if (typeof passCount === "number" && !Number.isNaN(passCount)) {
      totalPassed += passCount;
    }

    if (typeof failCount === "number" && failCount > 0) {
      totalFailed += failCount;
      filesWithFailures += 1;
      console.log(`[fail] ${relativePath} (${summary.pass}/${summary.tests}, failed: ${summary.fail})`);
    } else if (testsCount === "?" || passCount === "?" || failCount === "?") {
      console.log(`[ok] ${relativePath}`);
    } else {
      console.log(`[ok] ${relativePath} (${summary.pass}/${summary.tests})`);
    }

    if (typeof testsCount !== "number" || typeof passCount !== "number") {
      continue;
    }
  }

  const totalSuffix = totalFailed > 0 ? ` (${totalFailed} failed)` : "";
  console.log(
    `\nTest summary: ${files.length} files, ${totalPassed}/${totalTests} tests passed${totalSuffix}`,
  );
  if (filesWithFailures > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
