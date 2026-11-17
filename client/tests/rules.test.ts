// 局内规则，见 docs/01-玩法设计.md 第 2–4 节。
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { construct } from '../assets/scripts/core/gen/constructor';
import { generate } from '../assets/scripts/core/gen/levelGen';
import { Bowl, GameState, LoseReason, RETURN_BUBBLE, Status } from '../assets/scripts/core/model/gameState';
import { LevelData } from '../assets/scripts/core/model/levelData';
import { Rng } from '../assets/scripts/core/rng/rng';
import * as AutoFinish from '../assets/scripts/core/rules/autoFinish';
import * as Rules from '../assets/scripts/core/rules/rules';
import * as Bots from '../assets/scripts/core/solver/bots';
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

  it('洋流：只给用的那一刻架上的缸，换上来的新缸不管，不进暂存槽', () => {
    // 架上两个缸（0、1），后面还有缸 2；场上三种鱼都点得到
    const s = play(level([0, 1, 2], [{ fish: [2, 2, 2] }, { fish: [0, 0, 0] }, { fish: [1, 1, 1] }, { fish: [3, 3, 3] }]));
    const ev = Rules.useCurrent(s);
    assert.equal(ev.filter((e) => e.t === 'fish_to_bowl').length, 6, '只装满架上的两个缸');
    assert.equal(s.bowlsDone, 2);
    assert.equal(s.bubbles[0].count(), 3, '新上来的缸 2 要的鱼留在原地');
    assert.equal(s.buffer.length, 0);
    assert.equal(s.status, Status.PLAYING);
    const again = Rules.useCurrent(s);
    assert.equal(again.filter((e) => e.t === 'fish_to_bowl').length, 3, '再用一次才轮到新缸');
  });

  it('洋流：鱼多的掉落关用一次不会直接通关', () => {
    const lv = generate({ species: 6, fish: 60, layers: 1, cap: 12, slack: 1 }, 3);
    assert.ok(lv !== null);
    const s = play(lv);
    const left = s.fishLeft();
    Rules.useCurrent(s);
    assert.equal(s.status, Status.PLAYING);
    assert.ok(left - s.fishLeft() <= 6, `一次最多装满架上的两缸，实际救了 ${left - s.fishLeft()} 条`);
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

describe('迷雾、冰封、结伴鱼（docs/01 第 4 节，2026-11-16 复查后的规则）', () => {
  const popAll = (s: GameState, b: number) => {
    let ev: Rules.GameEvent[] = [];
    for (let k = 0; k < s.bubbles[b].fish.length; k++) ev = ev.concat(Rules.tap(s, b, k));
    return ev;
  };

  it('迷雾：每破一个别的气泡计数减 1，到 0 显形；没显形也能点', () => {
    const s = play(level([0, 1, 2], [{ fish: [0, 0, 0] }, { fish: [1, 1, 1] }, { fish: [2, 2, 2], fog: 2 }]));
    assert.ok(Rules.isOpen(s, 2), '没显形也能点');
    const first = popAll(s, 0);
    assert.deepEqual(first.filter((e) => e.t === 'fog_tick'), [{ t: 'fog_tick', b: 2, left: 1 }]);
    assert.equal(s.bubbles[2].fog, 1);
    const second = popAll(s, 1);
    assert.ok(types(second).includes('fog_clear'));
    assert.equal(s.bubbles[2].fog, 0);
  });

  it('迷雾：落到场上之后才开始数，把它带下来的那一次不算；自己破掉不算', () => {
    const lv = level([0, 1, 2], [{ fish: [0, 0, 0] }, { fish: [1, 1, 1] }, { fish: [2, 2, 2], fog: 1 }]);
    lv.fieldCap = 2;
    const s = play(lv);
    const ev = popAll(s, 0);
    assert.ok(types(ev).includes('bubble_drop'));
    assert.equal(s.bubbles[2].fog, 1, '刚落下，还没数');
    popAll(s, 1);
    assert.equal(s.bubbles[2].fog, 0);
  });

  it('冰封：依赖两个气泡，任何一个破了就解冻', () => {
    const s = play(level([0, 1, 2], [{ fish: [0, 0, 0] }, { fish: [1, 1, 1] }, { fish: [2, 2, 2], ice: [0, 1] }]));
    assert.ok(!Rules.isOpen(s, 2));
    const ev = popAll(s, 1);
    assert.ok(types(ev).includes('ice_melt'));
    assert.ok(Rules.isOpen(s, 2));
  });

  it('冰封：落下之前依赖泡已经破了，落下来就不冻；校验器不放行这样的关卡', () => {
    const lv = level([0, 1, 2], [{ fish: [0, 0, 0] }, { fish: [1, 1, 1] }, { fish: [2, 2, 2], ice: [0] }]);
    lv.fieldCap = 2;
    lv.palette = 3;
    lv.bubbles.forEach((b) => (b.layer = 1));
    lv.ref = [0, 1, 2].flatMap((b) => [0, 1, 2].map((k) => [b, k] as [number, number]));
    const s = play(lv);
    popAll(s, 0);
    assert.ok(s.bubbles[2].onField && !s.bubbles[2].frozen);
    assert.ok(LevelCheck.errors(lv).some((e) => e.includes('等于没冻')), LevelCheck.errors(lv).join('；'));
  });

  it('结伴鱼：两条各按普通的鱼结算，暂存槽放不下才失败', () => {
    const mk = (buffer: number) => play(level([0, 1], [{ fish: [2, 3, 0, 1], pairs: [[0, 1]] }], buffer));
    const roomy = mk(3);
    Rules.tap(roomy, 0, 0);
    assert.equal(roomy.status, Status.PLAYING);
    assert.deepEqual(roomy.buffer, [2, 3]);
    const tight = mk(2);
    Rules.tap(tight, 0, 0);
    assert.equal(tight.loseReason, LoseReason.BUFFER_FULL);
  });

  it('洗牌不拆结伴鱼：两条还在同一个气泡里系着（docs/01 5.2）', () => {
    const s = play(level([0, 1, 2], [{ fish: [0, 1, 2], pairs: [[0, 1]] }, { fish: [0, 1, 2] }, { fish: [0, 1, 2] }]));
    const before = counts(s);
    assert.ok(Rules.useShuffle(s, 7).length > 0, '洗牌成功');
    assert.deepEqual(s.bubbles[0].pairs, [[0, 1]]);
    assert.deepEqual(counts(s), before);
    for (const b of s.bubbles) assert.ok(b.fish.every((f) => f >= 0));
    assert.ok(construct(s.clone(), new Rng(1), 0).ok, '洗牌后仍可解');
  });
});

describe('机器人按真人的限制玩（docs/02 第 2.1 节）', () => {
  it('计时：每点一次 1.5 秒，限时缸会超时', () => {
    const mk = (timer: number) => level([{ s: 0, timer }], [{ fish: [0, 0, 0] }]);
    assert.ok(!Bots.play(mk(3), 'greedy', new Rng(1), 2), '3 秒不够点 3 次');
    assert.ok(Bots.play(mk(10), 'greedy', new Rng(1), 2));
    assert.ok(Bots.play(mk(3), 'greedy', new Rng(1), 2, { tapSec: 0.5, bowlSec: 0 }), '点得快就来得及');
  });

  it('先顾限时缸：两个缸要的鱼都能点时，点限时缸要的', () => {
    const s = play(level([0, { s: 1, timer: 60 }], [{ fish: [0, 0, 0] }, { fish: [1, 1, 1] }]));
    for (let seed = 0; seed < 20; seed++) assert.equal((Bots.nextTap(s, new Rng(seed)) as [number, number])[0], 1);
  });

  it('看不见迷雾：有别的鱼可点时不点没显形的迷雾泡', () => {
    const s = play(level([0, 1], [{ fish: [0, 0, 0], fog: 3 }, { fish: [2, 2, 2] }]));
    for (let seed = 0; seed < 20; seed++) assert.equal((Bots.nextTap(s, new Rng(seed)) as [number, number])[0], 1);
    s.bubbles[0].fog = 0;
    assert.equal((Bots.nextTap(s, new Rng(1)) as [number, number])[0], 0, '显形后照常挑目标鱼');
  });

  it('只剩迷雾泡时盲点', () => {
    const s = play(level([0], [{ fish: [0, 0, 0], fog: 3 }]));
    assert.equal((Bots.nextTap(s, new Rng(1)) as [number, number])[0], 0);
  });
});

describe('收尾自动入缸（docs/01 第 2 节）', () => {
  it('后面还有缸没上架时不自动', () => {
    const s = play(level([0, 1, 2], [{ fish: [0, 0, 0] }, { fish: [1, 1, 1] }, { fish: [2, 2, 2] }]));
    assert.equal(AutoFinish.plan(s, 99), null);
  });

  it('剩下的鱼正好装满架上的缸、都看得见：给出点的顺序，照着点就赢，一条都不进暂存槽', () => {
    const s = play(level([0, 1, 2], [{ fish: [0, 0, 0] }, { fish: [1, 2, 1] }, { fish: [2, 1, 2] }]));
    for (let k = 0; k < 3; k++) Rules.tap(s, 0, k);
    const taps = AutoFinish.plan(s, 99);
    assert.ok(taps, '最后两个缸的鱼都在场上');
    for (const t of taps) {
      const ev = Rules.tap(s, t.b, t.k);
      assert.ok(!types(ev).includes('fish_to_buffer'));
    }
    assert.equal(s.status, Status.WON);
  });

  it('被压住、有锁链的也照样自动：照规则点下去自然解开', () => {
    const covered = play(level([0, 1], [{ fish: [1, 1, 1] }, { fish: [0, 0, 0], under: [0], layer: 1 }]));
    const a = AutoFinish.plan(covered, 99);
    assert.ok(a);
    for (const t of a) Rules.tap(covered, t.b, t.k);
    assert.equal(covered.status, Status.WON);
    const chained = play(level([0, 1], [{ fish: [0, 0, 0] }, { fish: [1, 1, 1], chain: 1 }]));
    const c = AutoFinish.plan(chained, 99);
    assert.ok(c);
    for (const t of c) Rules.tap(chained, t.b, t.k);
    assert.equal(chained.status, Status.WON);
  });

  it('两个缸都在架上、鱼都能直接进缸就自动；第三个缸还没上架就不自动', () => {
    const s = play(level([0, 1], [{ fish: [1, 0] }, { fish: [0, 0, 1, 1] }]));
    assert.ok(AutoFinish.plan(s, 99));
    const t = play(level([0, 1, 2], [{ fish: [2, 0, 0, 0] }, { fish: [1, 1, 1, 2, 2] }]));
    assert.equal(AutoFinish.plan(t, 99), null, '第三个缸还没上架');
  });

  it('还没进缸的鱼多于 maxLeft 条不自动；点到只剩 3 条才自动', () => {
    const s = play(level([0, 1], [{ fish: [0, 0, 0] }, { fish: [1, 1, 1] }]));
    assert.equal(AutoFinish.plan(s, 3), null, '还剩 6 条');
    for (let k = 0; k < 3; k++) Rules.tap(s, 0, k);
    assert.equal(AutoFinish.left(s), 3);
    const taps = AutoFinish.plan(s, 3);
    assert.ok(taps);
    for (const t of taps) Rules.tap(s, t.b, t.k);
    assert.equal(s.status, Status.WON);
  });
});

describe('用道具救场（docs/01 5.2）', () => {
  it('没有能进缸的鱼算卡住；有一条能进就不算；没显形的迷雾鱼不算', () => {
    const s = play(level([0, 1, 2], [{ fish: [2, 2, 2] }, { fish: [0, 0, 0] }, { fish: [1, 1, 1] }]));
    assert.equal(Rules.noTarget(s), false, '开局有缸要的鱼');
    const t = play(level([0, 1, 2], [{ fish: [2, 2, 2] }, { fish: [0, 0, 0], fog: 3 }, { fish: [1, 1, 1], fog: 3 }]));
    assert.equal(Rules.noTarget(t), true, '要的鱼都在没显形的迷雾泡里');
  });

  it('暂存槽满了判输：用吹泡接着玩，暂存槽清空、鱼去回流位，不占复活', () => {
    const s = play(level([0, 1, 2, 3], [{ fish: [2, 2, 2] }, { fish: [3, 3, 3] }, { fish: [0, 0, 0] }, { fish: [1, 1, 1] }]));
    s.bufferCap = 3;
    for (let k = 0; k < 3; k++) Rules.tap(s, 0, k);
    assert.equal(s.status, Status.LOST);
    assert.equal(s.loseReason, LoseReason.BUFFER_FULL);
    const ev = Rules.rescueBlow(s);
    assert.ok(ev.length > 0);
    assert.equal(s.status, Status.PLAYING);
    assert.equal(s.buffer.length, 0);
    assert.equal(s.returnFish.length, 3);
    assert.equal(s.revived, false);
    assert.equal(Rules.rescueBlow(s).length, 0, '没输的时候不起作用');
  });
});

describe('限时关（docs/01 第 4 节）', () => {
  it('整关倒计时：走完算输（时间到了）；复活再给 30 秒', () => {
    const s = play(level([0, 1], [{ fish: [0, 0, 0] }, { fish: [1, 1, 1] }]));
    s.clock = 10;
    Rules.tick(s, 4);
    assert.equal(s.status, Status.PLAYING);
    assert.equal(s.clock, 6);
    const ev = Rules.tick(s, 7);
    assert.equal(s.status, Status.LOST);
    assert.equal(s.loseReason, LoseReason.CLOCK);
    assert.ok(types(ev).includes('lose'));
    Rules.revive(s);
    assert.equal(s.status, Status.PLAYING);
    assert.equal(s.clock, Rules.REVIVE_CLOCK_SECONDS);
  });

  it('不限时的关 clock 不动', () => {
    const s = play(level([0], [{ fish: [0, 0, 0] }]));
    Rules.tick(s, 999);
    assert.equal(s.status, Status.PLAYING);
  });
});

describe('排队泡', () => {
  // 一个排队泡 [0, 1, 0]（排头是下标 2），一个普通泡 [1, 1]；订单要 1、1、1 再要 0、0（暂存槽 5 格）
  const queueLevel = (): LevelData => {
    const lv = new LevelData();
    lv.palette = 2;
    lv.orders = [
      { s: 1, cap: 3, timer: 0 },
      { s: 0, cap: 2, timer: 0 },
    ];
    const bubble = (id: number, fish: number[], queue: boolean) => ({ id, x: 0.3 + id * 0.3, y: 0.5, r: 0.1, layer: 1, fish, under: [], chain: 0, fog: 0, ice: [], pairs: [], queue });
    lv.bubbles = [bubble(0, [0, 1, 0], true), bubble(1, [1, 1], false)];
    return lv;
  };

  it('只有排头能点，取走以后轮到下一条', () => {
    const s = GameState.fromLevel(queueLevel());
    Rules.start(s);
    assert.equal(s.bubbles[0].front(), 2);
    assert.equal(Rules.tap(s, 0, 0).length, 0, '排在后面的点不动');
    assert.equal(Rules.tap(s, 0, 1).length, 0);
    assert.ok(Rules.tap(s, 0, 2).length > 0, '排头能点');
    assert.equal(s.bubbles[0].front(), 1);
    assert.ok(Rules.tap(s, 0, 1).length > 0);
    assert.equal(s.bubbles[0].front(), 0);
  });

  it('洋流、收尾和机器人都只碰排头', () => {
    const s = GameState.fromLevel(queueLevel());
    Rules.start(s);
    // 架上的两个缸要 1 和 0：洋流先送排头的 0，再轮到后面的 1、0，连普通泡里的 1 一起清完
    Rules.useCurrent(s);
    assert.equal(s.status, Status.WON);
    const t = GameState.fromLevel(queueLevel());
    Rules.start(t);
    const taps = [];
    for (let i = 0; i < 10 && t.status === Status.PLAYING; i++) {
      const next = Bots.nextTap(t, new Rng(1));
      if (!next) break;
      taps.push(next);
      assert.ok(Rules.tap(t, next[0], next[1]).length > 0, '机器人不点排在后面的鱼');
    }
    assert.equal(t.status, Status.WON);
  });

  it('关卡文件：排队泡才写 queue，读回来不丢', () => {
    const lv = queueLevel();
    const back = LevelData.fromJson(lv.toJson()) as LevelData;
    assert.equal(back.bubbles[0].queue, true);
    assert.equal(back.bubbles[1].queue, false);
    assert.ok(!lv.toJson().includes('"queue":0'));
    assert.equal((JSON.parse(lv.toJson()).bubbles[1] as { queue?: number }).queue, undefined);
  });
});
