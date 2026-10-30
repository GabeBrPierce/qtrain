// Writes app/icons/{56,112}.png: the 9 base colors as a 3x3 grid of rounded tiles on a dark square.
// Run: node tools/make-icons.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { BASE } = require('../app/js/core.js');

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

function png(size) {
  const pad = Math.round(size * 0.08), gap = Math.max(1, Math.round(size * 0.04));
  const tile = (size - 2 * pad - 2 * gap) / 3, r = tile * 0.22;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      let px = [17, 17, 17, 255];
      const gx = Math.floor((x - pad) / (tile + gap)), gy = Math.floor((y - pad) / (tile + gap));
      if (gx >= 0 && gx < 3 && gy >= 0 && gy < 3) {
        const lx = x - pad - gx * (tile + gap), ly = y - pad - gy * (tile + gap);
        const dx = Math.max(r - lx, 0, lx - (tile - r)), dy = Math.max(r - ly, 0, ly - (tile - r));
        if (lx < tile && ly < tile && dx * dx + dy * dy <= r * r) px = BASE[gy * 3 + gx].concat(255);
      }
      row.set(px, 1 + x * 4);
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
