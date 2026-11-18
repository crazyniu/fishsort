#!/usr/bin/env node
// 文案：仓库根的 i18n/strings.csv（keys,zh_CN,en）→ client/assets/resources/i18n/strings.json。
// 代码里一律用 key 取（tr()），不写死中文（CLAUDE.md 硬性约束 6）。用法：node tools/i18n.mjs [--check]
// 加载页要的几条（BOOT_ 开头的 key）另写一份进 assets/boot/strings.json：加载页出来时 resources 还没下载（微信版放在网上）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLIENT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(CLIENT, '../i18n/strings.csv');
const OUT = join(CLIENT, 'assets/resources/i18n/strings.json');
const BOOT_OUT = join(CLIENT, 'assets/boot/strings.json');

/** RFC 4180：引号包起来的字段里可以有逗号、换行，"" 表示一个引号 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let f = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (f += '"'), i++;
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(f), (f = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f), rows.push(row), (row = []), (f = '');
    } else f += c;
  }
  if (f !== '' || row.length) row.push(f), rows.push(row);
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

const rows = parseCsv(readFileSync(SRC, 'utf8'));
const [head, ...body] = rows;
const langs = head.slice(1);
const out = Object.fromEntries(langs.map((l) => [l, {}]));
const seen = new Set();
for (const r of body) {
  const key = r[0];
  if (seen.has(key)) throw new Error(`重复的 key：${key}`);
  seen.add(key);
  langs.forEach((l, i) => (out[l][key] = r[i + 1] ?? ''));
}
const text = JSON.stringify(out, null, 1) + '\n';
const boot = Object.fromEntries(langs.map((l) => [l, Object.fromEntries(Object.entries(out[l]).filter(([k]) => k.startsWith('BOOT_')))]));
const bootText = JSON.stringify(boot, null, 1) + '\n';
if (process.argv.includes('--check')) {
  for (const [path, want] of [
    [OUT, text],
    [BOOT_OUT, bootText],
  ]) {
    let old = '';
    try {
      old = readFileSync(path, 'utf8');
    } catch {}
    if (old !== want) {
      console.error(`✗ ${path.slice(CLIENT.length + 1)} 和 strings.csv 不一致，跑 node tools/i18n.mjs`);
      process.exit(1);
    }
  }
} else {
  writeFileSync(OUT, text);
  writeFileSync(BOOT_OUT, bootText);
  console.log(`✓ ${seen.size} 条文案 → assets/resources/i18n/strings.json（加载页的几条另写 assets/boot/strings.json）`);
}
