// 生成器、难度曲线与关卡校验，见 docs/02。
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import * as LevelCurve from '../assets/scripts/core/gen/levelCurve';
import type { GenParams } from '../assets/scripts/core/gen/levelCurve';
import { generate } from '../assets/scripts/core/gen/levelGen';
import { LevelData } from '../assets/scripts/core/model/levelData';
import * as Careful from '../assets/scripts/core/solver/careful';
import * as LevelCheck from '../assets/scripts/core/solver/levelCheck';
import { CONFIG, curve as loadCurve, level, levelFile, play } from './helpers';

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

  it('新机制都在挑战关的下一关首发，解锁关只带它一个；掉落的解锁关不带障碍（docs/01 9.3）', () => {
    assert.deepEqual(c.unlock, { chain: 16, timer: 9999, fog: 31, ice: 11, big: 21, pairs: 26 });
    assert.deepEqual(c.iceAll, [[11, 2], [41, 3]], '冰封泡做成厚冰：第 11 关连 2 个，第 41 关起连 3 个');
    assert.equal(LevelCurve.firstDrop(c), 61);
    for (const m of LevelCurve.MECHANICS) {
      if (c.unlock[m] > c.total) continue; // 取消了的（限时缸）
      assert.ok(LevelCurve.isChallenge(c, c.unlock[m] - 1), `${m} 的解锁关在挑战关后面`);
      assert.deepEqual(LevelCurve.mechanicsFor(c, c.unlock[m]), [m]);
      assert.equal(LevelCurve.unlockedAt(c, c.unlock[m]), m);
    }
    assert.deepEqual(LevelCurve.mechanicsFor(c, 61), []);
    assert.equal(LevelCurve.unlockedAt(c, 61), 'drop');
    assert.equal(LevelCurve.unlockedAt(c, 3), 'layer');
    assert.equal(LevelCurve.params(c, 60, 0).cap, 0, '前 60 关不掉落，所有气泡开局在场');
    assert.ok((LevelCurve.params(c, 61, 0).cap as number) > 0, '第 61 关起掉落');
    assert.equal(LevelCurve.params(c, 15, 0).iceAll ?? 2, 2);
  });

  it('障碍种数按每 5 关「1、2、1、2、3」的节奏，不超过已解锁的种数，没解锁的不出现', () => {
    for (const id of ids) {
      const ms = LevelCurve.mechanicsFor(c, id);
      for (const m of ms) assert.ok(id >= c.unlock[m], `第 ${id} 关出现了没解锁的 ${m}`);
      assert.ok(ms.length <= Math.min(c.rhythm[(id - 1) % c.cycle], c.maxMechanics), `第 ${id} 关 ${ms.join('+')}`);
    }
    assert.deepEqual([96, 97, 98, 99, 100].map((id) => LevelCurve.mechanicsFor(c, id).length), [1, 2, 1, 2, 3]);
  });

  it('新机制解锁后、下一样新东西之前的 4 关里有 3 关带它（含下一个难关），先密后疏', () => {
    for (const m of LevelCurve.MECHANICS) {
      const u = c.unlock[m];
      if (u > c.total) continue; // 取消了的（限时缸，docs/01 9.3）
      const with_ = [1, 2, 3, 4].filter((k) => u + k <= c.total && LevelCurve.mechanicsFor(c, u + k).includes(m));
      assert.deepEqual(with_, [1, 2, 4], `${m}`);
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

describe('排队泡关卡（docs/02 附录 A.4、A.6）', () => {
  const c = loadCurve();

  it('第 6 关起分三档：每 5 关一个难关、每 20 关一个守关，其余普通关', () => {
    assert.equal(LevelCurve.jamKind(c, 5), null);
    assert.equal(LevelCurve.jamKind(c, 6), 'normal');
    assert.equal(LevelCurve.jamKind(c, 15), 'hard');
    assert.equal(LevelCurve.jamKind(c, 20), 'big');
    assert.equal(LevelCurve.jamKind(c, 30), 'hard');
    assert.equal(LevelCurve.jamKind(c, 40), 'big');
    assert.equal(LevelCurve.jamKind(c, 360), 'big');
  });

  it('排队泡第 6 关起有（docs/01 9.3），越往后越多；只打乱后面一段', () => {
    assert.ok(!LevelCurve.params(c, 5, 0).queue);
    assert.ok((LevelCurve.params(c, 6, 0).queue as number) >= 0.3);
    const q = [60, 120, 240, 360].map((id) => LevelCurve.params(c, id, 0).queue as number);
    for (let i = 1; i < q.length; i++) assert.ok(q[i] > q[i - 1], `${q}`);
    for (const id of [26, 140, 360]) {
      const from = LevelCurve.params(c, id, 0).scrambleFrom as number;
      assert.ok(from > 0 && from < 1);
    }
    assert.equal(LevelCurve.knot([[10, 0], [20, 1]], 15), 0.5);
    assert.equal(LevelCurve.knot([[10, 0], [20, 1]], 5), 0);
    assert.equal(LevelCurve.knot([[10, 0], [20, 1]], 25), 1);
  });

  it('目标：花得越多过关概率越高；难关的变体往普通关靠', () => {
    for (const id of [30, 100, 140, 300, 360]) {
      const t = LevelCurve.jamTargets(c, id, 0) as number[];
      for (let k = 1; k < t.length; k++) assert.ok(t[k] > t[k - 1], `第 ${id} 关 ${t}`);
      const normal = LevelCurve.jamTargets(c, id + 1, 0) as number[];
      assert.ok(t[0] < normal[0]);
      assert.deepEqual(LevelCurve.jamTargets(c, id, 2), normal);
      const e1 = LevelCurve.jamTargets(c, id, 1) as number[];
      assert.ok(e1[0] > t[0] && e1[0] < normal[0]);
    }
    assert.equal(LevelCurve.jamTargets(c, 31, 1), null, '普通关的变体只要更容易，不设目标');
    assert.ok((LevelCurve.jamTargets(c, 140, 0) as number[])[0] < (LevelCurve.jamTargets(c, 135, 0) as number[])[0], '大难关比难关难');
  });

  it('打乱只动编号在后面的气泡', () => {
    const p: GenParams = { species: 6, fish: 60, layers: 1, slack: 1, cap: 12, queue: 0.5, scramble: 15, scrambleFrom: 0.5 };
    const plain = generate({ ...p, scramble: 0 }, 11) as LevelData;
    const lv = generate(p, 11, (x) => Careful.play(x, 1, 'careful').taps);
    if (lv === null) return;
    assert.deepEqual(LevelCheck.errors(lv), []);
    const half = Math.floor(lv.bubbles.length * 0.5);
    assert.equal(plain.bubbles.length, lv.bubbles.length);
    for (let b = 0; b < half; b++) assert.deepEqual(lv.bubbles[b].fish, plain.bubbles[b].fish, `气泡 ${b}`);
  });
});

describe('机器人：卡死了才花道具（docs/02 附录 A.3）', () => {
  const lv = level([0, 1], [{ fish: [1, 1, 0, 0, 2] }, { fish: [1, 0, 3] }], 4);

  it('「卡死」= 点得到的鱼都进不了缸、暂存槽只剩最后一格', () => {
    const s = play(lv);
    assert.equal(Careful.stuck(s), false);
    s.buffer = [7, 8, 9];
    s.bufferCap = 4;
    s.bubbles[0].fish = [9, 9];
    s.bubbles[1].fish = [8, 8];
    s.bubbles[0].queue = true;
    s.bubbles[1].queue = true;
    assert.equal(Careful.stuck(s), true);
  });

  it('不带道具的局和带道具但没用上的局一模一样；带了道具的过关概率不会更低', () => {
    const p: GenParams = { species: 6, fish: 60, layers: 1, slack: 1, cap: 12, queue: 1, scramble: 20, scrambleFrom: 0.3 };
    const g = generate(p, 5, (x) => Careful.play(x, 1, 'careful').taps);
    if (g === null) return;
    const caps = { shuffle: 2, bowl: 2, blow: 2, net: 2 };
    for (let seed = 0; seed < 20; seed++) {
      const bare = Careful.play(g, seed, 'normal');
      const with_ = Careful.play(g, seed, 'normal', caps);
      if (with_.items === 0) assert.deepEqual(with_.taps, bare.taps);
      if (bare.won) assert.ok(with_.won && with_.items === 0);
    }
    const none = Careful.itemsNeeded(g, 30, 'normal', Careful.NO_ITEMS);
    const some = Careful.itemsNeeded(g, 30, 'normal', caps);
    assert.ok(Careful.within(some, 8) >= Careful.within(none, 0));
    assert.equal(Careful.within(some, 0), Careful.within(none, 0));
  });
});

describe('进包的关卡（CLAUDE.md 硬性约束 7）', () => {
  const names = readdirSync(join(CONFIG, 'levels'))
    .filter((n) => n.endsWith('.json'))
    .map((n) => n.slice(0, -5))
    .sort();

  it('360 关，每关本体加两个易化变体', () => {
    assert.equal(names.length, 1080);
    for (let id = 1; id <= 360; id++) {
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
