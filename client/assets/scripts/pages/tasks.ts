// 任务中心页签（docs/01 5.9；docs/ux/tasks.md）。自上而下：
// 今日积分条（四档宝箱）→ 本周积分条（三档宝箱）→ 今天的任务列表（做完自动记积分，没做完的有「前往」）。
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
import { COLOR, at, box, button, fit, fmt, img, lazyImg, onTap, pageTitle, progressBar, redDot, slice, text } from '../ui/kit';
import { PrizeItem, prizeItems, revealCards, rewardPopup } from '../ui/popups';
import { Scroller } from '../ui/scroll';
import { Screen } from '../ui/screen';
import { Page, TABBAR_H, enterStagger, ui } from '../ui/shell';

const ROW_H = 116;
const ROW_GAP = 12;
/** 积分面板的高、两块之间的空、宝箱大小 */
const PANEL_H = 196;
const PANEL_GAP = 12;
const CHEST = 84;
/** 每项任务的图标、名字的文案键、「前往」去哪 */
const TASK_ICON: Record<string, string> = {
  win: 'icon/tab_home',
  rescue: 'fish/c01',
  ad: 'kit/ic_video',
  combo: 'icon/star',
  skill: 'icon/skill_shuffle',
  daily: 'icon/entry_daily',
  wheel: 'icon/entry_wheel',
  build: 'icon/tab_base',
  share: 'kit/ic_share',
};
const TASK_PAGE: Record<string, string> = { ad: 'shop', daily: 'daily', wheel: 'wheel', build: 'base' };

export class TasksPage extends Page {
  readonly tab = 'tasks' as const;
  private root!: Node;
  private view: Node | null = null;
  private scroller: Scroller | null = null;

  build(root: Node): void {
    this.root = root;
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(root, 'bg/home', (bgH * 1024) / 1536, bgH);
  }

  override show(): void {
    this.render(true);
  }

  override hide(): void {
    this.scroller?.stop();
  }

  override refresh(): void {
    this.render(false);
  }

  private render(enter: boolean): void {
    const s = App.save.data;
    const eco = App.config.eco;
    const day = today();
    const tasks = Tasks.list(s, eco, day);
    const keep = this.scroller?.offsetNow ?? 0;
    this.scroller?.stop();
    this.view?.destroy();
    const v = box('view', this.root, Screen.W, Screen.H);
    this.view = v;
    const top = Screen.top;

    at(pageTitle(v, tr('TASK_TITLE')), 0, top - 90);

    // 今日积分、本周积分：两块一样高的面板
    const dayPts = Tasks.dayPoints(s, eco, day);
    const dayPanel = this.track(v, 'day', tr('TASK_DAY_POINTS', dayPts, eco.tasks?.dayMax ?? 0), dayPts);
    at(dayPanel, 0, top - 150 - PANEL_H / 2);
    const weekPts = Tasks.weekPoints(s, eco, day);
    const weekTiers = Tasks.tiers(eco, 'week');
    const weekTop = weekTiers.length ? weekTiers[weekTiers.length - 1].points : 0;
    const weekPanel = this.track(v, 'week', tr('TASK_WEEK_POINTS', weekPts, weekTop), weekPts);
    at(weekPanel, 0, top - 150 - PANEL_H - PANEL_GAP - PANEL_H / 2);
    const left = 7 - ((day + 3) % 7);
    const reset = text(weekPanel, tr('RANK_RESET_IN', left), 24, { align: 'right', color: COLOR.yellow });
    at(reset.node, 312, PANEL_H / 2 - 40);

    // 任务列表
    const y0 = top - 150 - PANEL_H * 2 - PANEL_GAP * 2;
    const y1 = Screen.bottom + TABBAR_H + 10;
    const sc = new Scroller(v, Screen.W, y0 - y1);
    at(sc.node, 0, (y0 + y1) / 2);
    this.scroller = sc;
    // 没做完的排前面
    const sorted = tasks.slice().sort((a, b) => Number(Tasks.isDone(s, eco, a.id, day)) - Number(Tasks.isDone(s, eco, b.id, day)));
    const rows = sorted.map((t, i) => {
      const row = this.row(sc.content, t);
      at(row, 0, -ROW_GAP / 2 - ROW_H / 2 - i * (ROW_H + ROW_GAP));
      return row;
    });
    sc.setContentHeight(rows.length * (ROW_H + ROW_GAP) + ROW_GAP);
    if (enter) {
      enterStagger([dayPanel, weekPanel], 0.05);
      enterStagger(rows, 0.04);
    } else {
      sc.scrollTo(keep);
    }
  }

  /**
   * 一条积分进度：上面一行标题，下面一条进度条串着各档宝箱，宝箱下面是这一档的积分。
   * 宝箱等距排开（最后一只在条的末端），进度按「到了第几档、离下一档多远」折算，档与档之间的积分差不一样也不会挤在一起。
   * 可领的晃动带红点，领过的是开着的，没到的灰
   */
  private track(parent: Node, scope: Tasks.Scope, head: string, points: number): Node {
    const s = App.save.data;
    const eco = App.config.eco;
    const day = today();
    const tiers = Tasks.tiers(eco, scope);
    const panel = slice(parent, 'kit/panel_glass', 690, PANEL_H, scope);
    const l = text(panel, head, 32, { align: 'left' });
    at(l.node, -312, PANEL_H / 2 - 40);
    const barW = 560;
    const x0 = -barW / 2 - 20;
    const barY = -8;
    const bar = progressBar(panel, barW, 24, 'yellow');
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
      at(c, x, barY + 4);
      if (!claimed && !can) (c.getComponent(Sprite) as Sprite).grayscale = true;
      if (can) {
        fx.wiggle(c, 7, 1.8);
        redDot(c, CHEST * 0.36, CHEST * 0.36);
      }
      const n = text(panel, String(t.points), 26, { color: points >= t.points ? COLOR.yellow : COLOR.white });
      at(n.node, x, barY - CHEST / 2 - 16);
      // 点的范围比图大一圈，够 88
      const hit = box('hit', panel, 100, 120);
      at(hit, x, barY - 10);
      onTap(hit, () => this.tapTier(scope, i));
    });
    return panel;
  }

  /**
   * 任务行，从左到右：图标 | 任务名 + 进度条（进度数字写在条上）| 积分 | 「前往」或对勾。
   * 各块之间留 16 以上，按钮离行的右边 24；任务名太长就缩小字号，不伸到积分那一栏
   */
  private row(parent: Node, t: TaskDef): Node {
    const s = App.save.data;
    const eco = App.config.eco;
    const day = today();
    const done = Tasks.isDone(s, eco, t.id, day);
    const prog = Tasks.progress(s, eco, t.id, day);
    const row = slice(parent, done ? 'kit/panel_glass' : 'kit/row_blue', 690, ROW_H, t.id);
    const icon = img(row, TASK_ICON[t.id] ?? 'icon/gift', 76, 76, 'icon');
    at(icon, -287, 0);
    const textW = 290;
    const name = text(row, tr(`TASK_NAME_${t.id.toUpperCase()}`, t.goal), 32, { align: 'left' });
    at(name.node, -232, 24);
    fit(name, textW, 32, 24);
    const bar = progressBar(row, textW, 30, 'green');
    at(bar.node, -232 + textW / 2, -24);
    bar.set(prog / t.goal);
    at(text(bar.node, `${prog}/${t.goal}`, 24).node, 0, 1);
    const pts = text(row, tr('TASK_POINTS', t.points), 30, { color: COLOR.yellow });
    at(pts.node, 122, 0);
    if (done) {
      const ok = img(row, 'kit/ic_check', 60, 60, 'done');
      at(ok, 252, 0);
    } else {
      const go = button(row, { color: 'green', w: 132, h: 76, label: tr('TASK_GO'), fontSize: 32, onTap: () => void this.go(t.id) });
      at(go.node, 252, 0);
    }
    return row;
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
