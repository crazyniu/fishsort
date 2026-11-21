// 海图（docs/01 5.7，2026-11-17 关卡加到 240 关、12 个海域时加）：一眼看到所有海域。
// 每个海域一张竖版卡（两列）：这片海域的整张局内背景当画面，上面海域名，下面「第 N–M 关」和进度条（过了几关 / 20）；
// 还没到的海域是灰的、中间一把锁，写「第 N 关解锁」；现在所在的海域贴一面「当前」、轻轻呼吸。点开了的海域进它那一页的选关格子。
import { Color, Mask, Node, Sprite } from 'cc';
import * as Meta from '../core/meta/meta';
import * as Seas from '../core/meta/seas';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { WHITE_INK, at, box, fit, img, lazyImg, onTap, opacity, progressBar, setInk, slice, text, textWidth } from '../ui/kit';
import { Screen } from '../ui/screen';
import { Scroller } from '../ui/scroll';
import { HEAD_BOTTOM, PAGE_BOTTOM, Page, enterStagger, pageHead, ui } from '../ui/shell';

/** 一张海域卡多大（竖版，两列；用户 2026-11-17：横条只截到一截海底，看着空，改竖版卡）、卡之间空多少 */
const CARD_W = 330;
const CARD_H = 470;
const GAP_X = 24;
const GAP_Y = 26;
/** 没到的海域画面压暗一点（再灰掉），还看得出是什么地方 */
const DIM = new Color(185, 192, 210, 255);

export class MapPage extends Page {
  private root!: Node;
  private view: Node | null = null;

  build(root: Node): void {
    this.root = root;
  }

  override show(): void {
    this.render();
  }

  override refresh(): void {
    this.render();
  }

  private render(): void {
    this.view?.destroy();
    const v = box('view', this.root, Screen.W, Screen.H);
    this.view = v;
    const bg = lazyImg(v, 'bg/home', Math.max(Screen.W, Screen.H / 1.5), Math.max(Screen.H, Screen.W * 1.5));
    bg.setSiblingIndex(0);
    pageHead(v, tr('MAP_TITLE'));
    const seas = Seas.list(App.config.eco);
    const level = App.save.data.level;
    const reach = App.reach();
    const total = App.config.levelCount;
    // 第 360 关之后关卡在后半段循环（docs/01 5.7）：「当前」跟着这一关实际用的关卡文件走，卡上写第几轮
    const file = Meta.levelFile(level, total);
    const cur = Seas.forLevel(App.config.eco, Math.min(file, total));
    const round = Meta.loopRound(level, total);
    const y0 = Screen.headTop - HEAD_BOTTOM - 10;
    const y1 = Screen.bottom + PAGE_BOTTOM;
    const sc = new Scroller(v, Screen.W, y0 - y1);
    at(sc.node, 0, (y0 + y1) / 2);
    const rowH = CARD_H + GAP_Y;
    const cards = seas.map((sea, i) => {
      const from = sea.levelFrom;
      const to = (seas[i + 1]?.levelFrom ?? total + 1) - 1;
      // 第 2 轮起，当前海域写这一轮的关号和这一轮的进度（第 365 关用第 185 关的文件：第 361–380 关，过了 4 关）
      const loop = round > 1 && i === cur ? level - (file - from) : 0;
      const c = loop
        ? this.card(sc.content, i, sea.id, loop, loop + (to - from), level, true, true, round)
        : this.card(sc.content, i, sea.id, from, to, level, reach >= from, i === cur);
      at(c, (i % 2 === 0 ? -1 : 1) * (CARD_W + GAP_X) / 2, -CARD_H / 2 - Math.floor(i / 2) * rowH - 10);
      return c;
    });
    sc.setContentHeight(Math.ceil(seas.length / 2) * rowH + 20);
    // 打开时停在现在的海域那一行，上面露出一点前一行
    sc.scrollTo(Math.max(0, Math.floor(cur / 2) * rowH - CARD_H * 0.25));
    enterStagger(cards.slice(Math.max(0, cur - (cur % 2) - 2), cur - (cur % 2) + 4), 0.05);
  }

  /** 一张海域卡（竖版）：整张局内背景当画面，上面海域名牌，下面一条关卡范围 + 进度 */
  private card(parent: Node, i: number, id: string, from: number, to: number, level: number, open: boolean, current: boolean, round = 1): Node {
    const n = slice(parent, 'kit/panel_blue', CARD_W, CARD_H, `sea${i}`);
    // 画面：局内背景是 2:3 的竖图，差不多整张放得下，四边留出卡的边
    const pw = CARD_W - 22;
    const ph = CARD_H - 30;
    const pic = box('pic', n, pw, ph);
    at(pic, 0, 4);
    pic.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const iw = Math.max(pw, ph / 1.5);
    const im = lazyImg(pic, `bg/sea_${id}`, iw, iw * 1.5);
    at(im, 0, 0);
    if (!open) {
      const sp = im.getComponent(Sprite);
      if (sp) {
        sp.grayscale = true;
        sp.color = DIM;
      }
    }
    // 上：海域名
    const name = slice(n, 'kit/title_plate', 270, 62, 'name');
    at(name, 0, ph / 2 - 30);
    fit(text(name, tr(`ALBUM_BOOK_${i + 1}`), 32), 240, 32, 22);
    if (round > 1) {
      // 第几轮：名牌下面一枚小牌
      const rp = slice(n, 'kit/btn_blue', 150, 46, 'round');
      at(rp, 0, ph / 2 - 30 - 58);
      fit(text(rp, tr('MAP_ROUND', round), 24), 130, 24, 18);
    }
    // 下：半透明深色底，第一行关卡范围，第二行进度条或「第 N 关解锁」
    const lowH = 100;
    const low = box('low', n, pw, lowH);
    at(low, 0, 4 - ph / 2 + lowH / 2);
    const shade = img(low, 'kit/white', pw, lowH, 'shade');
    (shade.getComponent(Sprite) as Sprite).color = new Color(10, 30, 70, 160);
    setInk(low, WHITE_INK);
    at(text(low, tr('MAP_RANGE', from, to), 28).node, 0, 24);
    if (open) {
      const all = to - from + 1;
      const done = Math.max(0, Math.min(to, level - 1) - from + 1);
      const bar = progressBar(low, pw - 50, 30, done >= all ? 'green' : 'blue');
      at(bar.node, 0, -22);
      bar.set(done / all);
      at(text(bar.node, `${done}/${all}`, 22).node, 0, 1);
    } else {
      const lk = text(low, tr('H_UNLOCKS_AT', from), 26);
      at(lk.node, 18, -22);
      at(img(low, 'kit/ic_lock', 32, 32, 'lock'), -textWidth(lk) / 2 - 4, -22);
      // 画面中间一把大锁
      at(img(n, 'kit/ic_lock', 84, 84, 'bigLock'), 0, 30);
    }
    if (current) {
      // 现在所在的海域：画面上贴一面「当前」、整张卡轻轻呼吸
      const tag = slice(n, 'kit/btn_yellow', 120, 50, 'current');
      at(tag, 0, 4 - ph / 2 + lowH + 34);
      at(text(tag, tr('LV_CURRENT'), 26).node, 0, 2);
      fx.breathe(n, 0.015, 1.6);
    }
    if (!open) opacity(n).opacity = 230;
    onTap(n, () => {
      if (!open) {
        fx.shake(n, 6);
        sfx('blocked');
        ui.toast(tr('LV_LOCKED'));
        return;
      }
      sfx('tap');
      // 第 2 轮起的当前海域：进当前关那一页（这一轮的关号）；别的海域进第 1 轮那一页重玩
      ui.go('levels', round > 1 ? undefined : { sea: i });
    }, { sound: null });
    return n;
  }
}
