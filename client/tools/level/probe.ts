// 难度探针：改规则、加旋钮之前先用它量，量出来有用再动关卡（docs/02-关卡设计.md 附录 A；2026-11-19 起难度按第 0 节的规定路线量）。
// 用法：./run.sh level-probe <关卡号,关卡号…> [--files] [--rule=free|front|half] [--scramble=0.1] [--slots=2] [--seeds=6] [--games=3]
//   默认按难度曲线里这一关的规模现生成 seeds 个关卡（去掉障碍，只看规则和旋钮本身），--files 改量包里的关卡文件。
// 两个机器人，都只开 slots 个缸、不用道具、不复活：
//   随手玩家：有目标鱼就点，否则点最快用得上的（生成器一直用的贪心机器人）。
//   细心玩家：每一步对每个候选各推演若干局（推演里用随手玩家的打法），挑赢得最多的那一步（都输就挑剩鱼最少的）。
//             它知道后面的订单和候场的气泡，比真人强，量出来的是「再细心也只能到这儿」的上限。
// 规则变体只靠「哪些鱼能点」来模拟，不改 core：
//   free   现在的规则：开放气泡里的鱼随便点
//   front  每个气泡只能点最前面一条（下标最大的那条：生成器的参考解就是按这个顺序取的），后面的看得见、点不到
//   half   编号为偶数的气泡按 front，其余按 free
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CurveConfig } from '../../assets/scripts/core/config';
import * as LevelCurve from '../../assets/scripts/core/gen/levelCurve';
import { generate } from '../../assets/scripts/core/gen/levelGen';
import { GameState, RETURN_BUBBLE, Status } from '../../assets/scripts/core/model/gameState';
import { LevelData } from '../../assets/scripts/core/model/levelData';
import { Rng } from '../../assets/scripts/core/rng/rng';
import { findSlot, openBubbles, start, tap, tick } from '../../assets/scripts/core/rules/rules';

const CLIENT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = join(CLIENT, 'assets/resources/config/levels');
const curve = JSON.parse(readFileSync(join(CLIENT, 'assets/resources/config/level_curve.json'), 'utf8')) as CurveConfig;

type Rule = 'free' | 'front' | 'half';
/** 气泡、下标、鱼种、泡里还剩几条 */
type Opt = [number, number, number, number];
interface Stat {
  taps: number;
  /** 没有目标鱼可点、只能往暂存槽里放的步数 */
  forced: number;
}

const MAX_STEPS = 600;
/** 细心玩家每个候选推演几局 */
const ROLLOUTS = 5;

function options(s: GameState, rule: Rule): Opt[] {
  const out: Opt[] = [];
  for (let k = 0; k < s.returnFish.length; k++) out.push([RETURN_BUBBLE, k, s.returnFish[k], 1]);
  for (const b of openBubbles(s)) {
    const bub = s.bubbles[b];
    const left = bub.count();
    for (let k = bub.fish.length - 1; k >= 0; k--) {
      if (!bub.canTake(k)) continue;
      out.push([b, k, bub.fish[k], left]);
      if (rule === 'front' || (rule === 'half' && b % 2 === 0)) break;
    }
  }
  return out;
}

function greedy(s: GameState, opts: Opt[], rng: Rng): Opt {
  let best: Opt[] = [];
  let bestScore = Infinity;
  for (const o of opts) {
    const sp = o[2];
    let score: number;
    if (findSlot(s, sp) >= 0) score = o[3];
    else {
      let soon = 99;
      for (let j = s.nextOrder; j < s.orders.length; j++) {
        if (s.orders[j].s === sp) {
          soon = j - s.nextOrder;
          break;
        }
      }
      score = 1000 + (s.buffer.includes(sp) ? 0 : 10000) + soon * 10 + o[3];
    }
    if (score < bestScore) {
      bestScore = score;
      best = [o];
    } else if (score === bestScore) best.push(o);
  }
  return rng.pick(best);
}

function step(s: GameState, o: Opt): void {
  tap(s, o[0], o[1]);
  tick(s, 0.01);
}

/** 按随手玩家的打法推演到底，返回还剩多少条鱼没送走（0 = 通关） */
function rollout(s: GameState, rule: Rule, rng: Rng): number {
  let guard = 0;
  while (s.status === Status.PLAYING && guard++ < MAX_STEPS) {
    const opts = options(s, rule);
    if (opts.length === 0) break;
    step(s, greedy(s, opts, rng));
  }
  return s.status === Status.WON ? 0 : s.fishLeft();
}

function play(lv: LevelData, rule: Rule, careful: boolean, seed: number, slots: number, stat: Stat): boolean {
  const s = GameState.fromLevel(lv);
  s.openSlots = slots;
  start(s);
  // 这里不考「看不见」：细心的人会等雾散了再点
  for (const b of s.bubbles) b.fog = 0;
  const rng = new Rng(seed * 7919 + 13);
  let guard = 0;
  while (s.status === Status.PLAYING && guard++ < MAX_STEPS) {
    const opts = options(s, rule);
    if (opts.length === 0) break;
    stat.taps++;
    if (!opts.some((o) => findSlot(s, o[2]) >= 0)) stat.forced++;
    let choice: Opt;
    if (careful) {
      // 同一个气泡里同一种鱼只留一个候选
      const seen = new Set<string>();
      const cands = opts.filter((o) => {
        const key = `${o[0]}_${o[2]}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      // 分数：通关的局数优先，其次是输的那些局里剩的鱼少（难的规则下推演几乎全输，光数通关局数分不出好坏）
      let bestScore = -Infinity;
      let bests: Opt[] = [];
      for (const o of cands) {
        let score = 0;
        for (let r = 0; r < ROLLOUTS; r++) {
          const c = s.clone();
          step(c, o);
          const left = rollout(c, rule, new Rng(seed * 31 + r * 977 + o[0] * 13 + o[1]));
          score += left === 0 ? 1000 : -left;
        }
        if (score > bestScore) {
          bestScore = score;
          bests = [o];
        } else if (score === bestScore) bests.push(o);
      }
      choice = greedy(s, bests, rng);
    } else choice = greedy(s, opts, rng);
    step(s, choice);
  }
  return s.status === Status.WON;
}

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function main(): void {
  const ids = (process.argv[2] ?? '').split(',').map(Number).filter((n) => n > 0);
  if (ids.length === 0) {
    console.log('用法：./run.sh level-probe <关卡号,…> [--files] [--rule=free|front|half] [--scramble=0.1] [--slots=2] [--seeds=6] [--games=3]');
    return;
  }
  const files = process.argv.includes('--files');
  const rule = arg('rule', 'free') as Rule;
  const scramble = Number(arg('scramble', '0.25'));
  const slots = Number(arg('slots', '2'));
  const seeds = Number(arg('seeds', '6'));
  const games = Number(arg('games', '3'));
  console.log(`规则 ${rule}，开 ${slots} 个缸，${files ? '包里的关卡文件' : `现生成 ${seeds} 个关卡、打乱 ${Math.round(scramble * 100)}%、不带障碍`}`);
  for (const id of ids) {
    const levels: LevelData[] = [];
    if (files) levels.push(LevelData.fromJson(readFileSync(join(DIR, `level_${String(id).padStart(4, '0')}.json`), 'utf8')) as LevelData);
    else {
      for (let i = 0; i < seeds; i++) {
        const p = LevelCurve.params(curve, id, 0);
        for (const m of ['chain', 'ice', 'pairs', 'timer', 'fog', 'big'] as const) delete p[m];
        p.scramble = Math.trunc(p.fish * scramble);
        const lv = generate(p, 4242 + id * 131 + i * 10007);
        if (lv !== null) levels.push(lv);
      }
    }
    const casual: Stat = { taps: 0, forced: 0 };
    const keen: Stat = { taps: 0, forced: 0 };
    let cw = 0;
    let cn = 0;
    let kw = 0;
    let kn = 0;
    for (const lv of levels) {
      for (let g = 0; g < games * 10; g++) {
        cn++;
        if (play(lv, rule, false, 1000 + g, slots, casual)) cw++;
      }
      for (let g = 0; g < games; g++) {
        kn++;
        if (play(lv, rule, true, 1000 + g, slots, keen)) kw++;
      }
    }
    const pct = (a: number, b: number) => `${String(b > 0 ? Math.round((a * 100) / b) : 0).padStart(3)}%`;
    console.log(`第 ${String(id).padStart(3)} 关  随手玩家 ${pct(cw, cn)}  细心玩家 ${pct(kw, kn)}  被迫进暂存槽的步数：随手 ${pct(casual.forced, casual.taps)}  细心 ${pct(keen.forced, keen.taps)}`);
  }
}

main();
