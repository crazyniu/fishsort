// 生成器、难度曲线与关卡校验，见 docs/02。
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import * as LevelCurve from '../assets/scripts/core/gen/levelCurve';
import type { GenParams } from '../assets/scripts/core/gen/levelCurve';
import { generate } from '../assets/scripts/core/gen/levelGen';
import { LevelData } from '../assets/scripts/core/model/levelData';
import * as RouteGen from '../assets/scripts/core/gen/routeGen';
import * as Players from '../assets/scripts/core/solver/players';
import * as Prefill from '../assets/scripts/core/gen/prefill';
import * as NoTriple from '../assets/scripts/core/gen/noTriple';
import { Rng } from '../assets/scripts/core/rng/rng';
import { GameState } from '../assets/scripts/core/model/gameState';
import * as Rules from '../assets/scripts/core/rules/rules';
import * as Careful from '../assets/scripts/core/solver/careful';
import * as Route from '../assets/scripts/core/solver/route';
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

  it('同一个气泡里同种鱼最多两条（包里本体、变体、每日挑战关；用户 2026-11-20）', () => {
    for (const n of names) assert.equal(NoTriple.violations(levelFile(n)), 0, n);
    const daily = join(CONFIG, 'levels_daily');
    for (const n of readdirSync(daily).filter((x) => x.endsWith('.json')))
      assert.equal(NoTriple.violations(LevelData.fromJson(readFileSync(join(daily, n), 'utf8')) as LevelData), 0, n);
  });

  it('读出再写回与原文件逐字节相同', async () => {
    const { readFileSync } = await import('node:fs');
    for (const n of names) {
      const text = readFileSync(join(CONFIG, 'levels', `${n}.json`), 'utf8').trim();
      assert.equal((LevelData.fromJson(text) as LevelData).toJson(), text, n);
    }
  });
});

describe('难度曲线的目标（docs/01 9.2，用户 2026-11-20 定：海域内持平、每个海域一档）', () => {
  it('第 5 关 95%；头几关（6–10）55% / 40%，第一个海域后半 45% / 32% / 25%，第二个海域 38% / 28% / 18%，第四个海域 28% / 18% / 10% 到位；最后一个海域 20% / 12% / 5%，最低 5%', () => {
    const c = loadCurve();
    const t = (id: number) => LevelCurve.routeTarget(c, id) as number;
    assert.equal(LevelCurve.routeTarget(c, 4), null, '新手期前几关不收紧');
    assert.equal(t(5), 0.95);
    assert.deepEqual([t(6), t(9), t(10)], [0.55, 0.55, 0.4], '头几关缓一档');
    assert.deepEqual([t(12), t(15), t(19), t(20)], [0.45, 0.32, 0.45, 0.25], '第一个海域后半');
    assert.deepEqual([t(22), t(25), t(40)], [0.38, 0.28, 0.18], '第二个海域：普通、难关、超难关');
    assert.deepEqual([t(42), t(50), t(60), t(62), t(70), t(80)], [0.32, 0.22, 0.13, 0.28, 0.18, 0.1], '第三、四个海域：难度到位');
    for (let id = 21; id <= 39; id++) if (id % 5 !== 0 && ![21, 26, 31].includes(id)) assert.equal(t(id), 0.38, `第 ${id} 关和同海域的普通关一样`);
    // 教学关：新玩法第一次出现的那一关比同海域同类型的关容易 15 个点
    assert.deepEqual([t(11), t(16), t(21), t(26), t(31), t(45), t(61)], [0.6, 0.6, 0.53, 0.53, 0.53, 0.37, 0.43]);
    assert.ok(LevelCurve.isBoss(c, 60) && !LevelCurve.isBoss(c, 55));
    assert.deepEqual([t(341), t(345), t(360)], [0.2, 0.12, 0.05], '最后一个海域：往后基本持平，缓慢变难');
    for (let sea = 1; sea < 18; sea++) {
      // 用第 2 关、第 10 关比（第 1 关、第 5 关可能是教学关，故意容易）
      assert.ok(t(sea * 20 + 2) <= t(sea * 20 - 1), `第 ${sea + 1} 个海域不比前一个容易`);
      assert.ok(t(sea * 20 + 20) < t(sea * 20 + 10) && t(sea * 20 + 10) < t(sea * 20 + 2), '同一个海域：超难 < 难 < 普通');
    }
    for (let id = 6; id <= 360; id++) assert.ok(t(id) >= 0.05, `第 ${id} 关不低于 5%`);
  });

  it('鱼的数量跟着海域涨：第 2 个海域普通关 66 条，第 18 个海域 126 条，一个海域里一样多；难关多三成、最多多 24 条，超难关再多一种鱼', () => {
    const c = loadCurve();
    const fish = (id: number) => LevelCurve.params(c, id, 0).fish;
    assert.equal(fish(21), 66);
    assert.equal(fish(39), 66, '一个海域里一样多');
    assert.equal(fish(341), 126);
    assert.equal(fish(25), 84, '难关多三成');
    assert.equal(fish(345), 150, '鱼多了以后最多多 24 条');
    let last = 0;
    for (let id = 21; id <= 360; id++) {
      assert.equal(fish(id) % 3, 0, `第 ${id} 关 ${fish(id)} 条不是 3 的倍数`);
      assert.ok(fish(id) <= 150, `第 ${id} 关 ${fish(id)} 条`);
      if (id % 5 !== 0) {
        assert.ok(fish(id) >= last, `第 ${id} 关的鱼不比前面的普通关少`);
        last = fish(id);
      }
    }
    assert.equal(LevelCurve.params(c, 120, 0).species, LevelCurve.params(c, 115, 0).species + 1);
  });
});

describe('精确求解器与规定路线（docs/02 第 0.2 节）', () => {
  it('判断得出「不用道具还能不能过」，量得出容错和关键步', () => {
    // 两个缸位：先要 0、再要 1。泡 0 压着泡 1（只有点空泡 0 才露出泡 1）
    const ok = level([0, 1, 2], [{ fish: [0, 0, 0], layer: 1, under: [1] }, { fish: [1, 1, 1] }, { fish: [2, 2, 2] }]);
    const r = Route.solve(ok);
    assert.equal(r.ok, true);
    assert.equal(LevelCheck.replay(ok, r.taps).won, true, '求出来的走法回放能赢');
    // 暂存槽 1 格：中途放不下任何一条鱼，也能过（每一步都直接进缸）
    assert.equal(Route.solve(ok, 10000, 1).ok, true);
    const m = Route.measure(ok);
    assert.ok(m !== null && m.minBuffer === 1 && m.slack === ok.buffer - 1, JSON.stringify(m));
    // 架上的两个缸要 2 和 1，最上面却是 0：三条 0 只能先进暂存槽。暂存槽 3 格放到第 3 条就满（输），4 格才过得去
    const hard = level([2, 1, 0], [{ fish: [0, 0, 0], layer: 2, under: [1] }, { fish: [1, 1, 1], layer: 1, under: [2] }, { fish: [2, 2, 2] }], 3);
    assert.equal(Route.firstDead(ok, r.taps), -1, '按解法走一直过得去');
    assert.equal(Route.solve(hard).ok, false);
    assert.equal(Route.firstDead(hard, [[0, 2]]), 0, '开局就过不去的关，第一步就算走错');
    assert.equal(Route.solve(hard, 10000, 4).ok, true, '暂存槽多一格就过得去');
    hard.buffer = 6;
    assert.equal(Route.measure(hard)?.minBuffer, 4);
    assert.equal(Route.measure(hard)?.slack, 2);
  });

  it('只看屏幕的两个玩家：想清楚的走法回放能赢，过不去的关两个都输，同一个种子结果一样', () => {
    const ok = level([0, 1, 2], [{ fish: [0, 0, 0], layer: 1, under: [1] }, { fish: [1, 1, 1] }, { fish: [2, 2, 2] }]);
    const t = Players.play(ok, 'think', 1, { preview: 0 });
    assert.equal(t.won, true);
    assert.equal(LevelCheck.replay(ok, t.taps).won, true);
    const hard = level([2, 1, 0], [{ fish: [0, 0, 0], layer: 2, under: [1] }, { fish: [1, 1, 1], layer: 1, under: [2] }, { fish: [2, 2, 2] }], 3);
    assert.equal(Players.play(hard, 'think', 1, { preview: 0 }).won, false);
    assert.equal(Players.play(hard, 'casual', 1, { preview: 0 }).won, false);
    const c = loadCurve();
    const lv = generate({ ...LevelCurve.params(c, 8, 0), scramble: 0, attempts: 8 }, 2020, (x) => Route.solve(x, 100000).taps) as LevelData;
    assert.deepEqual(Players.play(lv, 'casual', 7, { preview: 0 }).taps, Players.play(lv, 'casual', 7, { preview: 0 }).taps);
    assert.deepEqual(Players.play(lv, 'think', 7, { preview: 0 }).taps, Players.play(lv, 'think', 7, { preview: 0 }).taps);
  });

  it('开局占格：拿出后半段才要的鱼放进暂存槽，每种鱼的条数不变；想清楚的玩家照样过得去、提示给的是点得到的鱼', () => {
    const c = loadCurve();
    const lv = generate({ ...LevelCurve.params(c, 8, 0), scramble: 0, attempts: 8 }, 2020, (x) => Route.solve(x, 100000).taps) as LevelData;
    const count = (x: LevelData) => {
      const m = new Map<number, number>();
      for (const b of x.bubbles) for (const f of b.fish) m.set(f, (m.get(f) ?? 0) + 1);
      for (const f of x.prefill) m.set(f, (m.get(f) ?? 0) + 1);
      return m;
    };
    const before = count(lv);
    assert.ok(Prefill.apply(lv, 2, 0.5, new Rng(5)));
    assert.equal(lv.prefill.length, 2);
    assert.deepEqual(count(lv), before);
    const first = new Map<number, number>();
    lv.orders.forEach((o, i) => first.has(o.s) || first.set(o.s, i));
    const t = Players.play(lv, 'think', 1, { preview: 3 });
    assert.ok(t.won, '想清楚的玩家过得去');
    lv.ref = t.taps;
    assert.deepEqual(LevelCheck.errors(lv), []);
    assert.equal(LevelData.fromJson(lv.toJson())?.prefill.length, 2, '写进文件再读回来');
    const s = GameState.fromLevel(lv);
    Rules.start(s);
    assert.equal(s.buffer.length, 2, '开局就在暂存槽里');
    const h = Players.hint(s, 3);
    assert.ok(h !== null && Rules.isOpen(s, h[0]) && s.bubbles[h[0]].canTake(h[1]));
  });

  it('提示不会让玩家当场输：暂存槽只剩最后一格时，只提示能直接进缸的鱼；每条都会塞满就不给（用户 2026-11-20）', () => {
    // 架上两个缸要 0、1；暂存槽 4 格、已经放了 3 条（2、3、4）。场上能点的：一条 5（进暂存槽 = 输）、一条 1（进缸）
    const lv = level([0, 1, 0, 1], [{ fish: [5, 1] }, { fish: [0, 0, 0] }, { fish: [1, 1, 1] }, { fish: [0, 0] }, { fish: [1, 1] }, { fish: [2, 3, 4, 5] }], 4);
    const s = GameState.fromLevel(lv);
    Rules.start(s);
    s.buffer = [2, 3, 4];
    for (let seed = 1; seed <= 5; seed++) {
      const h = Players.hint(s, 0, seed) as [number, number];
      assert.ok(h !== null);
      const c = s.clone();
      Rules.tap(c, h[0], h[1]);
      assert.notEqual(c.status, 2, `种子 ${seed}：提示的这一步不能当场输`);
    }
    // 只剩会塞满暂存槽的鱼：不给提示，告诉界面是「卡住了」
    const lv2 = level([0, 1], [{ fish: [5] }, { fish: [6] }, { fish: [0, 0, 0] }, { fish: [1, 1, 1] }], 4);
    const s2 = GameState.fromLevel(lv2);
    Rules.start(s2);
    s2.bubbles[2].fish = [-1, -1, -1];
    s2.bubbles[3].fish = [-1, -1, -1];
    s2.buffer = [2, 3, 4];
    assert.equal(Players.hint(s2, 0), null);
    assert.ok(Players.hintBlocked(s2));
  });

  it('收紧：随手点的过关率每一档存一份，想清楚的玩家都过得去，鱼的种类数量不变（只试几次，CI 要快）', () => {
    const c = loadCurve();
    const p = { ...LevelCurve.params(c, 8, 0), scramble: 0, attempts: 8 };
    const lv = generate(p, 2020, (x) => Route.solve(x, 100000).taps) as LevelData;
    const before = new Map<number, number>();
    for (const b of lv.bubbles) for (const f of b.fish) before.set(f, (before.get(f) ?? 0) + 1);
    const r = RouteGen.tighten(lv, { target: 0.3, thinkFloor: 0.9, preview: 0, iterations: 12, seed: 3, casualGames: 20, thinkGames: 4 });
    assert.ok(r.last !== null && r.byPct.size > 0);
    for (const [pct, snap] of r.byPct) {
      assert.equal(RouteGen.bucket(snap.m.level), pct);
      assert.ok(snap.m.think >= 0.9);
      const after = new Map<number, number>();
      for (const b of snap.lv.bubbles) for (const f of b.fish) after.set(f, (after.get(f) ?? 0) + 1);
      assert.deepEqual(after, before);
      assert.equal(LevelCheck.replay(snap.lv, snap.m.route).won, true, '想清楚的玩家赢下来的走法回放能赢');
    }
  });

  it('同一个气泡里同种鱼最多两条：犯规的泡换开，每种鱼的数量不变，结伴鱼不动', () => {
    const c = loadCurve();
    for (const id of [8, 30, 85]) {
      const p = { ...LevelCurve.params(c, id, 0), scramble: 0, attempts: 8 };
      const lv = generate(p, 777 + id, (x) => Route.solve(x, 100000).taps) as LevelData;
      // 故意做一个犯规的泡：第一个没有结伴鱼、至少 3 条鱼的泡全换成同一种
      const bi = lv.bubbles.findIndex((b) => b.fish.length >= 3 && b.pairs.length === 0);
      const b = lv.bubbles[bi];
      const sp = b.fish[0];
      for (let k = 1; k < b.fish.length; k++) {
        // 从别的泡里找同种的换过来，保持每种的数量
        for (const o of lv.bubbles) {
          if (o === b || o.pairs.length > 0) continue;
          const j = o.fish.indexOf(sp);
          if (j >= 0 && b.fish[k] !== sp) [o.fish[j], b.fish[k]] = [b.fish[k], o.fish[j]];
        }
      }
      const before = new Map<number, number>();
      for (const x of lv.bubbles) for (const f of x.fish) before.set(f, (before.get(f) ?? 0) + 1);
      const pairsBefore = lv.bubbles.map((x) => x.pairs.map((pr) => pr.map((k) => x.fish[k])));
      assert.ok(NoTriple.violations(lv) > 0, `第 ${id} 关：先做出犯规的泡`);
      assert.equal(NoTriple.fix(lv, new Rng(5)), 0);
      assert.equal(NoTriple.violations(lv), 0);
      const after = new Map<number, number>();
      for (const x of lv.bubbles) for (const f of x.fish) after.set(f, (after.get(f) ?? 0) + 1);
      assert.deepEqual(after, before, '每种鱼的数量不变');
      assert.deepEqual(lv.bubbles.map((x) => x.pairs.map((pr) => pr.map((k) => x.fish[k]))), pairsBefore, '结伴鱼不动');
    }
  });

  it('收紧时不换出三条同种鱼的泡', () => {
    const c = loadCurve();
    const p = { ...LevelCurve.params(c, 8, 0), scramble: 0, attempts: 8 };
    const lv = generate(p, 2020, (x) => Route.solve(x, 100000).taps) as LevelData;
    NoTriple.fix(lv, new Rng(1));
    const r = RouteGen.tighten(lv, { target: 0.3, thinkFloor: 0.9, preview: 0, iterations: 12, seed: 3, casualGames: 20, thinkGames: 4 });
    for (const snap of r.byPct.values()) assert.equal(NoTriple.violations(snap.lv), 0);
  });
});
