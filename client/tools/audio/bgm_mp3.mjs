// 背景音乐转 MP3（包体：wav 1.7 MB → mp3 约 0.3 MB；音效短、要低延迟，仍用 wav）。
// 在 tools/audio/prepare.py 之后跑：node tools/audio/bgm_mp3.mjs
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Mp3Encoder } from '@breezystack/lamejs';
const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../assets/resources/audio');
const src = join(DIR, 'bgm.wav');
if (!existsSync(src)) {
  console.log('没有 bgm.wav，跳过');
  process.exit(0);
}
const buf = readFileSync(src);
// 只认 prepare.py 写出的格式：PCM 16 位单声道，data 块
let off = 12;
let rate = 22050;
let data = null;
while (off < buf.length) {
  const id = buf.toString('ascii', off, off + 4);
  const size = buf.readUInt32LE(off + 4);
  if (id === 'fmt ') {
    if (buf.readUInt16LE(off + 10) !== 1 || buf.readUInt16LE(off + 22) !== 16) throw new Error('bgm.wav 要求单声道 16 位');
    rate = buf.readUInt32LE(off + 12);
  }
  if (id === 'data') data = new Int16Array(buf.buffer.slice(buf.byteOffset + off + 8, buf.byteOffset + off + 8 + size));
  off += 8 + size + (size % 2);
}
if (!data) throw new Error('bgm.wav 没有 data 块');
const enc = new Mp3Encoder(1, rate, 64);
const parts = [];
for (let i = 0; i < data.length; i += 1152) {
  const b = enc.encodeBuffer(data.subarray(i, i + 1152));
  if (b.length) parts.push(Buffer.from(b));
}
parts.push(Buffer.from(enc.flush()));
const out = Buffer.concat(parts);
writeFileSync(join(DIR, 'bgm.mp3'), out);
rmSync(src);
rmSync(src + '.meta', { force: true });
console.log(`✓ bgm.wav ${(buf.length / 1e6).toFixed(2)} MB → bgm.mp3 ${(out.length / 1e6).toFixed(2)} MB`);
