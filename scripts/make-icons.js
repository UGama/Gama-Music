#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'web', 'assets');

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrcTable();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function writePng(width, height, rgba, filePath) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const scanlineStart = y * (width * 4 + 1);
    scanlines[scanlineStart] = 0;
    rgba.copy(scanlines, scanlineStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const png = Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);

  fs.writeFileSync(filePath, png);
}

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16)
  ];
}

function blend(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function roundedRectContains(px, py, x, y, w, h, r) {
  const cx = Math.max(x + r, Math.min(px, x + w - r));
  const cy = Math.max(y + r, Math.min(py, y + h - r));
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function drawIcon(size, fileName) {
  const rgba = Buffer.alloc(size * size * 4);
  const bgA = hexToRgb('#101113');
  const bgB = hexToRgb('#20283a');
  const teal = hexToRgb('#356ae6');
  const coral = hexToRgb('#ef6757');
  const paper = hexToRgb('#f8f8f4');

  function setPixel(x, y, rgb, alpha = 255) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const nextAlpha = alpha / 255;
    rgba[i] = blend(rgba[i], rgb[0], nextAlpha);
    rgba[i + 1] = blend(rgba[i + 1], rgb[1], nextAlpha);
    rgba[i + 2] = blend(rgba[i + 2], rgb[2], nextAlpha);
    rgba[i + 3] = 255;
  }

  function fillRoundedRect(x, y, w, h, r, rgb, alpha = 255) {
    const minX = Math.floor(x);
    const minY = Math.floor(y);
    const maxX = Math.ceil(x + w);
    const maxY = Math.ceil(y + h);
    for (let py = minY; py < maxY; py += 1) {
      for (let px = minX; px < maxX; px += 1) {
        if (roundedRectContains(px + 0.5, py + 0.5, x, y, w, h, r)) {
          setPixel(px, py, rgb, alpha);
        }
      }
    }
  }

  function strokeCircle(cx, cy, radius, width, rgb, alpha = 255) {
    const min = Math.floor(cx - radius - width);
    const max = Math.ceil(cx + radius + width);
    for (let y = min; y <= max; y += 1) {
      for (let x = min; x <= max; x += 1) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d >= radius - width / 2 && d <= radius + width / 2) {
          setPixel(x, y, rgb, alpha);
        }
      }
    }
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const t = (x + y) / (size * 2);
      const v = Math.hypot(x - size * 0.72, y - size * 0.18) / size;
      const rgb = [
        blend(bgA[0], bgB[0], Math.min(1, t + v * 0.25)),
        blend(bgA[1], bgB[1], Math.min(1, t + v * 0.25)),
        blend(bgA[2], bgB[2], Math.min(1, t + v * 0.25))
      ];
      setPixel(x, y, rgb, 255);
    }
  }

  fillRoundedRect(size * 0.16, size * 0.18, size * 0.68, size * 0.64, size * 0.08, [255, 255, 255], 18);
  strokeCircle(size * 0.5, size * 0.49, size * 0.23, size * 0.045, teal, 240);
  strokeCircle(size * 0.5, size * 0.49, size * 0.145, size * 0.035, paper, 230);
  fillRoundedRect(size * 0.43, size * 0.42, size * 0.14, size * 0.14, size * 0.035, coral, 250);

  const bars = [
    [0.25, 0.42, 0.08, 0.25, teal],
    [0.36, 0.32, 0.08, 0.36, coral],
    [0.56, 0.29, 0.08, 0.39, teal],
    [0.67, 0.39, 0.08, 0.29, coral]
  ];
  for (const [x, y, w, h, color] of bars) {
    fillRoundedRect(size * x, size * y, size * w, size * h, size * 0.035, color, 245);
  }

  writePng(size, size, rgba, path.join(assets, fileName));
}

fs.mkdirSync(assets, { recursive: true });
drawIcon(180, 'apple-touch-icon.png');
drawIcon(192, 'icon-192.png');
drawIcon(512, 'icon-512.png');

console.log('Generated Gama Music app icons.');
