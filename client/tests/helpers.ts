// 测试共用：读配置、读黄金数据、手工搭小关卡、比较工具。
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { AdsConfig, CurveConfig, EconomyConfig, Species } from '../assets/scripts/core/config';
import { GameState } from '../assets/scripts/core/model/gameState';
import { LevelData } from '../assets/scripts/core/model/levelData';
import { start } from '../assets/scripts/core/rules/rules';

export const CLIENT = join(dirname(new URL(import.meta.url).pathname), '..');
export const CONFIG = join(CLIENT, 'assets/resources/config');
export const GOLDEN = join(CLIENT, 'tests/golden');

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export const eco = (): EconomyConfig => readJson<EconomyConfig>(join(CONFIG, 'economy.json'));
export const ads = (): AdsConfig => readJson<AdsConfig>(join(CONFIG, 'ads.json'));
export const curve = (): CurveConfig => readJson<CurveConfig>(join(CONFIG, 'level_curve.json'));
export const species = (): Species[] => readJson<{ species: Species[] }>(join(CONFIG, 'species.json')).species;

export function levelFile(name: string): LevelData {
  return LevelData.fromJson(readFileSync(join(CONFIG, 'levels', `${name}.json`), 'utf8')) as LevelData;
}

/** 黄金数据：Godot 版 ./run.sh golden 的产物，gzip 后进仓库 */
export function golden<T>(name: string): T {
  return JSON.parse(gunzipSync(readFileSync(join(GOLDEN, `${name}.json.gz`))).toString('utf8')) as T;
}

export const hasGolden = (): boolean => existsSync(join(GOLDEN, 'meta.json.gz'));

type OrderIn = number | { s: number; cap?: number; timer?: number };
type BubbleIn = { fish: number[]; under?: number[]; chain?: number; ice?: number[]; pairs?: number[][]; layer?: number };

/** 手工搭一个小关卡（对应 Godot 版 tests/test_case.gd 的 level） */
export function level(orders: OrderIn[], bubbles: BubbleIn[], buffer = 5): LevelData {
  return LevelData.fromDict({
    buffer,
    bowlSlots: 2,
    palette: 12,
    orders: orders.map((o) => (typeof o === 'number' ? { s: o } : o)),
    bubbles: bubbles.map((b, i) => ({ ...b, id: i, layer: b.layer ?? 0 })),
  });
}

export function play(lv: LevelData): GameState {
  const s = GameState.fromLevel(lv);
  start(s);
  return s;
}

/**
 * 比较 Godot 版输出（want）和 TS 版输出（got），返回第一处差异的路径，相同返回 null。
 * - want 里的字段 got 必须有且相等；got 多出来的字段不管（TS 版存档有新字段）。
 * - Godot 用 {} 表示「没有」的地方，TS 用 null。
 * - skip 里的顶层字段不比（文档已改、行为本来就不同的部分）。
 */
export function diff(want: unknown, got: unknown, path = '$', skip: readonly string[] = []): string | null {
  const emptyObj = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0;
  if ((want === null || emptyObj(want)) && (got === null || emptyObj(got))) return null;
  if (typeof want === 'number' && typeof got === 'number') {
    return want === got || (Number.isNaN(want) && Number.isNaN(got)) ? null : `${path}: 期望 ${want}，实际 ${got}`;
  }
  if (Array.isArray(want)) {
    if (!Array.isArray(got)) return `${path}: 期望数组，实际 ${JSON.stringify(got)}`;
    if (want.length !== got.length) return `${path}: 长度 期望 ${want.length}，实际 ${got.length}`;
    for (let i = 0; i < want.length; i++) {
      const d = diff(want[i], got[i], `${path}[${i}]`);
      if (d !== null) return d;
    }
    return null;
  }
  if (typeof want === 'object' && want !== null) {
    if (typeof got !== 'object' || got === null || Array.isArray(got)) return `${path}: 期望对象，实际 ${JSON.stringify(got)}`;
    for (const k of Object.keys(want)) {
      if (path === '$' && skip.includes(k)) continue;
      if (!(k in got)) return `${path}.${k}: 缺字段`;
      const d = diff((want as Record<string, unknown>)[k], (got as Record<string, unknown>)[k], `${path}.${k}`);
      if (d !== null) return d;
    }
    return null;
  }
  return want === got ? null : `${path}: 期望 ${JSON.stringify(want)}，实际 ${JSON.stringify(got)}`;
}
