import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const ICONS = join(PUBLIC, 'icons');

const GROVE = [31, 107, 69, 255];
const PAPER = [244, 239, 228, 255];
const WHITE = [255, 255, 255, 255];
const CLAY = [196, 92, 38, 255];

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const dest = y * (width * 4 + 1);
    raw[dest] = 0;
    rgba.copy(raw, dest + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function setPixel(rgba, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  rgba[i] = color[0];
  rgba[i + 1] = color[1];
  rgba[i + 2] = color[2];
  rgba[i + 3] = color[3];
}

function fillRect(rgba, size, x0, y0, x1, y1, color) {
  const minX = Math.max(0, Math.floor(x0));
  const minY = Math.max(0, Math.floor(y0));
  const maxX = Math.min(size - 1, Math.ceil(x1));
  const maxY = Math.min(size - 1, Math.ceil(y1));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      setPixel(rgba, size, x, y, color);
    }
  }
}

function fillCircle(rgba, size, cx, cy, r, color) {
  const r2 = r * r;
  const minX = Math.max(0, Math.floor(cx - r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxX = Math.min(size - 1, Math.ceil(cx + r));
  const maxY = Math.min(size - 1, Math.ceil(cy + r));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) setPixel(rgba, size, x, y, color);
    }
  }
}

function fillRoundRect(rgba, size, x, y, w, h, r, color) {
  fillRect(rgba, size, x + r, y, x + w - r, y + h, color);
  fillRect(rgba, size, x, y + r, x + w, y + h - r, color);
  fillCircle(rgba, size, x + r, y + r, r, color);
  fillCircle(rgba, size, x + w - r, y + r, r, color);
  fillCircle(rgba, size, x + r, y + h - r, r, color);
  fillCircle(rgba, size, x + w - r, y + h - r, r, color);
}

function drawMic(rgba, size, pad) {
  const inner = size - pad * 2;
  const cx = size / 2;
  const cy = pad + inner * 0.46;
  const capsuleW = inner * 0.22;
  const capsuleH = inner * 0.38;
  const capsuleR = capsuleW / 2;

  fillRoundRect(
    rgba,
    size,
    cx - capsuleW / 2,
    cy - capsuleH / 2,
    capsuleW,
    capsuleH,
    capsuleR,
    WHITE
  );

  const yokeR = inner * 0.22;
  const yokeT = Math.max(4, inner * 0.045);
  const yokeCy = cy + inner * 0.02;
  for (let y = Math.floor(yokeCy); y <= yokeCy + yokeR; y += 1) {
    for (let x = Math.floor(cx - yokeR); x <= cx + yokeR; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - yokeCy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= yokeR && d >= yokeR - yokeT) setPixel(rgba, size, x, y, WHITE);
    }
  }

  const stemH = inner * 0.16;
  const stemW = Math.max(4, inner * 0.05);
  fillRect(rgba, size, cx - stemW / 2, yokeCy + yokeR - 2, cx + stemW / 2, yokeCy + yokeR + stemH, WHITE);
  fillRoundRect(
    rgba,
    size,
    cx - inner * 0.14,
    yokeCy + yokeR + stemH - inner * 0.02,
    inner * 0.28,
    inner * 0.055,
    inner * 0.02,
    WHITE
  );

  fillCircle(rgba, size, pad + inner * 0.82, pad + inner * 0.2, inner * 0.055, CLAY);
}

function makeIcon(size, { maskable = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  rgba.fill(255);
  const padOuter = maskable ? size * 0.12 : 0;
  fillRoundRect(rgba, size, padOuter, padOuter, size - padOuter * 2, size - padOuter * 2, size * (maskable ? 0.22 : 0.22), GROVE);
  drawMic(rgba, size, size * (maskable ? 0.28 : 0.18));
  return encodePng(size, size, rgba);
}

function makeFaviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#1F6B45"/>
  <rect x="26" y="12" width="12" height="22" rx="6" fill="#F4EFE4"/>
  <path d="M20 28a12 12 0 0 0 24 0" fill="none" stroke="#F4EFE4" stroke-width="3.5" stroke-linecap="round"/>
  <path d="M32 40v8M24 50h16" fill="none" stroke="#F4EFE4" stroke-width="3.5" stroke-linecap="round"/>
  <circle cx="48" cy="16" r="3.5" fill="#C45C26"/>
</svg>
`;
}

mkdirSync(ICONS, { recursive: true });
writeFileSync(join(PUBLIC, 'favicon.svg'), makeFaviconSvg());
writeFileSync(join(ICONS, 'icon-192.png'), makeIcon(192));
writeFileSync(join(ICONS, 'icon-512.png'), makeIcon(512));
writeFileSync(join(ICONS, 'icon-512-maskable.png'), makeIcon(512, { maskable: true }));
writeFileSync(join(PUBLIC, 'apple-touch-icon.png'), makeIcon(180));

console.log('Wrote PWA icons to frontend/public');
