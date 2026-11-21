// 量包里的关有多难（docs/02 第 0 节）：三个只看屏幕的玩家（core/solver/players.ts）不用道具能过几成，
// 关卡给的暂存槽格数和加减几格（难度调试页「整体」三档：困难少 1 格、简单多 1 格）各量一次。
// 用法：./run.sh level-measure 6,10,200 [--buffer=-1,1] [--games=100] [--preview=3]
//   --buffer   另外再量哪几种格数变化（逗号隔开，默认 -1 = 调试页的「困难」）
//   --games    每个玩家打几局（默认 100；想清楚的玩家慢，打它的一半）
//   --preview  看得到后面几缸（默认 level_curve.json 的 route.preview）
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CurveConfig } from '../../assets/scripts/core/config';
import * as LevelCurve from '../../assets/scripts/core/gen/levelCurve';
import { LevelData } from '../../assets/scripts/core/model/levelData';
import * as Players from '../../assets/scripts/core/solver/players';

const CLIENT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const curve = JSON.parse(readFileSync(join(CLIENT, 'assets/resources/config/level_curve.json'), 'utf8')) as CurveConfig;
const arg = (name: string, def: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def;
const ids = (process.argv[2] ?? '').split(',').map(Number).filter((x) => x > 0);
if (ids.length === 0) {
  console.log('用法：./run.sh level-measure 6,10,200 [--buffer=-1,1] [--games=100] [--preview=3]');
  process.exit(1);
}
const deltas = [0, ...arg('buffer', '-1').split(',').map(Number).filter((x) => Number.isFinite(x) && x !== 0)];
const games = Number(arg('games', '100'));
const preview = Number(arg('preview', String(curve.route?.preview ?? 0)));
const budget = curve.route?.ruler?.budget ?? 60;
const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);
const pad = (n: number) => String(n).padStart(4, '0');

console.log(`预告 ${preview} 缸，每个玩家 ${games} 局（想清楚的 ${Math.ceil(games / 2)} 局）；目标是尺子（想几步）的`);
console.log('  关  暂存槽   随手点  想几步  想清楚   目标');
for (const id of ids) {
  const lv = LevelData.fromDict(JSON.parse(readFileSync(join(CLIENT, `assets/resources/config/levels/level_${pad(id)}.json`), 'utf8')));
  const target = LevelCurve.routeTarget(curve, id);
  for (const d of deltas) {
    const cap = Math.max(1, Math.min(7, lv.buffer + d));
    const o = { preview, bufferCap: cap };
    const casual = Players.rate(lv, 'casual', games, o).win;
    const think = Players.rate(lv, 'think', games, { ...o, budget }).win;
    const careful = Players.rate(lv, 'think', Math.ceil(games / 2), o).win;
    const note = d === 0 ? '      ' : `（${d > 0 ? '+' : ''}${d}）`;
    console.log(`${String(id).padStart(4)}  ${cap} 格${note} ${pct(casual)}   ${pct(think)}   ${pct(careful)}  ${d === 0 && target !== null ? pct(target) : ''}`);
  }
}
