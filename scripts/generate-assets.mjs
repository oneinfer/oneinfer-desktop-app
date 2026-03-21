import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const sourceLogo = 'C:/Users/Administrator/Downloads/Logo_Indigo.webp';
const rootDir = path.resolve('c:/Users/Administrator/Desktop/oneinfer-app');
const buildDir = path.join(rootDir, 'build');
const srcAssetsDir = path.join(rootDir, 'src', 'assets');

const outputPng = path.join(buildDir, 'icon.png');
const outputIco = path.join(buildDir, 'icon.ico');
const outputUiLogo = path.join(srcAssetsDir, 'oneinfer-logo.png');

async function ensureDirectories() {
  await fs.mkdir(buildDir, { recursive: true });
  await fs.mkdir(srcAssetsDir, { recursive: true });
}

async function generateAssets() {
  await ensureDirectories();

  const logoBuffer = await fs.readFile(sourceLogo);

  const squarePng = await sharp(logoBuffer)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const icoPngBuffers = await Promise.all(
    icoSizes.map((size) =>
      sharp(logoBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer(),
    ),
  );

  await fs.writeFile(outputPng, squarePng);
  await fs.writeFile(outputUiLogo, squarePng);

  const icoBuffer = await pngToIco(icoPngBuffers);
  await fs.writeFile(outputIco, icoBuffer);

  console.log('Generated logo assets:', {
    outputPng,
    outputIco,
    outputUiLogo,
  });
}

generateAssets().catch((error) => {
  console.error('Failed to generate logo assets:', error);
  process.exit(1);
});