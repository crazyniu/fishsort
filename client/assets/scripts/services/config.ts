// 配置表：assets/resources/config 下的 JSON（数值只在这里，CLAUDE.md 硬性约束 5）。启动时读一次。
import { JsonAsset, resources } from 'cc';
import type { AdsConfig, CurveConfig, EconomyConfig, GameUiConfig, Species } from '../core/config';
import { LevelData } from '../core/model/levelData';
import type { PlatformBase } from '../platform/platformBase';
import type { Eye } from '../ui/alive';

/** 难度调试页生成的关卡、整体难度档存在本机的哪个键下 */
const LAB_KEY = 'lab_levels';
const LAB_TIER_KEY = 'lab_tier';
/** 整体难度档（docs/01 9.7）：暂存槽多几格、连击窗口几秒；下标 = 档 + 1（-1 困难、0 标准、1 简单） */
const LAB_TIERS = [
  { buffer: -1, window: 1.5 },
  { buffer: 0, window: 0 },
  { buffer: 1, window: 2.5 },
];

function describe(v: unknown): string {
  if (typeof v !== 'object' || v === null) return String(v);
  const o = v as Record<string, unknown>;
  return `${v.constructor?.name} keys=${Object.keys(o).join(',')} json=${typeof o.json}`;
}

function loadJson<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    resources.load(path, JsonAsset, (err: Error | null, asset: JsonAsset) => {
      // 成功时 Cocos 传的 err 是 undefined 而不是声明里的 null，只能按真假判断
      if (err) reject(err);
      else if (asset === null || asset === undefined || asset.json === null || asset.json === undefined)
        reject(new Error(`配置表读不出来: ${path}（${describe(asset)}）`));
      else resolve(asset.json as T);
    });
  });
}

const pad = (n: number) => String(n).padStart(4, '0');

export class Config {
  eco!: EconomyConfig;
  ads!: AdsConfig;
  curve!: CurveConfig;
  ui!: GameUiConfig;
  species: Species[] = [];
  speciesById = new Map<string, Species>();
  /** 每只生物的眼睛在图上的位置（tools/art/eyes.py 生成，眨眼用）；读不到就不眨眼 */
  eyes: Record<string, Eye[]> = {};

  async load(): Promise<void> {
    const [eco, ads, curve, species, ui] = await Promise.all([
      loadJson<EconomyConfig>('config/economy'),
      loadJson<AdsConfig>('config/ads'),
      loadJson<CurveConfig>('config/level_curve'),
      loadJson<{ species: Species[] }>('config/species'),
      loadJson<GameUiConfig>('config/game_ui'),
    ]);
    this.ui = ui;
    this.eco = eco;
    this.ads = ads;
    this.curve = curve;
    this.species = species.species;
    for (const sp of this.species) this.speciesById.set(sp.id, sp);
    this.eyes = await loadJson<Record<string, Eye[]>>('config/fish_eyes').catch(() => ({}));
  }

  /** 关卡总数（第 121 关起在后半段循环，见 Meta.levelFile） */
  get levelCount(): number {
    return this.curve.total;
  }

  /**
   * 难度调试页生成的关卡（pages/lab.ts）：顶替包里同一关的文件（本体和变体都换成它），存在本机，重开游戏还在。
   * 只有 game.json 开了 levelLab 才会读
   */
  readonly lab = new Map<number, LevelData>();

  /** 整体难度档：-1 困难、0 标准、1 简单（调试页设，存在本机） */
  labTier = 0;
  private comboWindow = 0;

  /** 暂存槽按整体难度档多几格（局内建 GameState 后、摆版面前调） */
  labBuffer(cap: number): number {
    return Math.max(1, Math.min(7, cap + LAB_TIERS[this.labTier + 1].buffer));
  }

  setLabTier(tier: number, platform: PlatformBase): void {
    this.labTier = Math.max(-1, Math.min(1, Math.round(tier)));
    if (this.comboWindow === 0) this.comboWindow = this.eco.combo.windowSeconds;
    const w = LAB_TIERS[this.labTier + 1].window;
    this.eco.combo.windowSeconds = w > 0 ? w : this.comboWindow;
    platform.saveData(LAB_TIER_KEY, String(this.labTier));
  }

  loadLab(platform: PlatformBase): void {
    const t = Number(platform.loadData(LAB_TIER_KEY) || '0');
    this.setLabTier(Number.isFinite(t) ? t : 0, platform);
    try {
      const raw = JSON.parse(platform.loadData(LAB_KEY) || '{}') as Record<string, Record<string, unknown>>;
      for (const id of Object.keys(raw)) this.lab.set(Number(id), LevelData.fromDict(raw[id]));
    } catch {
      this.lab.clear();
    }
  }

  saveLab(platform: PlatformBase): void {
    const out: Record<string, unknown> = {};
    for (const [id, lv] of this.lab) out[String(id)] = lv.toDict();
    platform.saveData(LAB_KEY, JSON.stringify(out));
  }

  /** 读关卡文件；ease > 0 时取易化变体，没有就退回普通版 */
  async loadLevel(fileId: number, ease: number): Promise<LevelData> {
    const custom = this.lab.get(fileId);
    if (custom) return LevelData.fromDict(custom.toDict());
    const base = `config/levels/level_${pad(fileId)}`;
    let raw: Record<string, unknown>;
    try {
      raw = await loadJson<Record<string, unknown>>(ease > 0 ? `${base}_e${ease}` : base);
    } catch {
      raw = await loadJson<Record<string, unknown>>(base);
    }
    return LevelData.fromDict(raw);
  }
}
