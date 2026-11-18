// 每日挑战（定版图 09；docs/01 5.11；docs/ux/daily.md）。主页子页面，左上返回。
// 大宝箱 → 连续过关 N/7 天（7 格，最后一格是大宝箱）→ 今日宝箱里有什么 → 一行小字 → 主按钮。
// 按钮三态：开始挑战（今日免费）/ 再试一次（看广告 或 金币，两个按钮）/ 今日已完成（灰）。
// 局内过关回到本页：宝箱晃动弹开，先翻收藏卡，再开奖。
import { Node, Sprite, Vec3, tween } from 'cc';
import * as DailyChallenge from '../core/meta/dailyChallenge';
import type { Prize } from '../core/meta/save';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import { today } from '../services/clock';
import * as Flow from '../game/flow';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { COLOR, at, box, button, fmt, hex, img, lazyImg, opacity, setImg, slice, text, tint } from '../ui/kit';
import { needCoins, prizeCell, prizeItems, revealCards, rewardPopup, watchAd } from '../ui/popups';
import { Screen } from '../ui/screen';
import { HEAD_BOTTOM, PAGE_BOTTOM, Page, pageHead, ui } from '../ui/shell';

interface WonArg {
  won?: { prizes: Prize[]; big: boolean };
}

export class DailyPage extends Page {
  /** 大宝箱多大（按屏幕高算，开箱动画换图时沿用） */
  private chestS = 380;
  private root!: Node;
  private view: Node | null = null;
  private chest!: Node;

  build(root: Node): void {
    this.root = root;
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(root, 'bg/sea_coral', (bgH * 1024) / 1536, bgH);
  }

  override show(arg?: unknown): void {
    this.render(true);
    const won = wonOf(arg);
    if (won && won.prizes.length) this.celebrate(won);
  }

  override refresh(): void {
    this.render(false);
  }

  override back(): boolean {
    ui.go('home');
    return false;
  }

  private render(enter: boolean): void {
    const s = App.save.data;
    const eco = App.config.eco;
    const cfg = eco.dailyChallenge;
    const day = today();
    const won = DailyChallenge.wonToday(s, day);
    const free = DailyChallenge.canStartFree(s, day);
    this.view?.destroy();
    const v = box('view', this.root, Screen.W, Screen.H);
    this.view = v;
    const top = Screen.headTop;
    pageHead(v, tr('DAILY_TITLE'), { onBack: () => this.back() });

    // 自下而上：按钮 → 一行小字 → 一块白色面板（上半连续过关的进度，下半今日宝箱的奖品）→ 剩下的地方放大宝箱
    // （用户 2026-11-17：原来进度条和宝箱各自浮在背景上，和任务中心不是一个样子）
    const btnY = Screen.bottom + PAGE_BOTTOM + 40 + 64;
    // 这一版没有广告时，再试一次只能用金币
    const hasAds = App.platform.hasCapability('ads');
    const hint = text(v, won ? tr('DAILY_TOMORROW') : free ? tr('DAILY_FREE') : tr(hasAds ? 'DAILY_RETRY_HINT' : 'DAILY_RETRY_HINT_COINS'), 30);
    at(hint.node, 0, btnY + 64 + 40);
    const PANEL_H = 400;
    const panelY = btnY + 64 + 40 + 44 + PANEL_H / 2;
    const panel = slice(v, 'kit/panel_glass', 690, PANEL_H, 'panel');
    at(panel, 0, panelY);

    // 连续过关 N/7：标题 + 一排 7 个泡（最后一个是七日大宝箱）
    const streak = DailyChallenge.streak(s, day);
    at(text(panel, tr('DAILY_STREAK', streak, cfg.streakDays), 34).node, 0, 156);
    const n = cfg.streakDays;
    const gap = 90;
    const line = slice(panel, 'kit/bar_track', gap * (n - 1), 14, 'line');
    at(line, 0, 72);
    const cells: Node[] = [];
    for (let i = 0; i < n; i++) {
      const c = img(panel, 'kit/bubble', 84, 84, `d${i}`);
      at(c, (i - (n - 1) / 2) * gap, 72);
      const last = i === n - 1;
      const ic = img(c, last ? 'icon/chest_daily' : 'icon/star', last ? 62 : 50, last ? 62 : 50, 'ic');
      if (i >= streak && !last) {
        const sp = ic.getComponent(Sprite) as Sprite;
        sp.grayscale = true;
        sp.color = hex('#9CC8F0');
      }
      cells.push(c);
    }
    const div = tint(panel, 620, 3, hex('#DCE8F8'), 'divider');
    at(div, 0, -10);

    // 今日宝箱：标题 + 一排奖品
    at(text(panel, tr('DAILY_CHEST'), 32).node, 0, -50);
    const items = prizeItems([
      { kind: 'coin', amount: cfg.reward.coins ?? 0 },
      // 配了「每种技能各几个」才列技能（2026-11-18 起每日宝箱不送技能，docs/01 5.11）
      ...((cfg.reward.tools ?? 0) > 0 ? eco.skills.order.map((id): Prize => ({ kind: 'skill', skill: id, amount: cfg.reward.tools ?? 0 })) : []),
    ]);
    items.push({ icon: 'icon/card_back', amount: '×1' });
    items.forEach((it, i) => {
      const c = prizeCell(panel, it, 84);
      at(c, (i - (items.length - 1) / 2) * 104, -128);
    });

    // 大宝箱：页头和面板之间的空里居中
    const hiY = top - HEAD_BOTTOM;
    const loY = panelY + PANEL_H / 2;
    const cs = Math.min(380, hiY - loY - 30);
    this.chestS = cs;
    const chestY = (hiY + loY) / 2;
    const rays = fx.rays(v, cs * 1.5);
    at(rays, 0, chestY);
    rays.setSiblingIndex(0);
    opacity(rays).opacity = won ? 255 : 120;
    this.chest = img(v, won ? 'icon/chest_daily_open' : 'icon/chest_daily', cs, cs, 'chest');
    at(this.chest, 0, chestY);
    if (!won) fx.bob(this.chest, 10, 2.4);

    if (won) {
      const b = button(v, { color: 'gray', w: 520, h: 128, label: tr('DAILY_DONE'), fontSize: 52 });
      b.setEnabled(false);
      at(b.node, 0, btnY);
    } else if (free) {
      const b = button(v, { color: 'green', w: 540, h: 128, label: tr('DAILY_START'), fontSize: 56, onTap: () => Flow.startDaily() });
      at(b.node, 0, btnY);
      fx.breathe(b.node, 0.03, 1.3);
    } else {
      if (hasAds) {
        const ad = button(v, {
          color: 'yellow',
          w: 320,
          h: 120,
          icon: 'kit/ic_video',
          label: tr('DAILY_RETRY'),
          fontSize: 40,
          onTap: async () => {
            if (!(await watchAd('rv_daily_retry'))) return;
            if (!DailyChallenge.enter(App.save.data, eco, today(), 'ad')) return;
            App.save.write();
            Flow.startDaily();
          },
        });
        at(ad.node, -170, btnY);
        ad.setEnabled(App.platform.adsAvailable());
      }
      const coins = button(v, {
        color: 'green',
        w: hasAds ? 300 : 420,
        h: 120,
        icon: 'icon/coin',
        label: fmt(cfg.retryCoins),
        fontSize: 44,
        onTap: () => {
          const sv = App.save.data;
          if (sv.coins < cfg.retryCoins) {
            needCoins(cfg.retryCoins - sv.coins, () => ui.refresh());
            return;
          }
          if (!DailyChallenge.enter(sv, eco, today(), 'coins')) return;
          App.save.write();
          Flow.startDaily();
        },
      });
      at(coins.node, hasAds ? 170 : 0, btnY);
    }
    if (enter) {
      fx.popIn(this.chest, 0, 0.3);
      cells.forEach((c, i) => fx.popIn(c, 0.1 + i * 0.05, 0.22));
    }
  }

  /** 刚过关回来：宝箱晃动、弹开、冒光，先翻卡再开奖 */
  private celebrate(won: { prizes: Prize[]; big: boolean }): void {
    const c = this.chest;
    setImg(c, 'icon/chest_daily', this.chestS, this.chestS);
    tween(c)
      .delay(0.3)
      .to(0.08, { angle: 8 })
      .to(0.1, { angle: -8 })
      .to(0.1, { angle: 12 })
      .to(0.1, { angle: -12 })
      .to(0.12, { angle: 0, scale: new Vec3(1.15, 1.15, 1) })
      .call(() => {
        setImg(c, 'icon/chest_daily_open', this.chestS, this.chestS);
        c.setScale(1, 1, 1);
        fx.confetti(this.root, c.position.x, c.position.y, 50, 360);
        fx.sparkle(this.root, c.position.x, c.position.y, 18, 260, COLOR.yellow, 46);
        sfx('chest');
        const cards = won.prizes
          .filter((p) => p.kind === 'card' && p.card_id)
          .map((p) => ({ id: p.card_id as string, rarity: p.rarity ?? 'common', is_new: Boolean(p.is_new), coins: p.dupe_coins ?? 0 }));
        revealCards(cards, () => {
          rewardPopup(prizeItems(won.prizes.filter((p) => p.kind !== 'card')), {
            title: tr(won.big ? 'DAILY_BIG_CHEST' : 'DAILY_CHEST'),
            onClose: () => ui.refresh(),
          });
        });
      })
      .start();
  }
}

function wonOf(arg: unknown): WonArg['won'] {
  const a = arg as WonArg;
  return a ? a.won : undefined;
}
