#!/usr/bin/env node
/**
 * Package the supplied polka app artwork without redrawing or recolouring it.
 * Requires macOS sips (already available on the development machine).
 * Usage: node scripts/package-polka-icon.cjs [path/to/original.jpg]
 * Without an argument, the preserved public/brand source is reused.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const brandDirectory = path.join(root, 'public/brand');
const iconDirectory = path.join(root, 'public/icons');
const sourcePath = path.join(brandDirectory, 'polka-app-source.jpg');
const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : sourcePath;

function sips(...args) {
  return execFileSync('/usr/bin/sips', args, { encoding: 'utf8' });
}

const sourceInfo = sips('-g', 'pixelWidth', '-g', 'pixelHeight', '-g', 'format', inputPath);
const sourceWidth = Number(sourceInfo.match(/pixelWidth:\s+(\d+)/)?.[1]);
const sourceHeight = Number(sourceInfo.match(/pixelHeight:\s+(\d+)/)?.[1]);
if (!sourceWidth || sourceWidth !== sourceHeight || !/format:\s+jpeg/.test(sourceInfo)) {
  throw new Error('Expected the supplied square JPEG; refusing to distort other artwork.');
}

fs.mkdirSync(brandDirectory, { recursive: true });
fs.mkdirSync(iconDirectory, { recursive: true });
if (inputPath !== sourcePath) fs.copyFileSync(inputPath, sourcePath);
const source = fs.readFileSync(sourcePath);

// The SVG embeds the original JPEG bytes. It adds no illustration or filter.
fs.writeFileSync(
  path.join(brandDirectory, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 ${sourceWidth} ${sourceHeight}"><image width="${sourceWidth}" height="${sourceHeight}" href="data:image/jpeg;base64,${source.toString('base64')}"/></svg>\n`,
);

const sizes = [
  ['polka-192.png', 192],
  ['polka-512.png', 512],
  ['polka-apple-180.png', 180],
  ['polka-favicon-32.png', 32],
];
for (const [name, size] of sizes) {
  sips('-s', 'format', 'png', '-z', String(size), String(size), sourcePath, '--out', path.join(iconDirectory, name));
}

// The coloured panels sit inside the maskable safe circle (80% of the icon).
// Resize uniformly to 384, then centre on black with a 64 px outer margin.
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'polka-icon-'));
try {
  const intermediate = path.join(temporaryDirectory, 'source-384.png');
  sips('-s', 'format', 'png', '-z', '384', '384', sourcePath, '--out', intermediate);
  sips('-p', '512', '512', '--padColor', '000000', intermediate, '--out', path.join(iconDirectory, 'polka-maskable-512.png'));
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}

for (const [name, size] of [...sizes, ['polka-maskable-512.png', 512]]) {
  const png = fs.readFileSync(path.join(iconDirectory, name));
  if (png.toString('hex', 0, 8) !== '89504e470d0a1a0a' || png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) {
    throw new Error(`Unexpected PNG dimensions: ${name}`);
  }
  console.log(`${name}: ${size} × ${size}`);
}
console.log(`Source: ${sourceWidth} × ${sourceHeight}, SHA-256 ${createHash('sha256').update(source).digest('hex')}`);
