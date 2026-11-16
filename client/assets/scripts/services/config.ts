// 配置表：assets/resources/config 下的 JSON（数值只在这里，CLAUDE.md 硬性约束 5）。启动时读一次。
import { JsonAsset, resources } from 'cc';
import type { AdsConfig, CurveConfig, EconomyConfig, GameUiConfig, Species } from '../core/config';
import { LevelData } from '../core/model/levelData';

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
  }

  /** 关卡总数（第 121 关起在后半段循环，见 Meta.levelFile） */
  get levelCount(): number {
    return this.curve.total;
  }

  /** 读关卡文件；ease > 0 时取易化变体，没有就退回普通版 */
  async loadLevel(fileId: number, ease: number): Promise<LevelData> {
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
