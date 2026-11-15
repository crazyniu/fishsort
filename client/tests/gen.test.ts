// 生成器与关卡校验，见 docs/02。对应 Godot 版 tests/test_gen.gd。
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import type { GenParams } from '../assets/scripts/core/gen/levelCurve';
import { generate } from '../assets/scripts/core/gen/levelGen';
import { LevelData } from '../assets/scripts/core/model/levelData';
import * as LevelCheck from '../assets/scripts/core/solver/levelCheck';
import { CONFIG, levelFile } from './helpers';

describe('生成器', () => {
  it('同种子输出一致', () => {
    const p: GenParams = { species: 6, fish: 60, layers: 3, slack: 2, chain: 1, timer: 1, fog: 0.25 };
    assert.equal((generate(p, 123) as LevelData).toJson(), (generate(p, 123) as LevelData).toJson());
  });

  it('生成的关卡通过校验，存取后参考解仍通关', () => {
    const sets: GenParams[] = [
      { species: 3, fish: 9, layers: 1, slack: 0 },
      { species: 6, fish: 60, layers: 3, slack: 2, chain: 2, timer: 1 },
      { species: 8, fish: 90, layers: 4, slack: 2, chain: 1, ice: 2, big: 1, pairs: 2, fog: 0.3 },
    ];
    for (const p of sets) {
      for (let seed = 1; seed <= 5; seed++) {
        const lv = generate(p, seed);
        assert.ok(lv !== null, `能生成 ${JSON.stringify(p)}`);
        assert.deepEqual(LevelCheck.errors(lv), []);
        assert.ok(LevelCheck.replay(LevelData.fromJson(lv.toJson()) as LevelData).won);
      }
    }
  });

  it('鱼数对不上订单的关卡被拒绝', () => {
    const lv = generate({ species: 4, fish: 24, layers: 2, slack: 1 }, 7) as LevelData;
    lv.bubbles[0].fish[0] = (lv.bubbles[0].fish[0] + 1) % 4;
    assert.ok(LevelCheck.errors(lv).length > 0);
  });
});

describe('进包的关卡（CLAUDE.md 硬性约束 7）', () => {
  const names = readdirSync(join(CONFIG, 'levels'))
    .filter((n) => n.endsWith('.json'))
    .map((n) => n.slice(0, -5))
    .sort();

  it('120 关，每关本体加两个易化变体', () => {
    assert.equal(names.length, 360);
    for (let id = 1; id <= 120; id++) {
      const base = `level_${String(id).padStart(4, '0')}`;
      for (const n of [base, `${base}_e1`, `${base}_e2`]) assert.ok(names.includes(n), n);
    }
  });

  it('全部通过结构校验并且参考解能通关', () => {
    for (const n of names) assert.deepEqual(LevelCheck.errors(levelFile(n)), [], n);
  });

  it('读出再写回与原文件逐字节相同', async () => {
    const { readFileSync } = await import('node:fs');
    for (const n of names) {
      const text = readFileSync(join(CONFIG, 'levels', `${n}.json`), 'utf8').trim();
      assert.equal((LevelData.fromJson(text) as LevelData).toJson(), text, n);
    }
  });
});
