// 难度调试的数据（底座，换游戏照用；docs/10 第 9 节）。只在开发版启用（PlatformBase.isDevBuild，正式版自动不出），代码一直留着。
// - 各档关卡：关卡工具按「正常打法能过几成」每 10% 存一档到 resources/config/levels_lab/（index.json + level_XXXX_p{档}.json），
//   调试页挑一档顶替包里那一关（本体和变体都换成它），存在本机，重开游戏还在。关卡按原始字典存，由游戏自己解析（不同游戏的关卡格式不同）
// - 整体档：-1 困难、0 标准、1 简单，存在本机；具体改什么（暂存槽、连击窗口……）由游戏在 onTier 里做
import { JsonAsset, resources } from 'cc';
import type { PlatformBase } from '../platform/platformBase';

/** 一档的量具读数（core/solver/players.ts）：natural 尺子（认真玩、想几步的玩家）能过 %、casual 随手点能过 %、think 想清楚能过 %、run 按路线最长连击 */
export interface LabVersion {
  natural: number;
  casual?: number;
  think: number;
  run: number;
}

/** 一关：base 包里用的是哪一档，target 这一关的目标（%），各档 */
export interface LabLevel {
  base: number;
  target: number;
  versions: Record<string, LabVersion>;
}

type Dict = Record<string, unknown>;

// 第二版（按「正常打法过关率」分档）换过键：第一版按容错挑的档都是要读心才过得去的，不再沿用
const PICKS_KEY = 'lab_levels2';
const TIER_KEY = 'lab_tier';
const DIR = 'config/levels_lab';

const pad = (n: number) => String(n).padStart(4, '0');

function loadJson<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    resources.load(path, JsonAsset, (err: Error | null, asset: JsonAsset) => {
      if (err || !asset || asset.json === null || asset.json === undefined) reject(err ?? new Error(`读不出 ${path}`));
      else resolve(asset.json as T);
    });
  });
}

export class LevelLab {
  /** 开发版、而且 game.json 没关掉才是 true（Boot 里 init） */
  enabled = false;
  index: Record<string, LabLevel> = {};
  /** 关卡号 → 挑的那一档（原始字典）和档名 */
  readonly picks = new Map<number, { lv: Dict; ver: number }>();
  tier = 0;
  /** 整体档变了（开局读出来、调试页切换）时游戏要做的事 */
  onTier: (tier: number) => void = () => undefined;
  private platform: PlatformBase | null = null;

  init(platform: PlatformBase, onTier?: (tier: number) => void): void {
    this.enabled = true;
    this.platform = platform;
    if (onTier) this.onTier = onTier;
    const t = Number(platform.loadData(TIER_KEY) || '0');
    this.setTier(Number.isFinite(t) ? t : 0);
    try {
      const raw = JSON.parse(platform.loadData(PICKS_KEY) || '{}') as Record<string, { lv: Dict; ver: number }>;
      for (const id of Object.keys(raw)) this.picks.set(Number(id), { lv: raw[id].lv, ver: Number(raw[id].ver) });
    } catch {
      this.picks.clear();
    }
    void loadJson<Record<string, LabLevel>>(`${DIR}/index`)
      .then((x) => (this.index = x))
      .catch(() => (this.index = {}));
  }

  /** 有各档的关，从小到大 */
  ids(): number[] {
    return Object.keys(this.index)
      .map(Number)
      .sort((a, b) => a - b);
  }

  /** 这一关挑了哪一档就返回那一档的关卡字典（游戏读关卡时先问它），没挑返回 null */
  override(id: number): Dict | null {
    if (!this.enabled) return null;
    const p = this.picks.get(id);
    return p ? JSON.parse(JSON.stringify(p.lv)) : null;
  }

  async pick(id: number, ver: number): Promise<void> {
    const lv = await loadJson<Dict>(`${DIR}/level_${pad(id)}_p${ver}`);
    this.picks.set(id, { lv, ver });
    this.save();
  }

  unpick(id: number): void {
    this.picks.delete(id);
    this.save();
  }

  setTier(tier: number): void {
    this.tier = Math.max(-1, Math.min(1, Math.round(tier)));
    this.platform?.saveData(TIER_KEY, String(this.tier));
    this.onTier(this.tier);
  }

  private save(): void {
    const out: Record<string, unknown> = {};
    for (const [id, v] of this.picks) out[String(id)] = v;
    this.platform?.saveData(PICKS_KEY, JSON.stringify(out));
  }
}

/** 全局只有一份 */
export const lab = new LevelLab();
