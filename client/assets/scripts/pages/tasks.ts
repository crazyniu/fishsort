// 任务中心（主页入口进来的子页面；docs/01 5.9；docs/ux/tasks.md）。自上而下：
// 页头 → 一块积分面板（「今日 / 本周」切换，一条进度串着各档宝箱）→ 今天的任务卡片（两列；做完自动记积分，没做完的有「前往」）。
// 用户 2026-11-16：原来上面今日、本周各一块面板，下面是一行行的列表，「像网页」，重排成这样。
// 积分只推进度条，不是货币。每日 0 点换任务，周一 0 点清本周积分，没领的宝箱作废。
import { Node, Sprite } from 'cc';
import type { TaskDef, TaskTier } from '../core/config';
import * as Tasks from '../core/meta/tasks';
import { Rng } from '../core/rng/rng';
import * as Flow from '../game/flow';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import { now, today } from '../services/clock';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { COLOR, INK, at, box, button, fit, fmt, img, lazyImg, onTap, progressBar, redDot, slice, text } from '../ui/kit';
import { PrizeItem, prizeItems, revealCards, rewardPopup } from '../ui/popups';
import { Screen } from '../ui/screen';
import { HEAD_BOTTOM, PAGE_BOTTOM, Page, enterStagger, pageHead, ui } from '../ui/shell';

/** 积分面板的高、宝箱大小 */
const PANEL_W = 690;
const PANEL_H = 250;
const CHEST = 96;
/** 任务卡片：两列，卡片之间的空，最高多高 */
const CARD_GAP = 16;
const CARD_MAX_H = 280;
/** 每项任务的图标、「前往」去哪 */
const TASK_ICON: Record<string, string> = {
  win: 'icon/task_win',
  rescue: 'fish/c01',
  ad: 'icon/task_ad',
  combo: 'icon/task_combo',
  skill: 'icon/skill_shuffle',
  daily: 'icon/entry_daily',
  wheel: 'icon/entry_wheel',
  share: 'icon/task_share',
  bowls: 'skin/j_bowl',
  play: 'icon/entry_levels',
};
const TASK_PAGE: Record<string, string> = { ad: 'shop', daily: 'daily', wheel: 'wheel' };

export class TasksPage extends Page {
  private root!: Node;
  private view: Node | null = null;
  /** 积分面板现在看的是今日还是本周 */
  private scope: Tasks.Scope = 'day';

  build(root: Node): void {
    this.root = root;
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(root, 'bg/home', (bgH * 1024) / 1536, bgH);
  }

  override show(): void {
    this.scope = 'day';
    this.render(true);
  }

  override refresh(): void {
    this.render(false);
  }

  private render(enter: boolean): void {
    const s = App.save.data;
    const eco = App.config.eco;
    const day = today();
    const tasks = Tasks.list(s, eco, day);
    this.view?.destroy();
    const v = box('view', this.root, Screen.W, Screen.H);
    this.view = v;
    pageHead(v, tr('TASK_TITLE'));

    // 积分面板
    const panelTop = Screen.top - HEAD_BOTTOM - 12;
    const panel = this.track(v);
    at(panel, 0, panelTop - PANEL_H / 2);

    // 任务卡片：两列，占满面板下面的地方；没做完的排前面
    const y0 = panelTop - PANEL_H - CARD_GAP;
    const y1 = Screen.bottom + PAGE_BOTTOM;
    const sorted = tasks.slice().sort((a, b) => Number(Tasks.isDone(s, eco, a.id, day)) - Number(Tasks.isDone(s, eco, b.id, day)));
    const rows = Math.max(1, Math.ceil(sorted.length / 2));
    const cw = (PANEL_W - CARD_GAP) / 2;
    const ch = Math.min(CARD_MAX_H, (y0 - y1 - CARD_GAP * (rows - 1)) / rows);
    const cards = sorted.map((t, i) => {
      const c = this.card(v, t, cw, ch);
      at(c, (i % 2 === 0 ? -1 : 1) * (cw + CARD_GAP) / 2, y0 - ch / 2 - Math.floor(i / 2) * (ch + CARD_GAP));
      return c;
    });
    if (enter) {
      fx.popIn(panel, 0, 0.3);
      enterStagger(cards, 0.05);
    }
  }

  /**
   * 积分面板：左上「今日 / 本周」两段切换，右上是积分；下面一条进度条串着这一边的各档宝箱，宝箱下面是这一档的积分。
   * 宝箱等距排开（最后一只在条的末端），进度按「到了第几档、离下一档多远」折算，档与档之间的积分差不一样也不会挤在一起。
   * 可领的晃动带红点，领过的是开着的，没到的灰；另一边有宝箱可领时，那一段上亮红点
   */
  private track(parent: Node): Node {
    const s = App.save.data;
    const eco = App.config.eco;
    const day = today();
    const scope = this.scope;
    const tiers = Tasks.tiers(eco, scope);
    const points = scope === 'day' ? Tasks.dayPoints(s, eco, day) : Tasks.weekPoints(s, eco, day);
    const max = scope === 'day' ? (eco.tasks?.dayMax ?? 0) : tiers.length ? tiers[tiers.length - 1].points : 0;
    const panel = slice(parent, 'kit/panel_glass', PANEL_W, PANEL_H, 'points');
    // 两段切换
    const segW = 130;
    const seg = slice(panel, 'kit/seg_bg', segW * 2, 60, 'seg');
    at(seg, -PANEL_W / 2 + 28 + segW, PANEL_H / 2 - 50);
    const on = slice(seg, 'kit/seg_on', segW, 60, 'on');
    at(on, scope === 'day' ? -segW / 2 : segW / 2, 0);
    (['day', 'week'] as const).forEach((sc, i) => {
      const l = text(seg, tr(sc === 'day' ? 'TASK_TAB_DAY' : 'TASK_TAB_WEEK'), 28);
      at(l.node, (i - 0.5) * segW, 3);
      l.color = sc === scope ? COLOR.white : INK.sub;
      fit(l, segW - 20, 28, 18);
      // 另一边有宝箱可领：亮红点
      if (sc !== scope && Tasks.tiers(eco, sc).some((_t, k) => Tasks.canClaim(s, eco, sc, k, day))) redDot(seg, (i - 0.5) * segW + segW / 2 - 10, 24, 24);
    });
    onTap(seg, () => {
      this.scope = scope === 'day' ? 'week' : 'day';
      sfx('tab');
      this.render(false);
    }, { press: 0, sound: null });
    // 积分；本周的后面跟「N 天后重置」
    const pts = text(panel, `${points}/${max}`, 40, { align: 'right' });
    at(pts.node, PANEL_W / 2 - 30, PANEL_H / 2 - 50);
    if (scope === 'week') {
      const left = 7 - ((day + 3) % 7);
      const reset = text(panel, tr('RANK_RESET_IN', left), 22, { align: 'right', color: INK.sub });
      at(reset.node, PANEL_W / 2 - 30, PANEL_H / 2 - 88);
    }
    const barW = 560;
    const x0 = -barW / 2 - 24;
    const barY = -22;
    const bar = progressBar(panel, barW, 26, 'yellow');
    at(bar.node, x0 + barW / 2, barY);
    // 折算进度：第 i 档在条的 (i + 1) / n 处
    let frac = tiers.length ? 1 : 0;
    for (let i = 0, prev = 0; i < tiers.length; prev = tiers[i].points, i++) {
      if (points < tiers[i].points) {
        frac = (i + (points - prev) / (tiers[i].points - prev)) / tiers.length;
        break;
      }
    }
    bar.set(frac);
    tiers.forEach((t, i) => {
      const x = x0 + (barW * (i + 1)) / tiers.length;
      const claimed = Tasks.isClaimed(s, eco, scope, i, day);
      const can = Tasks.canClaim(s, eco, scope, i, day);
      const c = img(panel, claimed ? 'icon/chest_open' : 'icon/chest', CHEST, CHEST, `tier${i}`);
      at(c, x, barY + 6);
      if (!claimed && !can) (c.getComponent(Sprite) as Sprite).grayscale = true;
      if (can) {
        fx.wiggle(c, 7, 1.8);
        redDot(c, CHEST * 0.36, CHEST * 0.36);
      }
      const n = text(panel, String(t.points), 26, { color: points >= t.points ? COLOR.yellow : COLOR.white });
      at(n.node, x, barY - CHEST / 2 - 18);
      // 点的范围比图大一圈，够 88
      const hit = box('hit', panel, 104, 130);
      at(hit, x, barY - 10);
      onTap(hit, () => this.tapTier(scope, i));
    });
    return panel;
  }

  /**
   * 任务卡片，从上到下：图标（右上角一块琥珀色小标签写积分）→ 任务名 → 进度条（数字写在条上）→「前往」。
   * 做完的换成白色卡片，下面是一个对勾，不再有进度条和按钮
   */
  private card(parent: Node, t: TaskDef, w: number, h: number): Node {
    const s = App.save.data;
    const eco = App.config.eco;
    const day = today();
    const done = Tasks.isDone(s, eco, t.id, day);
    const prog = Tasks.progress(s, eco, t.id, day);
    const card = slice(parent, done ? 'kit/panel_glass' : 'kit/panel_blue', w, h, t.id);
    // 卡片矮的时候（屏幕矮、任务多）图标跟着缩
    const iconS = Math.min(92, h * 0.33);
    const icon = img(card, TASK_ICON[t.id] ?? 'icon/gift', iconS, iconS, 'icon');
    at(icon, 0, h / 2 - 14 - iconS / 2);
    const tag = slice(card, 'kit/tag_amber', 84, 40, 'points');
    at(tag, w / 2 - 54, h / 2 - 32);
    at(text(tag, `+${t.points}`, 24).node, 0, 2);
    const name = text(card, tr(`TASK_NAME_${t.id.toUpperCase()}`, t.goal), 30);
    at(name.node, 0, h / 2 - 14 - iconS - 22);
    fit(name, w - 36, 30, 20);
    if (done) {
      at(img(card, 'kit/ic_check', 64, 64, 'done'), 0, -h / 2 + 58);
      return card;
    }
    const barW = w - 80;
    const bar = progressBar(card, barW, 28, 'green');
    at(bar.node, 0, -h / 2 + 104);
    bar.set(prog / t.goal);
    at(text(bar.node, `${prog}/${t.goal}`, 22).node, 0, 1);
    const go = button(card, { color: 'green', w: barW, h: 64, label: tr('TASK_GO'), fontSize: 30, onTap: () => void this.go(t.id) });
    at(go.node, 0, -h / 2 + 48);
    return card;
  }

  /** 「前往」：去能做这项任务的地方；分享直接在这里做 */
  private async go(id: string): Promise<void> {
    if (id === 'share') {
      if (!(await App.platform.share({ kind: 'task' }))) return;
      Tasks.add(App.save.data, App.config.eco, today(), 'share');
      App.save.write();
      ui.refresh();
      return;
    }
    const page = TASK_PAGE[id];
    if (page) ui.go(page);
    else Flow.startLevel(App.save.data.level);
  }

  private tapTier(scope: Tasks.Scope, i: number): void {
    const s = App.save.data;
    const eco = App.config.eco;
    const day = today();
    const title = tr(scope === 'day' ? 'TASK_CHEST_DAY' : 'TASK_CHEST_WEEK');
    if (Tasks.canClaim(s, eco, scope, i, day)) {
      const prizes = Tasks.claim(s, eco, App.config.species, scope, i, day, now(), new Rng(Date.now() >>> 0));
      App.save.write();
      sfx('chest');
      const cards = prizes
        .filter((p) => p.kind === 'card' && p.card_id)
        .map((p) => ({ id: p.card_id as string, rarity: p.rarity ?? 'common', is_new: Boolean(p.is_new), coins: p.dupe_coins ?? 0 }));
      const rest = prizeItems(prizes.filter((p) => p.kind !== 'card'));
      revealCards(cards, () => {
        if (rest.length) rewardPopup(rest, { title, onClose: () => ui.refresh() });
        else ui.refresh();
      });
      return;
    }
    // 没到或已领：看看这一档给什么
    rewardPopup(tierPreview(Tasks.tiers(eco, scope)[i]), { title });
  }
}

/** 一档宝箱里有什么（预览用，不发奖）：金币、技能、无限生命、收藏卡 */
export function tierPreview(t: TaskTier): PrizeItem[] {
  const eco = App.config.eco;
  const out: PrizeItem[] = [];
  const r = t.reward ?? {};
  if (r.coins) out.push({ icon: 'icon/coin', amount: fmt(r.coins) });
  if (r.tools) for (const id of eco.skills.order) out.push({ icon: `icon/skill_${id}`, amount: `×${r.tools}` });
  if (r.skills) out.push({ icon: 'icon/gift', amount: tr('PRIZE_RANDOM_SKILL', r.skills) });
  if (r.unlimited) out.push({ icon: 'icon/heart_inf', amount: tr('UI_MINUTES', Math.round(r.unlimited / 60)) });
  if (t.card) {
    const min = t.card.minRarity;
    out.push({ icon: 'icon/card_back', amount: min ? tr('TASK_CARD_MIN', tr(`UI_RARITY_${min.toUpperCase()}`)) : '×1' });
  }
  return out;
}
