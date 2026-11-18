// 好友周榜（定版图 17 左；docs/01 5.9）。先隐藏：没有任何入口，等接平台好友榜时再放进任务中心（用户 2026-11-16）；
// 调试时 ./run.sh page rank 能看。原来页面顶部的每周过关目标已经换成任务中心（pages/tasks.ts）。
// 榜单由平台提供（不支持时是空页）：前三名奖牌，自己那一行浅青高亮、关数绿色。按本周过关数排，周一 0 点重置，名次不发奖。
import { Node } from 'cc';
import * as Daily from '../core/meta/daily';
import * as WeeklyRank from '../core/meta/weeklyRank';
import { App } from '../services/app';
import { today } from '../services/clock';
import { tr } from '../ui/i18n';
import { at, box, capsule, img, lazyImg, slice, text } from '../ui/kit';
import { Scroller } from '../ui/scroll';
import { avatarPath } from './profile';
import { Screen } from '../ui/screen';
import { enterStagger, Page, pageHead } from '../ui/shell';

const ROW_H = 120;
const ROW_GAP = 12;
const FISH = ['c01', 'c20', 'u07', 'c17', 'c02', 'c16', 'c18', 'c21', 'c14'];

export class RankPage extends Page {
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
    const day = today();
    Daily.roll(s, day);
    this.scroller?.stop();
    this.view?.destroy();
    const v = box('view', this.root, Screen.W, Screen.H);
    this.view = v;
    this.scroller = null;
    const top = Screen.headTop;

    pageHead(v, tr('RANK_TITLE'));
    const left = 7 - ((day + 3) % 7);
    const reset = capsule(v, 240, 52, null, tr('RANK_RESET_IN', left), 26);
    at(reset.node, 0, top - 168);

    // 好友周榜
    const cleared = s.week.cleared;
    const y0 = top - 210;
    const y1 = Screen.bottom + 20;
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
  }

  private row(parent: Node, rank: number, name: string, score: number, me: boolean, fish: string): Node {
    const row = slice(parent, me ? 'kit/panel_glass' : 'kit/row_blue', 690, ROW_H, `r${rank}`);
    if (rank <= 3) {
      const m = img(row, `skin/j_medal_${rank}`, 60, 90, 'medal');
      at(m, -280, 2);
    } else {
      const c = slice(row, 'kit/capsule', 70, 54, 'no');
      at(c, -280, 0);
      text(c, String(rank), 34);
    }
    const f = img(row, me ? avatarPath() : `fish/${fish}`, 96, 96, 'fish');
    at(f, -170, 0);
    const n = text(row, name, 38, { align: 'left' });
    at(n.node, -100, 0);
    const pill = slice(row, me ? 'kit/btn_green' : 'kit/capsule', 170, 70, 'score');
    at(pill, 235, 0);
    text(pill, tr('RANK_LEVELS', score), 36);
    return row;
  }
}
