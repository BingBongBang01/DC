/**
 * 확장 프로그램 아이콘 생성기.
 *
 * assets/icons/master/icon-2048.png 를 읽어 manifest 가 요구하는 크기의
 * 아이콘을 만든다. chrome.notifications 의 iconUrl 도 icon128.png 를 쓴다. 출력 PNG 는 IHDR / IDAT / IEND 만 담고 있어 편집기가 남기는
 * 사설 청크(caBX 등)가 섞이지 않는다 — 사설 청크와 과대 해상도가 설치 시점
 * "이미지를 디코딩하지 못했습니다" 오류의 원인이었다.
 *
 * 외부 의존성 없이 Node 내장 zlib 만 사용한다.
 *
 *   node scripts/generate-icons.mjs
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { crc32 } from './lib/crc32.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = path.join(__dirname, '../assets/icons');
const MASTER = path.join(ICONS_DIR, 'master/icon-2048.png');

// manifest 의 icons / action.default_icon 에 선언된 크기.
const OUTPUTS = [
  { file: 'icon16.png', size: 16 },
  { file: 'icon48.png', size: 48 },
  { file: 'icon128.png', size: 128 },
];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = 4; // RGBA

/** PNG 를 { width, height, pixels } 로 디코딩한다 (8bit RGBA, non-interlaced 전용). */
function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('PNG 시그니처가 아닙니다.');
  }

  let header = null;
  const idatParts = [];
  let offset = 8;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);

    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      idatParts.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }

    offset += 12 + length;
  }

  if (!header) throw new Error('IHDR 청크가 없습니다.');
  const { width, height, bitDepth, colorType, interlace } = header;
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(
      `지원하지 않는 PNG 형식입니다 (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}). ` +
        '8bit RGBA / non-interlaced 만 처리합니다.'
    );
  }

  const raw = zlib.inflateSync(Buffer.concat(idatParts));
  const stride = width * CHANNELS;
  if (raw.length !== height * (1 + stride)) {
    throw new Error(`압축 해제 크기가 맞지 않습니다: ${raw.length} != ${height * (1 + stride)}`);
  }

  return { width, height, pixels: unfilter(raw, width, height) };
}

/** PNG 행 필터(0~4)를 역적용한다. */
function unfilter(raw, width, height) {
  const stride = width * CHANNELS;
  const pixels = Buffer.alloc(height * stride);
  let pos = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[pos];
    pos += 1;
    const row = pixels.subarray(y * stride, (y + 1) * stride);
    raw.copy(row, 0, pos, pos + stride);
    pos += stride;
    const prev = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x += 1) {
      const a = x >= CHANNELS ? row[x - CHANNELS] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= CHANNELS ? prev[x - CHANNELS] : 0;

      switch (filter) {
        case 0:
          break;
        case 1:
          row[x] = (row[x] + a) & 0xff;
          break;
        case 2:
          row[x] = (row[x] + b) & 0xff;
          break;
        case 3:
          row[x] = (row[x] + ((a + b) >> 1)) & 0xff;
          break;
        case 4:
          row[x] = (row[x] + paeth(a, b, c)) & 0xff;
          break;
        default:
          throw new Error(`알 수 없는 필터 타입: ${filter} (행 ${y})`);
      }
    }
  }

  return pixels;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * 면적 평균(area average)으로 축소한다. 2048→128 처럼 정수배가 아닌
 * 2048→48, 2048→16 도 같은 경로로 처리된다. 알파는 프리멀티플라이해서
 * 섞어야 투명 픽셀의 색이 경계로 번지지 않는다.
 */
function resize(source, size) {
  const { width, height, pixels } = source;
  const out = Buffer.alloc(size * size * CHANNELS);
  const scaleX = width / size;
  const scaleY = height / size;

  for (let y = 0; y < size; y += 1) {
    const y0 = Math.floor(y * scaleY);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scaleY));

    for (let x = 0; x < size; x += 1) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scaleX));

      let r = 0;
      let g = 0;
      let b = 0;
      let alpha = 0;
      let count = 0;

      for (let sy = y0; sy < y1; sy += 1) {
        let idx = (sy * width + x0) * CHANNELS;
        for (let sx = x0; sx < x1; sx += 1) {
          const a = pixels[idx + 3];
          r += pixels[idx] * a;
          g += pixels[idx + 1] * a;
          b += pixels[idx + 2] * a;
          alpha += a;
          count += 1;
          idx += CHANNELS;
        }
      }

      const target = (y * size + x) * CHANNELS;
      if (alpha === 0) {
        out[target] = 0;
        out[target + 1] = 0;
        out[target + 2] = 0;
        out[target + 3] = 0;
      } else {
        out[target] = Math.round(r / alpha);
        out[target + 1] = Math.round(g / alpha);
        out[target + 2] = Math.round(b / alpha);
        out[target + 3] = Math.round(alpha / count);
      }
    }
  }

  return { width: size, height: size, pixels: out };
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** IHDR / IDAT / IEND 만 담은 PNG 로 인코딩한다. */
function encodePng({ width, height, pixels }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = width * CHANNELS;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y += 1) {
    raw[y * (1 + stride)] = 0; // filter: None
    pixels.copy(raw, y * (1 + stride) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const master = decodePng(fs.readFileSync(MASTER));
console.log(`마스터: ${path.relative(process.cwd(), MASTER)} (${master.width}×${master.height})`);

for (const { file, size } of OUTPUTS) {
  const buffer = encodePng(resize(master, size));
  fs.writeFileSync(path.join(ICONS_DIR, file), buffer);
  console.log(`  생성: assets/icons/${file} (${size}×${size}, ${buffer.length} B)`);
}
