import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const isWindows = process.platform === "win32";
const port = process.env.PORT || "4173";
const configuredDataDir = process.env.FISH_TEST_DATA_DIR;
const dataDir = configuredDataDir
  ? path.resolve(configuredDataDir)
  : mkdtempSync(path.join(os.tmpdir(), "fishing-logbook-e2e-"));
const ownsDataDir = !configuredDataDir;

const virtualEnvironmentPython = path.join(
  projectRoot,
  isWindows ? ".venv/Scripts/python.exe" : ".venv/bin/python",
);

let command;
let commandArgs = [];
if (process.env.FISH_TEST_PYTHON) {
  command = process.env.FISH_TEST_PYTHON;
} else if (existsSync(virtualEnvironmentPython)) {
  command = virtualEnvironmentPython;
} else if (isWindows) {
  command = "py";
  commandArgs = ["-3.13"];
} else {
  command = "python3";
}

const child = spawn(command, [...commandArgs, "server.py"], {
  cwd: projectRoot,
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: port,
    FISH_DATA_DIR: dataDir,
    SECRET_KEY: "playwright-test-secret",
    PYTHONUNBUFFERED: "1",
  },
  stdio: "inherit",
});

let shuttingDown = false;

function removeOwnedData() {
  if (!ownsDataDir) return;
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    // The test result is more useful than a cleanup warning.
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!child.killed) child.kill();
  removeOwnedData();
  process.exit(code);
}

child.on("error", (error) => {
  console.error(`Could not start the test server with ${command}: ${error.message}`);
  shutdown(1);
});

child.on("exit", (code) => {
  removeOwnedData();
  if (!shuttingDown) process.exit(code ?? 1);
});

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));
