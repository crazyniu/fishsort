// 未开放功能的锁页（定版图 10、11）：功能名、大图、「第 N 关解锁」、解锁奖励预览（真实大奖内容，带数量）。
// 所有锁页共用这个版式（docs/09 第 2、4 节）。页签页没开放时也画它。
import { Node } from 'cc';
import type { Reward } from '../core/config';
import * as Features from '../core/meta/features';
import * as HomeBase from '../core/meta/homeBase';
import * as WeeklyGoal from '../core/meta/weeklyGoal';
import { App } from '../services/app';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { at, box, iconButton, img, lazyImg, slice, text } from '../ui/kit';
import { PrizeItem, prizeCell } from '../ui/popups';
import { Screen } from '../ui/screen';
import { Page, TABBAR_H, ui } from '../ui/shell';

const NAME: Record<string, string> = {
  homeBase: 'UI_TAB_BASE',
  album: 'UI_TAB_COLLECTION',
  rank: 'UI_TAB_RANK',
  daily: 'H_FEAT_DAILY',
  wheel: 'H_FEAT_WHEEL',
  signin: 'H_FEAT_SIGNIN',
  levelSelect: 'H_FEAT_LEVELS',
};
const ART: Record<string, string> = {
  homeBase: 'icon/tab_base',
  album: 'icon/tab_collect',
  rank: 'icon/tab_rank',
  daily: 'icon/chest_daily',
  wheel: 'icon/entry_wheel',
  signin: 'icon/entry_signin',
  levelSelect: 'icon/entry_levels',
};

/** 一份奖励换成预览格：金币、技能（每种 n 个 → ×4n）、无限生命 */
function rewardItems(r: Reward, mult = 1): PrizeItem[] {
  const out: PrizeItem[] = [];
  if (r.coins) out.push({ icon: 'icon/coin', amount: String(r.coins * mult) });
  const skills = (r.tools ?? 0) * 4 * mult + (r.skills ?? 0) * mult;
  if (skills) out.push({ icon: 'icon/skill_net', amount: `×${skills}` });
  if (r.unlimited) out.push({ icon: 'icon/heart_inf', amount: tr('PRIZE_HOURS', Math.round((r.unlimited * mult) / 3600)) });
  return out;
}

function sum(rs: Reward[]): Reward {
  return rs.reduce<Reward>(
    (a, r) => ({
      coins: (a.coins ?? 0) + (r.coins ?? 0),
      tools: (a.tools ?? 0) + (r.tools ?? 0),
      skills: (a.skills ?? 0) + (r.skills ?? 0),
      unlimited: (a.unlimited ?? 0) + (r.unlimited ?? 0),
    }),
    {},
  );
}

export function lockPrizes(feature: string): PrizeItem[] {
  const eco = App.config.eco;
  switch (feature) {
    case 'homeBase':
      return rewardItems(sum(HomeBase.areas(eco).map((a) => a.reward)));
    case 'album':
      return [...rewardItems(eco.album.final), { icon: 'kit/fx_ring', amount: tr('H_PRIZE_FRAME') }];
    case 'rank':
      return rewardItems(sum(WeeklyGoal.tiers(eco).map((t) => t.reward)));
    case 'daily':
      return [...rewardItems(eco.dailyChallenge.reward), { icon: 'icon/card_back', amount: '×1' }];
    case 'wheel':
      return eco.wheel.prizes
        .filter((p) => p.id === 'coin2000' || p.id === 'card_legend' || p.kind === 'unlimited')
        .map((p) =>
          p.kind === 'coins'
            ? { icon: 'icon/coin', amount: String(p.amount) }
            : p.kind === 'unlimited'
              ? { icon: 'icon/heart_inf', amount: tr('UI_MINUTES', Math.round((p.amount ?? 0) / 60)) }
              : { icon: 'icon/card_back', amount: tr('UI_RARITY_LEGEND') },
        );
    case 'signin': {
      const coins = eco.signInDays.reduce((a, d) => a + (d.coins ?? 0) + (d.bigChest?.coins ?? 0), 0);
      return [{ icon: 'icon/coin', amount: String(coins) }, { icon: 'icon/chest_daily', amount: '×2' }];
    }
    default:
      return [];
  }
}

/** 画一张锁页。bottom：底下要留多少（页签页留底栏） */
export function lockView(parent: Node, feature: string, bottom: number): void {
  const eco = App.config.eco;
  const bgH = Math.max(Screen.H, Screen.W * 1.5);
  lazyImg(parent, 'bg/home', (bgH * 1024) / 1536, bgH);
  const top = Screen.top;
  const title = slice(parent, 'kit/title_page', 360, 100, 'title');
  at(title, 0, top - 110);
  text(title, tr(NAME[feature] ?? feature), 56).node.setPosition(0, 4, 0);
  const span = top - 170 - (Screen.bottom + bottom);
  const artY = top - 170 - span * 0.32;
  const rays = fx.rays(parent, 520);
  at(rays, 0, artY);
  const art = img(parent, ART[feature] ?? 'icon/gift', 380, 380, 'art');
  at(art, 0, artY);
  fx.bob(art, 10, 2.4);
  const pill = slice(parent, 'kit/btn_blue', 520, 110, 'unlockAt');
  at(pill, 0, artY - 260);
  const lock = img(pill, 'icon/lock', 90, 90, 'lock');
  at(lock, -180, 6);
  text(pill, tr('H_UNLOCKS_AT', Features.unlockLevel(eco, feature)), 48).node.setPosition(40, 4, 0);
  const items = lockPrizes(feature);
  if (items.length) {
    const panelY = artY - 450;
    const panel = slice(parent, 'kit/panel_glass', 620, 220, 'prizes');
    at(panel, 0, panelY);
    const head = slice(parent, 'kit/title_plate', 320, 70, 'head');
    at(head, 0, panelY + 110);
    text(head, tr('LOCK_PREVIEW'), 32).node.setPosition(0, 4, 0);
    items.forEach((it, i) => {
      const c = prizeCell(panel, it, 120);
      at(c, (i - (items.length - 1) / 2) * 150, -6);
      fx.popIn(c, 0.15 + i * 0.08, 0.25);
    });
  }
}

/** 主页入口（抽奖、每日挑战、签到、选关）没开放时进的锁页：左上返回 */
export class LockPage extends Page {
  readonly tab = null;
  private root!: Node;
  build(root: Node): void {
    this.root = root;
  }
  override show(arg?: unknown): void {
    this.root.destroyAllChildren();
    const feature = (arg as { feature: string }).feature;
    const holder = box('holder', this.root);
    lockView(holder, feature, 0);
    const back = iconButton(this.root, 'kit/round_blue', 'kit/ic_back', 84, () => ui.back());
    at(back, -Screen.W / 2 + 60, Screen.top - 60);
  }
}

/** 还没做完的页面：先放一张锁页一样的占位，免得点进去空白 */
export class TodoPage extends Page {
  constructor(
    readonly tab: 'shop' | 'base' | 'home' | 'collect' | 'rank' | null,
    private readonly feature: string,
  ) {
    super();
  }
  build(root: Node): void {
    lockView(root, this.feature, this.tab ? TABBAR_H : 0);
    if (!this.tab) {
      const back = iconButton(root, 'kit/round_blue', 'kit/ic_back', 84, () => ui.back());
      at(back, -Screen.W / 2 + 60, Screen.top - 60);
    }
  }
}

