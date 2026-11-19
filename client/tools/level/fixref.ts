// 给结构校验不过的关卡文件换一条参考解（docs/02 第 0.4 节）：参考解要「回放能赢、冰封泡落下时依赖泡还没破……」（LevelCheck.errors）。
// 换成想清楚的玩家（只看屏幕，core/solver/players.ts）赢下来、又过得了校验的一条；本来就过的文件不动。
// 用法：npx tsx tools/level/fixref.ts <关卡文件或目录…>   目录 = 里面全部 level_*.json
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CurveConfig } from '../../assets/scripts/core/config';
import { LevelData, Tap } from '../../assets/scripts/core/model/levelData';
import * as LevelCheck from '../../assets/scripts/core/solver/levelCheck';
import * as Players from '../../assets/scripts/core/solver/players';

const CLIENT = join(new URL('.', import.meta.url).pathname, '../..');
const curve = JSON.parse(readFileSync(join(CLIENT, 'assets/resources/config/level_curve.json'), 'utf8')) as CurveConfig;
const preview = curve.route?.preview ?? 0;

const files: string[] = [];
for (const a of process.argv.slice(2)) {
  if (statSync(a).isDirectory()) {
    for (const f of readdirSync(a).sort()) if (f.startsWith('level_') && f.endsWith('.json')) files.push(join(a, f));
  } else files.push(a);
}

const passes = (lv: LevelData, r: readonly Tap[]) => {
  const c = LevelData.fromDict(lv.toDict());
  c.ref = r.slice();
  return LevelCheck.errors(c).length === 0;
};

let fixed = 0;
const bad: string[] = [];
for (const f of files) {
  const lv = LevelData.fromJson(readFileSync(f, 'utf8')) as LevelData;
  const errs = LevelCheck.errors(lv);
  if (errs.length === 0) continue;
  let route: Tap[] | null = null;
  for (let g = 0; g < 60 && route === null; g++) {
    const p = Players.play(lv, 'think', 7000 + g, { preview });
    if (p.won && passes(lv, p.taps)) route = p.taps;
  }
  if (route === null) {
    bad.push(f);
    console.log(`✗ ${f}：${errs.join('；')}（想清楚的玩家 60 局都没找到过得了校验的路线）`);
    continue;
  }
  lv.ref = route;
  writeFileSync(f, lv.toJson() + '\n');
  fixed++;
  console.log(`✓ ${f}：${errs.join('；')} → 换了参考解（${route.length} 步）`);
}
console.log(`查了 ${files.length} 个文件，换了 ${fixed} 个，换不了 ${bad.length} 个`);
process.exit(bad.length > 0 ? 1 : 0);
