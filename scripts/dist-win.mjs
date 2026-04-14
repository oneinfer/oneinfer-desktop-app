import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const releaseDir = path.join(rootDir, 'release');
const windowsArtifactName = 'OneInfer Desktop windows.exe';

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options,
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`${command} exited due to signal ${signal}`));
        return;
      }

      resolve(code ?? 0);
    });
  });
}

function getNpmCommand() {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath],
    };
  }

  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: [],
  };
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runBuild() {
  const npm = getNpmCommand();
  return runCommand(npm.command, [...npm.args, 'run', 'build']);
}

function createWindowsOutputDir() {
  return path.join(releaseDir, `.tmp-win-${Date.now()}`);
}

async function copyWindowsArtifact(outputDir) {
  const sourcePath = path.join(outputDir, windowsArtifactName);
  const destinationPath = path.join(releaseDir, windowsArtifactName);

  if (!(await pathExists(sourcePath))) {
    throw new Error(`Expected Windows installer was not created at ${sourcePath}`);
  }

  await fs.copyFile(sourcePath, destinationPath);
}

async function cleanupOutputDir(outputDir) {
  if (!(await pathExists(outputDir))) {
    return;
  }

  try {
    await fs.rm(outputDir, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 300,
    });
  } catch {
    console.warn(`Warning: could not remove temporary build output at ${outputDir}`);
  }
}

async function runElectronBuilder(outputDir) {
  const electronBuilderCli = require.resolve('electron-builder/cli.js');

  return runCommand(
    process.execPath,
    [electronBuilderCli, '--win', 'nsis', `--config.directories.output=${outputDir}`],
    {
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    },
    },
  );
}

async function main() {
  const buildExitCode = await runBuild();
  if (buildExitCode !== 0) {
    process.exitCode = buildExitCode;
    return;
  }

  await fs.mkdir(releaseDir, { recursive: true });

  const outputDir = createWindowsOutputDir();
  const builderExitCode = await runElectronBuilder(outputDir);

  if (builderExitCode !== 0) {
    process.exitCode = builderExitCode;
    return;
  }

  await copyWindowsArtifact(outputDir);
  await cleanupOutputDir(outputDir);
  process.exitCode = 0;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});