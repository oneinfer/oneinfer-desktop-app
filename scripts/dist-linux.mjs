import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const requiredBuildInputs = [
  path.join(rootDir, 'dist', 'index.html'),
  path.join(rootDir, 'build', 'icon.png'),
  path.join(rootDir, 'build', 'icon.ico'),
  path.join(rootDir, 'build', 'icon.icns'),
];

function isWsl() {
  if (process.platform !== 'linux') {
    return false;
  }

  return Boolean(process.env.WSL_DISTRO_NAME) || os.release().toLowerCase().includes('microsoft');
}

function isWslMountedWindowsPath(currentDirectory) {
  return isWsl() && currentDirectory.startsWith('/mnt/');
}

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

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureBuildInputs() {
  const missingPaths = [];

  for (const targetPath of requiredBuildInputs) {
    if (!(await pathExists(targetPath))) {
      missingPaths.push(path.relative(rootDir, targetPath));
    }
  }

  if (missingPaths.length > 0) {
    console.error('Linux packaging requires existing production assets before it can assemble the AppImage.');
    console.error('Missing files:');
    for (const missingPath of missingPaths) {
      console.error(`- ${missingPath}`);
    }
    console.error('Run npm run build from Windows first, or install Linux dependencies in WSL and generate the assets there.');
    process.exitCode = 1;
    return false;
  }

  console.log('Using existing production assets from dist/ and build/ for Linux packaging.');
  return true;
}

async function runElectronBuilder() {
  const electronBuilderCli = require.resolve('electron-builder/cli.js');

  return runCommand(process.execPath, [electronBuilderCli, '--linux', 'AppImage'], {
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
    },
  });
}

async function main() {
  if (process.platform === 'win32') {
    console.error('Linux packaging is blocked on native Windows.');
    console.error('Run this command from WSL2 Ubuntu or a Linux machine instead.');
    console.error('Recommended flow: run npm run build in Windows first, then run npm run dist:linux from WSL2 Ubuntu or a Linux machine.');
    process.exitCode = 1;
    return;
  }

  if (isWslMountedWindowsPath(process.cwd())) {
    console.warn('Warning: you are building from a Windows-mounted path inside WSL.');
    console.warn('Move the repo under /home/<user>/... for better filesystem behavior and faster packaging.');
  }

  if (!(await ensureBuildInputs())) {
    return;
  }

  const builderExitCode = await runElectronBuilder();
  process.exitCode = builderExitCode;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});