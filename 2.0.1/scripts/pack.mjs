/**
 * 크롬 웹스토어 업로드용 ZIP 패키징.
 *
 *   node scripts/pack.mjs        →  dist/dc-ultimate-<version>.zip
 *
 * ZIP 스펙(APPNOTE 4.4.17)은 엔트리 이름의 경로 구분자로 슬래시(`/`)만
 * 허용한다. 역슬래시로 저장하는 도구를 쓰면 크롬이 `assets\icons\icon128.png`
 * 를 폴더가 아닌 단일 파일명으로 읽어, manifest 가 가리키는 경로가 사라지고
 * "이미지를 디코딩하지 못했습니다" 오류로 설치가 실패한다. 이 스크립트는
 * 항상 슬래시로 기록한다.
 *
 * 외부 의존성 없이 Node 내장 zlib 만 사용한다.
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { crc32 } from './lib/crc32.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

// 업로드 패키지에서 빼는 경로. 디렉터리 이름 또는 확장자.
const EXCLUDED_DIRS = new Set(['node_modules', 'tests', 'dist', '.git', 'master', 'docs', 'scripts']);
const EXCLUDED_FILES = new Set(['package-lock.json', 'package.json', '.gitattributes', '.gitignore']);
const EXCLUDED_EXTS = new Set(['.zip']);

// ZIP 은 1980년 이전 시각을 표현할 수 없다. 같은 입력이면 같은 바이트가
// 나오도록 파일 mtime 대신 고정 타임스탬프를 쓴다.
const DOS_TIME = 0;
const DOS_DATE = (1980 - 1980) << 9 | 1 << 5 | 1;

function collect(dir, prefix = '') {
  const entries = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (EXCLUDED_DIRS.has(name)) continue;
      entries.push(...collect(full, `${prefix}${name}/`)); // 항상 슬래시
    } else if (stat.isFile()) {
      if (EXCLUDED_FILES.has(name) || EXCLUDED_EXTS.has(path.extname(name))) continue;
      entries.push({ name: `${prefix}${name}`, path: full });
    }
  }
  return entries;
}

function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    if (nameBytes.includes(0x5c)) {
      throw new Error(`엔트리 이름에 역슬래시가 있습니다: ${entry.name}`);
    }
    const content = fs.readFileSync(entry.path);
    const deflated = zlib.deflateRawSync(content, { level: 9 });
    // 압축이 커지는 작은 파일은 무압축(method 0)으로 저장한다.
    const stored = deflated.length >= content.length;
    const data = stored ? content : deflated;
    const method = stored ? 0 : 8;
    const sum = crc32(content);

    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: UTF-8 파일명
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    nameBytes.copy(local, 30);
    locals.push(local, data);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attributes: 유닉스 0644
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centrals.push(central);

    offset += local.length + data.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // central directory start disk
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...locals, centralBuffer, eocd]);
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
if (manifest.version !== pkg.version) {
  throw new Error(`버전이 어긋납니다: manifest.json=${manifest.version}, package.json=${pkg.version}`);
}

// manifest 가 선언한 아이콘이 실제로 패키지에 들어가는지 확인한다.
const declaredIcons = new Set([
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
]);

const entries = collect(ROOT);
const packed = new Set(entries.map((e) => e.name));
const missing = [...declaredIcons].filter((icon) => !packed.has(icon));
if (missing.length) {
  throw new Error(`manifest 가 선언한 아이콘이 패키지에 없습니다: ${missing.join(', ')}`);
}

fs.mkdirSync(DIST, { recursive: true });
const outPath = path.join(DIST, `dc-ultimate-${manifest.version}.zip`);
const zip = buildZip(entries);
fs.writeFileSync(outPath, zip);

console.log(`패키지: ${path.relative(process.cwd(), outPath)}`);
console.log(`  엔트리 ${entries.length}개, ${(zip.length / 1024).toFixed(1)} KB`);
console.log(`  경로 구분자: / (역슬래시 0개)`);
console.log(`  아이콘: ${[...declaredIcons].sort().join(', ')}`);
