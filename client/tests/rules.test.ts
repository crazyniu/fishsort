// 局内规则，见 docs/01-玩法设计.md 第 2–4 节。对应 Godot 版 tests/test_rules.gd、test_drop.gd 和洋流部分。
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { construct } from '../assets/scripts/core/gen/constructor';
import { generate } from '../assets/scripts/core/gen/levelGen';
import { Bowl, GameState, LoseReason, RETURN_BUBBLE, Status } from '../assets/scripts/core/model/gameState';
import { Rng } from '../assets/scripts/core/rng/rng';
import * as Rules from '../assets/scripts/core/rules/rules';
import * as LevelCheck from '../assets/scripts/core/solver/levelCheck';
import { level, play } from './helpers';

const bowl = (s: GameState, i: number) => s.slots[i] as Bowl;
const types = (ev: Rules.GameEvent[]) => ev.map((e) => e.t);

function counts(s: GameState): Map<number, number> {
  const c = new Map<number, number>();
  for (const b of s.bubbles) for (const f of b.fish) if (f >= 0) c.set(f, (c.get(f) ?? 0) + 1);
  return c;
}

describe('基础规则', () => {
  it('目标鱼进缸，其它进暂存槽', () => {
    const s = play(level([0, 1, 2], [{ fish: [0, 2, 0, 0, 1] }, { fish: [1, 1, 2, 2] }]));
    Rules.tap(s, 0, 0);
    assert.equal(bowl(s, 0).count, 1);
    Rules.tap(s, 0, 1);
    assert.deepEqual(s.buffer, [2]);
  });

  it('满缸送走、新缸补位、暂存槽自动入缸', () => {
    const s = play(level([0, 1, 2], [{ fish: [2, 2, 0, 0, 0] }, { fish: [1, 1, 1, 2] }]));
    Rules.tap(s, 0, 0);
    Rules.tap(s, 0, 1);
    for (const k of [2, 3, 4]) Rules.tap(s, 0, k);
    assert.equal(s.bowlsDone, 1, '满 3 条送走');
    assert.equal(s.buffer.length, 0, '新缸出现后暂存槽的鱼自动入缸');
    assert.equal(bowl(s, 0).species, 2, '空位补上队列里的下一个缸');
    assert.equal(bowl(s, 0).count, 2, '两条暂存鱼都进了新缸');
  });

  it('救完即胜利', () => {
    const s = play(level([0], [{ fish: [0, 0, 0] }]));
    for (let k = 0; k < 3; k++) Rules.tap(s, 0, k);
    assert.equal(s.status, Status.WON);
  });

  it('上层破裂后下层开放', () => {
    const s = play(level([0, 1], [{ fish: [1, 1, 1] }, { fish: [0, 0, 0], under: [0], layer: 1 }]));
    assert.ok(!Rules.isOpen(s, 0), '被压住的气泡不能点');
    assert.equal(Rules.tap(s, 0, 0).length, 0, '点被压住的鱼无效');
    for (let k = 0; k < 3; k++) Rules.tap(s, 1, k);
    assert.ok(Rules.isOpen(s, 0));
  });

  it('暂存槽满即失败，复活把暂存鱼吹回回流位', () => {
    const s = play(level([0, 1, 2], [{ fish: [2, 2, 2] }, { fish: [0, 0, 0, 1] }, { fish: [1, 1] }], 3));
    for (let k = 0; k < 3; k++) Rules.tap(s, 0, k);
    assert.equal(s.status, Status.LOST);
    assert.equal(s.loseReason, LoseReason.BUFFER_FULL);
    Rules.revive(s);
    assert.equal(s.status, Status.PLAYING);
    assert.equal(s.returnFish.length, 3);
    assert.equal(Rules.revive(s).length, 0, '每关只能复活一次');
    Rules.tap(s, RETURN_BUBBLE, 0);
    assert.equal(s.buffer.length, 1, '回流位的鱼可以再点');
  });

  it('锁链：完成缸后解锁', () => {
    const s = play(level([0, 1], [{ fish: [0, 0, 0] }, { fish: [1, 1, 1], chain: 1 }]));
    assert.ok(!Rules.isOpen(s, 1));
    for (let k = 0; k < 3; k++) Rules.tap(s, 0, k);
    assert.ok(Rules.isOpen(s, 1));
  });

  it('冰封：邻居破裂后解冻', () => {
    const s = play(level([0, 1], [{ fish: [0, 0, 0] }, { fish: [1, 1, 1], ice: [0] }]));
    assert.ok(!Rules.isOpen(s, 1));
    for (let k = 0; k < 3; k++) Rules.tap(s, 0, k);
    assert.ok(Rules.isOpen(s, 1));
  });

  it('无鱼可点判负，复活解开锁链', () => {
    const s = play(level([0, 1, 1], [{ fish: [0, 0, 1] }, { fish: [0, 1, 1, 1, 1, 1], chain: 3 }]));
    for (let k = 0; k < 3; k++) Rules.tap(s, 0, k);
    assert.equal(s.loseReason, LoseReason.STUCK);
    Rules.revive(s);
    assert.ok(Rules.isOpen(s, 1));
  });

  it('结伴鱼一起走，各自结算去向', () => {
    const s = play(level([0, 1], [{ fish: [0, 1, 0, 0, 1, 1], pairs: [[0, 1]] }]));
    Rules.tap(s, 0, 0);
    assert.equal(s.bubbles[0].count(), 4);
    assert.equal(bowl(s, 1).count, 1);
  });

  it('限时缸超时失败，复活加时', () => {
    const s = play(level([{ s: 0, timer: 10 }], [{ fish: [0, 0, 0] }]));
    Rules.tick(s, 9.0);
    assert.equal(s.status, Status.PLAYING);
    Rules.tick(s, 2.0);
    assert.equal(s.loseReason, LoseReason.TIMEOUT);
    Rules.revive(s);
    assert.equal(bowl(s, 0).timer, Rules.REVIVE_EXTRA_SECONDS);
  });

  it('开第 3 缸位后立即上缸', () => {
    const s = play(level([0, 1, 2], [{ fish: [0, 0, 0, 1, 1] }, { fish: [1, 2, 2, 2] }]));
    assert.equal(s.slots[2], null);
    Rules.unlockBowl(s);
    assert.equal(bowl(s, 2).species, 2);
  });
});

describe('技能', () => {
  it('渔网捞出被压住的鱼并补满，捞空的气泡破裂', () => {
    const s = play(level([0, 1], [{ fish: [0, 0, 0] }, { fish: [1, 1, 1], under: [0], layer: 1 }]));
    Rules.useNet(s, 0);
    assert.equal(s.bowlsDone, 1);
    assert.equal(s.bubbles[0].count(), 0);
  });

  it('吹泡：暂存槽清空，鱼回到回流位', () => {
    const s = play(level([0, 1, 2], [{ fish: [2, 2, 0, 0, 0] }, { fish: [1, 1, 1, 2] }]));
    Rules.tap(s, 0, 0);
    Rules.tap(s, 0, 1);
    Rules.useBlow(s);
    assert.equal(s.buffer.length, 0);
    assert.deepEqual(s.returnFish, [2, 2]);
  });

  it('洗牌：各鱼种数量不变，洗完仍可解', () => {
    const lv = generate({ species: 6, fish: 60, layers: 3, slack: 2 }, 42);
    assert.ok(lv !== null);
    const s = play(lv);
    const rng = new Rng(5);
    for (let i = 0; i < 12; i++) {
      const b = rng.pick(Rules.openBubbles(s));
      const k = s.bubbles[b].fish.findIndex((f) => f >= 0);
      Rules.tap(s, b, k);
    }
    if (s.status !== Status.PLAYING) return;
    const before = counts(s);
    assert.ok(Rules.useShuffle(s, 99).length > 0, '洗牌成功');
    assert.deepEqual(counts(s), before, '各鱼种数量不变');
    assert.ok(construct(s.clone(), new Rng(1), 0).ok, '洗牌后仍可解');
  });

  it('洋流：逐条入缸，新缸出现后继续，不进暂存槽', () => {
    const s = play(level([0, 1, 2], [{ fish: [2, 2, 2] }, { fish: [0, 0, 0] }, { fish: [1, 1, 1] }, { fish: [3, 3, 3] }]));
    const ev = Rules.useCurrent(s);
    assert.equal(ev.filter((e) => e.t === 'fish_to_bowl').length, 9);
    assert.equal(s.bowlsDone, 3);
    assert.equal(s.status, Status.PLAYING, '还剩一个没人要的气泡，不判胜');
    assert.equal(s.bubbles[3].count(), 3, '没人要的鱼原地不动');
    assert.equal(s.buffer.length, 0);
    assert.deepEqual(Rules.useCurrent(s), [], '再用没有可入缸的鱼，返回空');
  });

  it('洋流：全部入缸即过关', () => {
    const s = play(level([0, 1], [{ fish: [0, 1, 0] }, { fish: [1, 0, 1] }]));
    const ev = Rules.useCurrent(s);
    assert.equal(s.status, Status.WON);
    assert.ok(ev.some((e) => e.t === 'win'));
    assert.deepEqual(Rules.apply(s, { a: 'current' }), [], 'apply 入口可用，结束后无事件');
  });
});

describe('掉落关（docs/01 第 2.5 节）', () => {
  const drop = (orders: number[], bubbles: { fish: number[] }[], cap: number) => {
    const lv = level(orders, bubbles);
    lv.fieldCap = cap;
    return play(lv);
  };

  it('开局只有前 cap 个气泡在场', () => {
    const s = drop([0, 1, 2], [{ fish: [0, 0, 0] }, { fish: [1, 1, 1] }, { fish: [2, 2, 2] }], 2);
    assert.deepEqual(Rules.openBubbles(s), [0, 1]);
    assert.ok(!Rules.isOpen(s, 2));
    assert.equal(Rules.tap(s, 2, 0).length, 0);
    assert.equal(s.queuedCount(), 1);
  });

  it('破泡后队头按顺序落下', () => {
    const s = drop([0, 1, 2, 3], [{ fish: [0, 0, 0] }, { fish: [1, 1, 1] }, { fish: [2, 2, 2] }, { fish: [3, 3, 3] }], 2);
    Rules.tap(s, 0, 0);
    Rules.tap(s, 0, 1);
    assert.ok(types(Rules.tap(s, 0, 2)).includes('bubble_drop'));
    assert.deepEqual(Rules.openBubbles(s), [1, 2]);
    assert.ok(!Rules.isOpen(s, 3));
  });

  it('候场的也救完才过关', () => {
    const s = drop([0, 1], [{ fish: [0, 0, 0] }, { fish: [1, 1, 1] }], 1);
    for (let k = 0; k < 3; k++) Rules.tap(s, 0, k);
    assert.equal(s.status, Status.PLAYING);
    for (let k = 0; k < 3; k++) Rules.tap(s, 1, k);
    assert.equal(s.status, Status.WON);
  });

  it('渔网捞到候场气泡，不发破裂事件，捞空的不再落下', () => {
    const s = drop([0, 1], [{ fish: [1, 1, 1] }, { fish: [0, 0, 0] }], 1);
    const ev = Rules.useNet(s, 0);
    assert.equal(s.bowlsDone, 1);
    assert.ok(!types(ev).includes('bubble_pop'));
    assert.deepEqual(Rules.openBubbles(s), [0]);
    for (let k = 0; k < 3; k++) Rules.tap(s, 0, k);
    assert.equal(s.status, Status.WON);
  });

  it('生成的掉落关通过校验且可重复', () => {
    const p = { species: 6, fish: 60, layers: 1, slack: 1, cap: 8, per_min: 2, per_max: 4, scramble: 12 };
    const a = generate(p, 4242);
    const b = generate(p, 4242);
    assert.ok(a !== null && b !== null);
    assert.equal(a.fieldCap, 8);
    assert.deepEqual(LevelCheck.errors(a), []);
    assert.equal(a.toJson(), b.toJson());
  });
});
