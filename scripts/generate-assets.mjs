import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Icns, IcnsImage } from '@fiahfy/icns';
import pngToIco from 'png-to-ico';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const buildDir = path.join(rootDir, 'build');
const sourceLogoCandidates = [
  path.join(rootDir, 'src', 'assets', 'oneinfer-logo.png'),
  path.join(buildDir, 'icon.png'),
];

const outputPng = path.join(buildDir, 'icon.png');
const outputIco = path.join(buildDir, 'icon.ico');
const outputIcns = path.join(buildDir, 'icon.icns');

const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const icnsVariants = [
  { size: 16, osType: 'icp4' },
  { size: 32, osType: 'icp5' },
  { size: 64, osType: 'icp6' },
  { size: 128, osType: 'ic07' },
  { size: 256, osType: 'ic08' },
  { size: 512, osType: 'ic09' },
  { size: 1024, osType: 'ic10' },
];

async function ensureDirectories() {
  await fs.mkdir(buildDir, { recursive: true });
}

async function resolveSourceLogoPath() {
  for (const candidatePath of sourceLogoCandidates) {
    try {
      await fs.access(candidatePath);
      return candidatePath;
    } catch {
      // Try the next candidate path.
    }
  }

  throw new Error(`Unable to locate a source logo. Expected one of: ${sourceLogoCandidates.join(', ')}`);
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function haveExistingOutputs() {
  const results = await Promise.all([
    fileExists(outputPng),
    fileExists(outputIco),
    fileExists(outputIcns),
  ]);

  return results.every(Boolean);
}

async function loadSharp() {
  try {
    const sharpModule = await import('sharp');
    return sharpModule.default;
  } catch (error) {
    if (await haveExistingOutputs()) {
      console.warn('sharp is unavailable in this runtime. Reusing existing build/icon.png, build/icon.ico, and build/icon.icns.');
      return null;
    }

    throw new Error(
      'sharp is unavailable in this runtime and build icons do not already exist. Run npm install in this Linux environment or install sharp for linux-x64 before packaging.',
      { cause: error },
    );
  }
}

function renderSquarePng(sharpInstance, sourceBuffer, size) {
  return sharpInstance(sourceBuffer)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
}

async function generateIcns(sharpInstance, sourceBuffer) {
  const icns = new Icns();

  for (const { size, osType } of icnsVariants) {
    const iconBuffer = await renderSquarePng(sharpInstance, sourceBuffer, size);
    icns.append(IcnsImage.fromPNG(iconBuffer, osType));
  }

  return icns.data;
}

async function generateAssets() {
  await ensureDirectories();

  const sharpInstance = await loadSharp();
  if (!sharpInstance) {
    return;
  }

  const sourceLogoPath = await resolveSourceLogoPath();
  const logoBuffer = await fs.readFile(sourceLogoPath);

  const squarePng = await renderSquarePng(sharpInstance, logoBuffer, 512);
  const icoPngBuffers = await Promise.all(icoSizes.map((size) => renderSquarePng(sharpInstance, logoBuffer, size)));
  const [icoBuffer, icnsBuffer] = await Promise.all([
    pngToIco(icoPngBuffers),
    generateIcns(sharpInstance, logoBuffer),
  ]);

  await Promise.all([
    fs.writeFile(outputPng, squarePng),
    fs.writeFile(outputIco, icoBuffer),
    fs.writeFile(outputIcns, icnsBuffer),
  ]);

  console.log('Generated app icons:', {
    sourceLogoPath,
    outputPng,
    outputIco,
    outputIcns,
  });
}

generateAssets().catch((error) => {
  console.error('Failed to generate app icons:', error);
  process.exit(1);
});