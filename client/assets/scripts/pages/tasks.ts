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
import { COLOR, at, box, button, capsule, fmt, img, lazyImg, onTap, progressBar, redDot, slice, text } from '../ui/kit';
import { PrizeItem, prizeItems, revealCards, rewardPopup } from '../ui/popups';
import { Scroller } from '../ui/scroll';
import { Screen } from '../ui/screen';
import { Page, TABBAR_H, enterStagger, ui } from '../ui/shell';

const ROW_H = 116;
const ROW_GAP = 10;
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

    const title = slice(v, 'kit/title_page', 380, 100, 'title');
    at(title, 0, top - 90);
    at(text(title, tr('TASK_TITLE'), 58).node, 0, 4);

    // 今日积分
    const dayMax = eco.tasks?.dayMax ?? 1;
    const dayPanel = this.track(v, 'day', 210, tr('TASK_DAY_POINTS', Tasks.dayPoints(s, eco, day), dayMax), Tasks.dayPoints(s, eco, day), dayMax, 92);
    at(dayPanel, 0, top - 265);

    // 本周积分
    const weekMax = Tasks.weekMax(eco);
    const weekPts = Tasks.weekPoints(s, eco, day);
    const weekPanel = this.track(v, 'week', 170, tr('TASK_WEEK_POINTS', weekPts, weekMax), weekPts, weekMax, 76);
    at(weekPanel, 0, top - 465);
    const left = 7 - ((day + 3) % 7);
    const reset = capsule(weekPanel, 210, 44, null, tr('RANK_RESET_IN', left), 24);
    at(reset.node, 222, 52);

    // 任务列表
    const y0 = top - 560;
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

  /** 一条积分进度：标题、进度条、各档宝箱（可领的晃动带红点，领过的是开着的，没到的灰） */
  private track(parent: Node, scope: Tasks.Scope, h: number, head: string, points: number, max: number, chest: number): Node {
    const s = App.save.data;
    const eco = App.config.eco;
    const day = today();
    const panel = slice(parent, 'kit/panel_glass', 690, h, scope);
    const l = text(panel, head, 34, { align: 'left' });
    at(l.node, -316, h / 2 - 44);
    const barW = 610;
    const barY = -h / 2 + chest / 2 + 46;
    const bar = progressBar(panel, barW, 26, 'yellow');
    at(bar.node, 0, barY);
    bar.set(points / max);
    Tasks.tiers(eco, scope).forEach((t, i) => {
      const x = Math.min(-barW / 2 + (barW * t.points) / max, barW / 2 - chest / 2 + 12);
      const claimed = Tasks.isClaimed(s, eco, scope, i, day);
      const can = Tasks.canClaim(s, eco, scope, i, day);
      const c = img(panel, claimed ? 'icon/chest_open' : 'icon/chest', chest, chest, `tier${i}`);
      at(c, x, barY + 6);
      if (!claimed && !can) (c.getComponent(Sprite) as Sprite).grayscale = true;
      if (can) {
        fx.wiggle(c, 7, 1.8);
        redDot(c, chest * 0.36, chest * 0.36);
      }
      const n = text(panel, String(t.points), 24, { color: points >= t.points ? COLOR.yellow : COLOR.white });
      at(n.node, x, barY - chest / 2 - 12);
      onTap(c, () => this.tapTier(scope, i));
    });
    return panel;
  }

  private row(parent: Node, t: TaskDef): Node {
    const s = App.save.data;
    const eco = App.config.eco;
    const day = today();
    const done = Tasks.isDone(s, eco, t.id, day);
    const prog = Tasks.progress(s, eco, t.id, day);
    const row = slice(parent, done ? 'kit/panel_glass' : 'kit/row_blue', 690, ROW_H, t.id);
    const icon = img(row, TASK_ICON[t.id] ?? 'icon/gift', 80, 80, 'icon');
    at(icon, -285, 0);
    const name = text(row, tr(`TASK_NAME_${t.id.toUpperCase()}`, t.goal), 34, { align: 'left' });
    at(name.node, -225, 22);
    const bar = progressBar(row, 250, 22, 'green');
    at(bar.node, -100, -24);
    bar.set(prog / t.goal);
    const num = text(row, `${prog}/${t.goal}`, 26, { align: 'left' });
    at(num.node, 38, -24);
    const pts = capsule(row, 110, 50, null, tr('TASK_POINTS', t.points), 28);
    at(pts.node, 150, 0);
    if (done) {
      const ok = img(row, 'kit/ic_check', 64, 64, 'done');
      at(ok, 275, 0);
    } else {
      const go = button(row, { color: 'green', w: 130, h: 80, label: tr('TASK_GO'), fontSize: 32, onTap: () => void this.go(t.id) });
      at(go.node, 268, 0);
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
