// 排行页签（定版图 17 左；docs/01 5.9）。顶部是每周过关目标（10 / 25 / 50 关三档宝箱，本页领取），
// 下面是好友周榜（平台能力；不支持时不显示）。前三名奖牌，自己那一行浅青高亮、关数绿色。
// 名次不发奖（游戏读不到平台好友榜的名次）。周一 0 点重置。
import { Node, Sprite } from 'cc';
import * as Daily from '../core/meta/daily';
import * as WeeklyGoal from '../core/meta/weeklyGoal';
import * as WeeklyRank from '../core/meta/weeklyRank';
import * as PlayerData from '../core/meta/playerData';
import * as Album from '../core/meta/album';
import { Rng } from '../core/rng/rng';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import { now, today } from '../services/clock';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { COLOR, at, box, capsule, img, lazyImg, onTap, progressBar, redDot, slice, text } from '../ui/kit';
import { prizeItems, rewardPopup } from '../ui/popups';
import { Scroller } from '../ui/scroll';
import { Screen } from '../ui/screen';
import { Page, TABBAR_H, enterStagger, ui } from '../ui/shell';

const ROW_H = 120;
const ROW_GAP = 12;
const FISH = ['c01', 'c20', 'u07', 'c17', 'c02', 'c16', 'c18', 'c21', 'c14'];

export class RankPage extends Page {
  readonly tab = 'rank' as const;
  private root!: Node;
  private view: Node | null = null;
  private scroller: Scroller | null = null;
  private seq = 0;

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
    Daily.roll(s, day);
    this.scroller?.stop();
    this.view?.destroy();
    const v = box('view', this.root, Screen.W, Screen.H);
    this.view = v;
    this.scroller = null;
    const top = Screen.top;

    const title = slice(v, 'kit/title_page', 380, 100, 'title');
    at(title, 0, top - 90);
    at(text(title, tr('RANK_TITLE'), 58).node, 0, 4);
    const left = 7 - ((day + 3) % 7);
    const reset = capsule(v, 240, 52, null, tr('RANK_RESET_IN', left), 26);
    at(reset.node, 0, top - 168);

    // 每周过关目标
    const goal = slice(v, 'kit/panel_glass', 690, 250, 'goal');
    at(goal, 0, top - 330);
    const cleared = WeeklyGoal.cleared(s, day);
    const tiers = WeeklyGoal.tiers(eco);
    const maxClears = tiers.length ? tiers[tiers.length - 1].clears : 1;
    const head = text(goal, tr('RANK_WEEK_CLEARED', cleared), 36, { align: 'left' });
    at(head.node, -316, 88);
    const barW = 540;
    const bar = progressBar(goal, barW, 30, 'yellow');
    at(bar.node, -40, -22);
    bar.set(cleared / maxClears);
    tiers.forEach((t, i) => {
      const x = -40 - barW / 2 + (barW * t.clears) / maxClears;
      const claimed = WeeklyGoal.isClaimed(s, i);
      const can = WeeklyGoal.canClaim(s, eco, i, day);
      const chest = img(goal, claimed ? 'icon/chest_open' : 'icon/chest', 96, 96, `tier${i}`);
      at(chest, Math.min(x, 280), -14);
      if (!claimed && !can) (chest.getComponent(Sprite) as Sprite).grayscale = cleared < t.clears;
      if (can) {
        fx.wiggle(chest, 7, 1.8);
        redDot(chest, 36, 36);
      }
      const l = text(goal, tr('RANK_TIER', t.clears), 26, { color: cleared >= t.clears ? COLOR.yellow : COLOR.white });
      at(l.node, Math.min(x, 280), -86);
      onTap(chest, () => this.tapTier(i));
    });

    // 好友周榜
    const y0 = top - 470;
    const y1 = Screen.bottom + TABBAR_H + 10;
    const parts: Node[] = [goal];
    if (App.platform.hasCapability('friend_rank')) {
      const sc = new Scroller(v, Screen.W, y0 - y1);
      at(sc.node, 0, (y0 + y1) / 2);
      this.scroller = sc;
      const seq = ++this.seq;
      void App.platform.getRankList('week').then((list) => {
        if (seq !== this.seq || !sc.content.isValid) return;
        const rows = WeeklyRank.sorted(
          list.map((r) => ({ name: r.name, score: r.score })),
          { name: tr('RANK_ME'), score: cleared },
        );
        const nodes = rows.map((r, i) => {
          const row = this.row(sc.content, i + 1, r.name ?? '', r.score, Boolean(r.me), FISH[i % FISH.length]);
          at(row, 0, -ROW_GAP / 2 - ROW_H / 2 - i * (ROW_H + ROW_GAP));
          return row;
        });
        sc.setContentHeight(rows.length * (ROW_H + ROW_GAP) + ROW_GAP);
        if (enter) enterStagger(nodes, 0.04);
      });
    }
    if (enter) enterStagger(parts, 0.05);
  }

  private row(parent: Node, rank: number, name: string, score: number, me: boolean, fish: string): Node {
    const row = slice(parent, me ? 'kit/panel_glass' : 'kit/row_blue', 690, ROW_H, `r${rank}`);
    if (rank <= 3) {
      const m = img(row, `kit/medal_${rank}`, 80, 80, 'medal');
      at(m, -280, 0);
    } else {
      const c = slice(row, 'kit/capsule', 70, 54, 'no');
      at(c, -280, 0);
      text(c, String(rank), 34);
    }
    const f = img(row, me ? 'fish/c01' : `fish/${fish}`, 96, 96, 'fish');
    at(f, -170, 0);
    const n = text(row, name, 38, { align: 'left' });
    at(n.node, -100, 0);
    const pill = slice(row, me ? 'kit/btn_green' : 'kit/capsule', 170, 70, 'score');
    at(pill, 235, 0);
    text(pill, tr('RANK_LEVELS', score), 36);
    return row;
  }

  private tapTier(i: number): void {
    const s = App.save.data;
    const eco = App.config.eco;
    const day = today();
    if (WeeklyGoal.canClaim(s, eco, i, day)) {
      const prizes = WeeklyGoal.claim(s, eco, i, day, now(), new Rng(Date.now() >>> 0));
      App.save.write();
      sfx('chest');
      rewardPopup(prizeItems(prizes), { onClose: () => ui.refresh() });
      return;
    }
    // 没到或已领：看看这一档给什么
    const t = WeeklyGoal.tiers(eco)[i];
    const preview = PlayerData.create(eco);
    for (const id of eco.skills.order) preview.tools[id] = 0;
    const items = prizeItems(Album.grant(preview, { ...t.reward, skills: 0 }, 0));
    if (t.reward.skills) items.push({ icon: 'icon/gift', amount: tr('PRIZE_RANDOM_SKILL', t.reward.skills) });
    rewardPopup(items, { title: tr('RANK_TIER_TITLE', t.clears) });
  }
}
