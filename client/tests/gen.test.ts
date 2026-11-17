// 生成器、难度曲线与关卡校验，见 docs/02。
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import * as LevelCurve from '../assets/scripts/core/gen/levelCurve';
import type { GenParams } from '../assets/scripts/core/gen/levelCurve';
import { generate } from '../assets/scripts/core/gen/levelGen';
import { LevelData } from '../assets/scripts/core/model/levelData';
import * as LevelCheck from '../assets/scripts/core/solver/levelCheck';
import { CONFIG, curve as loadCurve, levelFile } from './helpers';

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

describe('障碍照着参考解叠加（docs/02 第 3、4 节）', () => {
  const all: GenParams = { species: 7, fish: 78, layers: 1, cap: 12, slack: 2, chain: 2, ice: 3, fog: 0.3, fogCount: [2, 3], big: 1, pairs: 2, timer: 2, scramble: 8 };
  const made = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => generate(all, seed) as LevelData);

  it('带齐六种障碍的掉落关都能生成并通过校验', () => {
    for (const lv of made) {
      assert.ok(lv !== null);
      assert.deepEqual(LevelCheck.errors(lv), []);
    }
    const has = (f: (lv: LevelData) => boolean) => made.filter(f).length;
    assert.ok(has((lv) => lv.bubbles.some((b) => b.ice.length > 0)) >= 6, '大多数关卡加得上冰封');
    assert.ok(has((lv) => lv.bubbles.some((b) => b.chain > 0)) >= 6, '大多数关卡加得上锁链');
    assert.ok(has((lv) => lv.bubbles.some((b) => b.fog > 0)) === made.length);
  });

  it('冰封依赖 1–2 个、排在自己前面；迷雾计数在范围内；限时 45–90 秒、5 秒一档', () => {
    for (const lv of made) {
      for (const b of lv.bubbles) {
        assert.ok(b.ice.length <= 2);
        for (const d of b.ice) assert.ok(d < b.id);
        assert.ok(b.fog >= 0 && b.fog <= 3);
      }
      for (const o of lv.orders) if (o.timer > 0) assert.ok(o.timer >= 45 && o.timer <= 90 && o.timer % 5 === 0, `限时 ${o.timer}`);
    }
  });
});

describe('难度曲线（docs/02 第 2 节，2026-11-16 复查）', () => {
  const c = loadCurve();
  const ids = Array.from({ length: c.total }, (_, i) => i + 1);

  it('新机制都在挑战关的下一关首发，解锁关只带它一个；掉落的解锁关不带障碍', () => {
    assert.deepEqual(c.unlock, { chain: 16, timer: 31, fog: 41, ice: 61, big: 81, pairs: 111 });
    assert.equal(LevelCurve.firstDrop(c), 26);
    for (const m of LevelCurve.MECHANICS) {
      assert.ok(LevelCurve.isChallenge(c, c.unlock[m] - 1), `${m} 的解锁关在挑战关后面`);
      assert.deepEqual(LevelCurve.mechanicsFor(c, c.unlock[m]), [m]);
      assert.equal(LevelCurve.unlockedAt(c, c.unlock[m]), m);
    }
    assert.deepEqual(LevelCurve.mechanicsFor(c, 26), []);
    assert.equal(LevelCurve.unlockedAt(c, 26), 'drop');
    assert.equal(LevelCurve.unlockedAt(c, 3), 'layer');
    assert.equal(LevelCurve.params(c, 25, 0).cap, 0, '第 25 关还是分层关');
    assert.ok((LevelCurve.params(c, 26, 0).cap as number) > 0, '第 26 关起掉落');
  });

  it('障碍种数按每 5 关「1、2、1、2、3」的节奏，不超过已解锁的种数，没解锁的不出现', () => {
    for (const id of ids) {
      const ms = LevelCurve.mechanicsFor(c, id);
      for (const m of ms) assert.ok(id >= c.unlock[m], `第 ${id} 关出现了没解锁的 ${m}`);
      assert.ok(ms.length <= Math.min(c.rhythm[(id - 1) % c.cycle], c.maxMechanics), `第 ${id} 关 ${ms.join('+')}`);
    }
    assert.deepEqual([96, 97, 98, 99, 100].map((id) => LevelCurve.mechanicsFor(c, id).length), [1, 2, 1, 2, 3]);
  });

  it('新机制解锁后 9 关里有 5 关带它（含下一个挑战关），先密后疏', () => {
    for (const m of LevelCurve.MECHANICS) {
      const u = c.unlock[m];
      const with_ = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((k) => u + k <= c.total && LevelCurve.mechanicsFor(c, u + k).includes(m));
      assert.deepEqual(with_, [1, 2, 4, 6, 8], `${m}`);
    }
  });

  it('不会连着 10 关以上都是同一套障碍', () => {
    let run = 1;
    let prev = '';
    // 第 16 关解锁第一种障碍之前都没有障碍，不算
    for (const id of ids.filter((x) => x >= c.unlock.chain)) {
      const combo = LevelCurve.mechanicsFor(c, id).join('+');
      run = combo === prev ? run + 1 : 1;
      prev = combo;
      assert.ok(run <= 10, `到第 ${id} 关已经连着 ${run} 关都是 ${combo || '无障碍'}`);
    }
  });

  it('挑战关降幅从第 5 关的 10 个点线性加到第 50 关的 25 个点', () => {
    assert.equal(LevelCurve.challengeDrop(c, 5), 10);
    assert.equal(LevelCurve.challengeDrop(c, 20), 15);
    assert.equal(LevelCurve.challengeDrop(c, 35), 20);
    assert.equal(LevelCurve.challengeDrop(c, 50), 25);
    assert.equal(LevelCurve.challengeDrop(c, 100), 25);
    assert.equal(Math.round(LevelCurve.targetRate(c, 10, true)), 83);
    // 普通关目标的折点（docs/02 第 2.1 节）：第 60 关 77、第 120 关 42、第 240 关 22；挑战关最低 8
    assert.equal(Math.round(LevelCurve.targetRate(c, 60, false)), 77);
    assert.equal(Math.round(LevelCurve.targetRate(c, 119, false)), 43);
    assert.equal(Math.round(LevelCurve.targetRate(c, 239, false)), 22);
    assert.equal(LevelCurve.targetRate(c, 240, true), 8);
  });

  it('第 3 缸：要明显有用，第 26 关起不保证过关', () => {
    assert.deepEqual(LevelCurve.bowl3Span(c, 10, 70), [80, 100]);
    assert.deepEqual(LevelCurve.bowl3Span(c, 30, 60), [70, 90]);
    assert.deepEqual(LevelCurve.bowl3Span(c, 30, 80), [90, 95]);
    assert.deepEqual(LevelCurve.bowl3Span(c, 30, 87), [87, 95], '加 10 就超过 95 时，只要不低于 2 缸');
    assert.deepEqual(LevelCurve.bowl3Span(c, 30, 92), [92, 95]);
    assert.deepEqual(LevelCurve.bowl3Span(c, 30, 97), [97, 100]);
  });
});

describe('进包的关卡（CLAUDE.md 硬性约束 7）', () => {
  const names = readdirSync(join(CONFIG, 'levels'))
    .filter((n) => n.endsWith('.json'))
    .map((n) => n.slice(0, -5))
    .sort();

  it('240 关，每关本体加两个易化变体', () => {
    assert.equal(names.length, 720);
    for (let id = 1; id <= 240; id++) {
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
