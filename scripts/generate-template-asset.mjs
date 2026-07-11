// Dev-only asset generator. Not shipped in dist/.
//
// Takes a source PNG (monochrome-green, alpha channel encoding brightness —
// the format produced for Dashboard-notification-popup.png earlier in this
// project) and produces a src/templates/<name>.ts asset file containing a
// grid of base64-encoded, 4-bit-greyscale, opaque PNG tiles.
//
// Why tiles: a single Even Hub ImageContainerProperty caps at 288x144, well
// under the 576x288 canvas. To render a popup that actually uses a large
// fraction of the screen, the assembled image is split into a grid of tiles
// (each <=288x144, at most 4 total — the SDK's image-container max) that
// containers.ts positions edge-to-edge at render time.
//
// Rationale for opaque-greyscale (not alpha transparency): even-toolkit's
// glasses/png-utils.ts — the proven working pipeline for updateImageRawData
// on this SDK — always emits alpha=255 and encodes brightness as a 16-level
// (4-bit) greyscale value via UPNG.encode(..., 16). The glasses canvas
// background is black by default, so a 0-value (black) pixel already reads
// as "off" without needing real transparency.
//
// Usage: node scripts/generate-template-asset.mjs <name> <sourcePng> [targetWidth] [targetHeight]
// Example: node scripts/generate-template-asset.mjs incoming-call ../Dashboard-notification-popup-highres.png 560 120

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import UPNG from 'upng-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MAX_TILE_W = 288;
const MAX_TILE_H = 144;
const MAX_TILES = 4;

const [, , name, sourcePath, targetWidthArg, targetHeightArg] = process.argv;

if (!name || !sourcePath) {
  console.error('Usage: node generate-template-asset.mjs <name> <sourcePng> [targetWidth] [targetHeight]');
  process.exit(1);
}

const TARGET_W = Number(targetWidthArg) || 560;
const TARGET_H = Number(targetHeightArg) || 120;

const resolvedSource = path.resolve(process.cwd(), sourcePath);
const buf = fs.readFileSync(resolvedSource);
const img = UPNG.decode(buf);
const srcRgba = new Uint8Array(UPNG.toRGBA8(img)[0]);
const srcW = img.width;
const srcH = img.height;

// Source encodes brightness in the alpha channel (RGB is constant pure
// green: 0,255,0). Extract a single-channel luminance map from alpha.
function luminanceAt(x, y) {
  const i = (y * srcW + x) * 4;
  return srcRgba[i + 3];
}

// Never upscale — a small source stays small rather than getting blurry.
const scale = Math.min(TARGET_W / srcW, TARGET_H / srcH, 1);
const dstW = Math.max(1, Math.round(srcW * scale));
const dstH = Math.max(1, Math.round(srcH * scale));

if (dstW < TARGET_W || dstH < TARGET_H) {
  console.warn(
    `Note: source (${srcW}x${srcH}) isn't large enough to reach the requested ${TARGET_W}x${TARGET_H} without upscaling. ` +
      `Actual output is ${dstW}x${dstH}. Provide a higher-resolution source to get closer to the request.`,
  );
}

// Box-average downsample so thin border lines / small glyph strokes survive
// the scale-down instead of being dropped by nearest-neighbor sampling.
function downsample() {
  const out = new Float64Array(dstW * dstH);
  const counts = new Uint32Array(dstW * dstH);
  for (let sy = 0; sy < srcH; sy++) {
    const dy = Math.min(dstH - 1, Math.floor(sy * scale));
    for (let sx = 0; sx < srcW; sx++) {
      const dx = Math.min(dstW - 1, Math.floor(sx * scale));
      const di = dy * dstW + dx;
      out[di] += luminanceAt(sx, sy);
      counts[di] += 1;
    }
  }
  const result = new Uint8ClampedArray(dstW * dstH);
  for (let i = 0; i < result.length; i++) {
    result[i] = counts[i] ? Math.round(out[i] / counts[i]) : 0;
  }
  return result;
}

const luminance = downsample(); // single-channel luminance, dstW x dstH

// Split the assembled image into a grid of tiles, each within the SDK's
// per-container cap.
const cols = Math.ceil(dstW / MAX_TILE_W);
const rows = Math.ceil(dstH / MAX_TILE_H);
if (cols * rows > MAX_TILES) {
  console.error(
    `even-notifications: ${dstW}x${dstH} needs a ${cols}x${rows} grid (${cols * rows} tiles), ` +
      `exceeding the SDK's 4-image-container max. Reduce targetWidth/targetHeight.`,
  );
  process.exit(1);
}

const tileW = Math.ceil(dstW / cols);
const tileH = Math.ceil(dstH / rows);

// Quantize to 16 grey levels (4-bit), matching even-toolkit's png-utils.ts
// pipeline, and emit as an opaque RGBA buffer for UPNG.
function quantizeAndEncode(tileLuminance, w, h) {
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < tileLuminance.length; i++) {
    const level = Math.min(15, Math.round(tileLuminance[i] / 17));
    const v = level * 17;
    rgba[i * 4] = v;
    rgba[i * 4 + 1] = v;
    rgba[i * 4 + 2] = v;
    rgba[i * 4 + 3] = 255;
  }
  const encoded = UPNG.encode([rgba.buffer], w, h, 16);
  return Buffer.from(new Uint8Array(encoded)).toString('base64');
}

const tiles = [];
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const xOffset = c * tileW;
    const yOffset = r * tileH;
    const w = Math.min(tileW, dstW - xOffset);
    const h = Math.min(tileH, dstH - yOffset);
    const tileLuminance = new Uint8ClampedArray(w * h);
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        tileLuminance[ty * w + tx] = luminance[(yOffset + ty) * dstW + (xOffset + tx)];
      }
    }
    tiles.push({ xOffset, yOffset, width: w, height: h, base64: quantizeAndEncode(tileLuminance, w, h) });
  }
}

const outPath = path.join(__dirname, '..', 'src', 'templates', `${name}.ts`);
const varName = name.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase());

const tilesLiteral = tiles
  .map(
    (t) =>
      `  { xOffset: ${t.xOffset}, yOffset: ${t.yOffset}, width: ${t.width}, height: ${t.height}, pngBase64: '${t.base64}' },`,
  )
  .join('\n');

const fileContents = `// Generated by scripts/generate-template-asset.mjs from ${path.relative(path.join(__dirname, '..'), resolvedSource)}
// Do not edit by hand — re-run the generator to update.
import type { TemplateTile } from '../types.js';

export const ${varName}Width = ${dstW};
export const ${varName}Height = ${dstH};
export const ${varName}Tiles: TemplateTile[] = [
${tilesLiteral}
];
`;

fs.writeFileSync(outPath, fileContents);
console.log(
  `wrote ${outPath}: assembled ${dstW}x${dstH} as a ${cols}x${rows} grid (${tiles.length} tile(s)), source ${srcW}x${srcH} scaled by ${scale.toFixed(4)}`,
);
