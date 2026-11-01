// Writes app/icons/{56,112}.png: the 9 base colors as a 3x3 grid on a rounded dark square with a soft
// shadow, in the proportions of the KaiOS sample icons (square is 88/104 of the canvas, set high).
// Run: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { BASE } = require('../app/js/core.js');

const FILL = [27, 29, 63];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

// Signed distance from (x, y) to a rounded rectangle; negative inside.
function sdRound(x, y, l, t, w, h, r) {
  const qx = Math.abs(x - (l + w / 2)) - (w / 2 - r), qy = Math.abs(y - (t + h / 2)) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

// Color and alpha at one sample point, before compositing over the shadow.
function shade(x, y, size) {
  const k = size / 104, side = 88 * k, left = 8 * k, top = 4 * k;
  if (sdRound(x, y, left, top, side, side, side * 0.23) > 0) return null;
  const pad = side * 0.13, gap = side * 0.045, tile = (side - 2 * pad - 2 * gap) / 3;
  for (let i = 0; i < 9; i++) {
    const tx = left + pad + (i % 3) * (tile + gap), ty = top + pad + Math.floor(i / 3) * (tile + gap);
    if (sdRound(x, y, tx, ty, tile, tile, tile * 0.24) <= 0) return BASE[i];
  }
  return FILL;
}

function png(size) {
  const k = size / 104, side = 88 * k, N = 4;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      // Supersample N x N for smooth edges.
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < N; sy++) for (let sx = 0; sx < N; sx++) {
        const c = shade(x + (sx + 0.5) / N, y + (sy + 0.5) / N, size);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
      }
      const cover = a / (N * N);
      // Soft shadow: the square shifted down, fading out over 8/104 of the canvas.
      const d = sdRound(x + 0.5, y + 0.5, 8 * k, 8 * k, side, side, side * 0.23), blur = 8 * k;
      const sh = d <= 0 ? 0.3 : d < blur ? 0.3 * Math.pow(1 - d / blur, 2) : 0;
      const outA = cover + sh * (1 - cover);
      const px = outA ? [r / (a || 1) * cover / outA, g / (a || 1) * cover / outA, b / (a || 1) * cover / outA] : [0, 0, 0];
      row.set([Math.round(px[0]), Math.round(px[1]), Math.round(px[2]), Math.round(outA * 255)], 1 + x * 4);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dir = path.join(__dirname, '..', 'app', 'icons');
fs.mkdirSync(dir, { recursive: true });
[56, 112].forEach(s => fs.writeFileSync(path.join(dir, s + '.png'), png(s)));
console.log('wrote', dir);
