// 配置表：assets/resources/config 下的 JSON（数值只在这里，CLAUDE.md 硬性约束 5）。启动时读一次。
import { JsonAsset, resources } from 'cc';
import type { AdsConfig, CurveConfig, EconomyConfig, Species } from '../core/config';
import { LevelData } from '../core/model/levelData';

function loadJson<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    resources.load(path, JsonAsset, (err: Error | null, asset: JsonAsset) => {
      if (err !== null || asset.json === null) reject(err ?? new Error(`配置表是空的: ${path}`));
      else resolve(asset.json as T);
    });
  });
}

const pad = (n: number) => String(n).padStart(4, '0');

export class Config {
  eco!: EconomyConfig;
  ads!: AdsConfig;
  curve!: CurveConfig;
  species: Species[] = [];
  speciesById = new Map<string, Species>();

  async load(): Promise<void> {
    const [eco, ads, curve, species] = await Promise.all([
      loadJson<EconomyConfig>('config/economy'),
      loadJson<AdsConfig>('config/ads'),
      loadJson<CurveConfig>('config/level_curve'),
      loadJson<{ species: Species[] }>('config/species'),
    ]);
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
