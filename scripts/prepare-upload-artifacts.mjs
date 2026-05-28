import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const releaseDir = path.join(rootDir, 'release');

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(extension, excludeSuffixes = []) {
  const entries = await fs.readdir(releaseDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    if (!entry.name.endsWith(extension)) {
      continue;
    }

    if (excludeSuffixes.some((suffix) => entry.name.endsWith(suffix))) {
      continue;
    }

    const fullPath = path.join(releaseDir, entry.name);
    const stat = await fs.stat(fullPath);
    files.push({
      fullPath,
      name: entry.name,
      modifiedAt: stat.mtimeMs,
    });
  }

  files.sort((left, right) => right.modifiedAt - left.modifiedAt);
  return files;
}

async function copyLatestArtifact(sourceFiles, destinationName) {
  const source = sourceFiles[0];
  if (!source) {
    throw new Error(`Could not find a source artifact for ${destinationName} in release/.`);
  }

  const destinationPath = path.join(releaseDir, destinationName);
  await fs.copyFile(source.fullPath, destinationPath);
  return {
    source: source.name,
    destination: destinationName,
  };
}

async function main() {
  if (!(await fileExists(releaseDir))) {
    throw new Error('release/ does not exist yet. Build the installers first.');
  }

  const windowsArtifacts = await listFiles('.exe', ['.blockmap']);
  const linuxArtifacts = await listFiles('.AppImage');

  const copies = await Promise.all([
    copyLatestArtifact(windowsArtifacts, 'OneInfer Edge windows.exe'),
    copyLatestArtifact(linuxArtifacts, 'OneInfer Edge linux.AppImage'),
  ]);

  console.log('Prepared upload artifacts:');
  for (const copy of copies) {
    console.log(`- ${copy.destination} <= ${copy.source}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
