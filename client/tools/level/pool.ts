// 关卡难度库（docs/02 第 0.5 节，2026-11-20）：生成时一路上量过、复量过的每一版都存下来，下次要哪个难度直接拿，不用重新试。
// - 按「配置」分组：鱼数、鱼种、障碍、暂存槽、开局占格、关卡类型、预告几缸、尺子都一样的关共用一组（一个海域里同障碍、同类型的大约 4 关）。
//   配置不一样的布局不能拿来用（第 100 关 99 条鱼的布局给不了第 300 关）。
// - 一条「链」= 从同一个开局布局一路收紧出来的各版（结构一样，只是鱼换了位置）。一关只用一条链：本体、两个变体、调试页各档都从这条链里出，
//   一条链只给一关用（不然两关长得一样）。谁在用记在 claims/<链>（建文件是原子的，几关同时跑也不会抢到同一条）。
// - 库放在主检出的 client/tools/level/pool/（不进包、不进 git，几个工作目录共用；FS_POOL 可以改位置）。删了也没事，只是下次要重新试。
// - 机器人玩家、量法改了，旧库里的数就不准了：POOL_VERSION 加一，旧的那几组自然不再用到。
import { execSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync, writeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export const POOL_VERSION = 1;

/** 复量过的一版（和 route.ts 的 Ver 一样，关卡存成 dict） */
export interface PoolVer {
  /** 尺子（想几步的玩家）复量的过关率 */
  casual: number;
  /** 随手点的玩家（复量） */
  rand: number;
  /** 想清楚的玩家（复量）；用的时候按那时的保底挑 */
  think: number;
  run: number;
  lv: Record<string, unknown>;
}

export interface Chain {
  id: string;
  group: string;
  /** 哪一关生成的、用的种子和放松档（查来历用） */
  from: number;
  seed: number;
  ease: number;
  /** 这条链收不动了（连着两轮没更接近目标）：不再从它接着收，里面已有的版本照样能拿 */
  stuck?: boolean;
  /** 收过几轮（接着收时换一组量的种子） */
  rounds?: number;
  versions: PoolVer[];
}

let rootCache: string | null = null;
/** 库的位置：FS_POOL，或者主检出（git 的公共目录旁边）的 client/tools/level/pool */
export function root(client: string): string {
  if (rootCache) return rootCache;
  let r = process.env.FS_POOL ?? '';
  if (!r) {
    try {
      const common = execSync('git rev-parse --git-common-dir', { cwd: client, encoding: 'utf8' }).trim();
      const main = dirname(isAbsolute(common) ? common : resolve(client, common));
      r = join(main, 'client/tools/level/pool');
    } catch {
      r = join(client, 'tools/level/pool');
    }
  }
  rootCache = r;
  return r;
}

export function groupKey(parts: unknown): string {
  return createHash('sha1')
    .update(JSON.stringify({ v: POOL_VERSION, parts }))
    .digest('hex')
    .slice(0, 12);
}

const groupDir = (client: string, g: string) => join(root(client), g);
const claimDir = (client: string, g: string) => join(groupDir(client, g), 'claims');

export function chains(client: string, g: string): Chain[] {
  const d = groupDir(client, g);
  if (!existsSync(d)) return [];
  const out: Chain[] = [];
  for (const f of readdirSync(d)) {
    if (!f.endsWith('.json')) continue;
    try {
      out.push(JSON.parse(readFileSync(join(d, f), 'utf8')) as Chain);
    } catch {
      // 写到一半的文件（另一关正在存）跳过
    }
  }
  return out;
}

/** 存一条链（先写临时文件再改名，别的进程读不到写了一半的） */
export function save(client: string, c: Chain): void {
  const d = groupDir(client, c.group);
  mkdirSync(d, { recursive: true });
  const tmp = join(d, `.${c.id}.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify(c) + '\n');
  renameSync(tmp, join(d, `${c.id}.json`));
}

/** 这条链现在给哪一关用（没人用 = null） */
export function owner(client: string, g: string, chainId: string): number | null {
  const p = join(claimDir(client, g), chainId);
  if (!existsSync(p)) return null;
  const n = Number(readFileSync(p, 'utf8').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 占下这条链给 level 用；已经是 level 的也算占到；别人的返回 false */
export function claim(client: string, g: string, chainId: string, level: number): boolean {
  const d = claimDir(client, g);
  mkdirSync(d, { recursive: true });
  try {
    const fd = openSync(join(d, chainId), 'wx');
    writeSync(fd, String(level));
    closeSync(fd);
    return true;
  } catch {
    return owner(client, g, chainId) === level;
  }
}

/** level 换用了别的链：它原来占的几条放回去，给同组的别的关用 */
export function releaseOthers(client: string, g: string, level: number, keep: string): void {
  const d = claimDir(client, g);
  if (!existsSync(d)) return;
  for (const f of readdirSync(d)) if (f !== keep && owner(client, g, f) === level) unlinkSync(join(d, f));
}
