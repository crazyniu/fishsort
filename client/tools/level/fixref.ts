// 给关卡文件重写参考解：用精确求解器找占暂存槽最少的那条路线（docs/02 第 0.2 节）。
// 用法：npx tsx tools/level/fixref.ts <关卡文件…>
import { readFileSync, writeFileSync } from 'node:fs';
import { LevelData } from '../../assets/scripts/core/model/levelData';
import { replay } from '../../assets/scripts/core/solver/levelCheck';
import * as Route from '../../assets/scripts/core/solver/route';

for (const f of process.argv.slice(2)) {
  const lv = LevelData.fromJson(readFileSync(f, 'utf8')) as LevelData;
  const m = Route.measure(lv);
  if (!m) {
    console.log(`✗ ${f}：解不开`);
    continue;
  }
  lv.ref = m.route.slice();
  const ok = replay(lv).won;
  writeFileSync(f, lv.toJson() + '\n');
  console.log(`${ok ? '✓' : '✗'} ${f}：容错 ${m.slack}，路线 ${lv.ref.length} 步`);
}
