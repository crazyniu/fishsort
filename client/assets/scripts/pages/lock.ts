// 未开放功能的锁页（定版图 10、11）：功能名、大图、「第 N 关解锁」、解锁奖励预览（真实大奖内容，带数量）。
// 所有锁页共用这个版式（docs/09 第 2、4 节）：主页上没开放的入口点进来都是它。
import { Node } from 'cc';
import type { Reward } from '../core/config';
import * as Features from '../core/meta/features';
import * as HomeBase from '../core/meta/homeBase';
import { App } from '../services/app';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { at, box, fmt, iconButton, img, lazyImg, pageTitle, slice, text } from '../ui/kit';
import { PrizeItem, prizeCell } from '../ui/popups';
import { Screen } from '../ui/screen';
import { PAGE_BOTTOM, Page, ui } from '../ui/shell';
import { tierPreview } from './tasks';

const NAME: Record<string, string> = {
  homeBase: 'UI_TAB_BASE',
  album: 'UI_TAB_COLLECTION',
  tasks: 'TASK_TITLE',
  daily: 'H_FEAT_DAILY',
  wheel: 'H_FEAT_WHEEL',
  signin: 'H_FEAT_SIGNIN',
  levelSelect: 'H_FEAT_LEVELS',
};
const ART: Record<string, string> = {
  homeBase: 'icon/tab_base',
  album: 'icon/tab_collect',
  tasks: 'icon/tab_tasks',
  daily: 'icon/chest_daily',
  wheel: 'icon/entry_wheel',
  signin: 'icon/entry_signin',
  levelSelect: 'icon/entry_levels',
};

/** 一份奖励换成预览格：金币、技能（每种 n 个 → ×4n）、无限生命 */
function rewardItems(r: Reward, mult = 1): PrizeItem[] {
  const out: PrizeItem[] = [];
  if (r.coins) out.push({ icon: 'icon/coin', amount: fmt(r.coins * mult) });
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
    case 'tasks': {
      // 本周最后一档宝箱
      const week = eco.tasks?.weekTiers ?? [];
      return week.length ? tierPreview(week[week.length - 1]) : [];
    }
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
      return [{ icon: 'icon/coin', amount: fmt(coins) }, { icon: 'icon/chest_daily', amount: '×2' }];
    }
    default:
      return [];
  }
}

/** 画一张锁页 */
function lockView(parent: Node, feature: string): void {
  const eco = App.config.eco;
  const bgH = Math.max(Screen.H, Screen.W * 1.5);
  lazyImg(parent, 'bg/home', (bgH * 1024) / 1536, bgH);
  const top = Screen.top;
  // 页头和别的子页面一致：标题牌在 top - 80，返回键 96、在左上同一高度
  at(pageTitle(parent, tr(NAME[feature] ?? feature)), 0, top - 80);
  const span = top - 170 - (Screen.bottom + PAGE_BOTTOM);
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

/** 主页入口没开放时进的锁页：左上返回 */
export class LockPage extends Page {
  private root!: Node;
  build(root: Node): void {
    this.root = root;
  }
  override show(arg?: unknown): void {
    this.root.destroyAllChildren();
    const feature = (arg as { feature: string }).feature;
    const holder = box('holder', this.root);
    lockView(holder, feature);
    const back = iconButton(this.root, 'kit/round_blue', 'kit/ic_back', 96, () => ui.back());
    at(back, -Screen.W / 2 + 70, Screen.top - 80);
  }
}
