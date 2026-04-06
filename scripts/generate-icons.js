'use strict';

/**
 * Pure Node.js PNG icon generator — no native dependencies.
 * Produces build/icon.png (512×512) and build/tray-icon.png (22×22).
 * Runs automatically via the "postinstall" npm hook.
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ─── CRC32 ───────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── PNG chunk ───────────────────────────────────────────────────────────────

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const lenBuf    = Buffer.allocUnsafe(4);
  const crcBuf    = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([lenBuf, typeBytes, data, crcBuf]);
}

// ─── PNG encoder ─────────────────────────────────────────────────────────────

/**
 * Create a PNG buffer from a pixel function.
 * pixelFn(x, y) must return [r, g, b, a] each 0–255.
 */
function createPNG(width, height, pixelFn) {
  // IHDR: width(4) height(4) bitDepth(1) colorType(1=RGBA→6) compress filter interlace
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width,  0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8]  = 8; // bit depth
  ihdr[9]  = 6; // color type: RGBA
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // no interlace

  // Build raw scan lines: 1 filter byte + RGBA per pixel
  const rowBytes = 1 + width * 4;
  const raw      = Buffer.allocUnsafe(height * rowBytes);

  for (let y = 0; y < height; y++) {
    const base = y * rowBytes;
    raw[base] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const px = base + 1 + x * 4;
      raw[px]     = r & 0xFF;
      raw[px + 1] = g & 0xFF;
      raw[px + 2] = b & 0xFF;
      raw[px + 3] = a & 0xFF;
    }
  }

  const idat = zlib.deflateSync(raw, { level: 6 });

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Geometry helpers ─────────────────────────────────────────────────────────

/** Returns true if (x, y) is inside a rounded rectangle. */
function insideRoundedRect(x, y, rx, ry, rw, rh, cr) {
  if (x < rx || x > rx + rw || y < ry || y > ry + rh) return false;
  if (x < rx + cr  && y < ry + cr)       return (x - rx - cr)       ** 2 + (y - ry - cr)       ** 2 <= cr * cr;
  if (x > rx+rw-cr && y < ry + cr)       return (x - rx - rw + cr)  ** 2 + (y - ry - cr)       ** 2 <= cr * cr;
  if (x < rx + cr  && y > ry + rh - cr)  return (x - rx - cr)       ** 2 + (y - ry - rh + cr)  ** 2 <= cr * cr;
  if (x > rx+rw-cr && y > ry + rh - cr)  return (x - rx - rw + cr)  ** 2 + (y - ry - rh + cr)  ** 2 <= cr * cr;
  return true;
}

/** Signed distance from point (px,py) to line segment (x1,y1)→(x2,y2).
 *  Returns the perpendicular distance and the normalised t along the segment. */
function distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { d: Math.hypot(px - x1, py - y1), t: 0 };
  const t = ((px - x1) * dx + (py - y1) * dy) / len2;
  const tc = Math.max(0, Math.min(1, t));
  return { d: Math.hypot(px - (x1 + tc * dx), py - (y1 + tc * dy)), t };
}

// ─── App icon 512 × 512 ──────────────────────────────────────────────────────
// Blue rounded-square background with a white envelope body and wing tips.

const APP_SIZE = 512;
const S = APP_SIZE;

const appIcon = createPNG(S, S, (x, y) => {
  const BLUE  = [26, 115, 232, 255];
  const WHITE = [255, 255, 255, 255];
  const CLEAR = [0, 0, 0, 0];

  // ── Blue rounded-square background ───────────────────────────────────────
  const bgM = S * 0.07;          // margin
  const bgR = S * 0.18;          // corner radius
  if (!insideRoundedRect(x, y, bgM, bgM, S - 2 * bgM, S - 2 * bgM, bgR)) return CLEAR;

  // ── Envelope body rectangle ───────────────────────────────────────────────
  const eX  = S * 0.20,  eY  = S * 0.295;
  const eW  = S * 0.60,  eH  = S * 0.41;
  const eCX = eX + eW / 2;
  const flapApexY = eY + eH * 0.40;   // V-fold crease depth

  // ── Wing tips: triangles extending left and right of the envelope ─────────
  const midY   = eY + eH * 0.50;
  const wTip   = S * 0.105;   // horizontal extent of wing beyond envelope edge
  const wHalf  = S * 0.10;    // half-height of wing at its base (envelope edge)

  // Left wing: tip at (eX - wTip, midY); base edge at x = eX
  if (x >= eX - wTip && x < eX) {
    const t      = (x - (eX - wTip)) / wTip;  // 0 at pointy tip, 1 at envelope edge
    const halfH  = wHalf * t;
    if (y >= midY - halfH && y <= midY + halfH) return WHITE;
  }

  // Right wing: tip at (eX + eW + wTip, midY); base edge at x = eX + eW
  const rX = eX + eW;
  if (x > rX && x <= rX + wTip) {
    const t      = (rX + wTip - x) / wTip;
    const halfH  = wHalf * t;
    if (y >= midY - halfH && y <= midY + halfH) return WHITE;
  }

  // ── Main envelope body ────────────────────────────────────────────────────
  if (x >= eX && x <= eX + eW && y >= eY && y <= eY + eH) {
    // V-fold crease lines drawn as blue strokes inside the white rectangle
    const stroke = S * 0.022;   // thickness of the crease lines

    // Left diagonal: top-left corner → V-apex
    const { d: dL, t: tL } = distToSeg(x, y, eX, eY, eCX, flapApexY);
    if (dL < stroke && tL >= 0 && tL <= 1) return BLUE;

    // Right diagonal: V-apex → top-right corner
    const { d: dR, t: tR } = distToSeg(x, y, eCX, flapApexY, eX + eW, eY);
    if (dR < stroke && tR >= 0 && tR <= 1) return BLUE;

    return WHITE;
  }

  return BLUE;
});

// ─── Tray icon 22 × 22 ───────────────────────────────────────────────────────
// Monochrome envelope with wing tips (transparent background — macOS template-friendly).

const TRAY_SIZE = 22;

const trayIcon = createPNG(TRAY_SIZE, TRAY_SIZE, (x, y) => {
  const DARK  = [30, 30, 30, 255];
  const CLEAR = [0, 0, 0, 0];

  const eX = 0, eY = 3, eW = TRAY_SIZE - 1, eH = 14;
  const eCX   = eX + eW / 2;
  const flapY = eY + eH * 0.42;
  const midY  = eY + eH * 0.50;
  const wTip  = 2, wHalf = 3;

  // Wing tips
  if (x >= eX - wTip && x < eX) {
    const t = (x - (eX - wTip)) / wTip;
    if (y >= midY - wHalf * t && y <= midY + wHalf * t) return DARK;
  }
  const rXt = eX + eW;
  if (x > rXt && x <= rXt + wTip) {
    const t = (rXt + wTip - x) / wTip;
    if (y >= midY - wHalf * t && y <= midY + wHalf * t) return DARK;
  }

  // Envelope body
  if (x >= eX && x <= eX + eW && y >= eY && y <= eY + eH) {
    // V-flap: top portion uses diagonal boundaries; above the V → transparent (gap/indent look)
    if (y < flapY) {
      const leftDiagY  = eY + (x - eX)       * (flapY - eY) / (eCX - eX);
      const rightDiagY = eY + (eX + eW - x)  * (flapY - eY) / (eX + eW - eCX);
      if (y < Math.min(leftDiagY, rightDiagY)) return CLEAR;
    }
    return DARK;
  }

  return CLEAR;
});

// ─── Write output ─────────────────────────────────────────────────────────────

const buildDir = path.join(__dirname, '..', 'build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

fs.writeFileSync(path.join(buildDir, 'icon.png'),       appIcon);
fs.writeFileSync(path.join(buildDir, 'tray-icon.png'),  trayIcon);

console.log('✓ Icons generated in build/');
