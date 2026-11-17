// 海图（docs/01 5.7，2026-11-17 关卡加到 240 关、12 个海域时加）：一眼看到所有海域。
// 每个海域一张卡：这片海域的局内背景当画面，左上海域名，下面「第 N–M 关」和进度条（过了几关 / 20）；
// 还没到的海域是灰的，写「第 N 关解锁」；现在所在的海域亮一圈、插一面「当前」小旗。点开了的海域进它那一页的选关格子。
import { Color, Mask, Node, Sprite } from 'cc';
import * as Seas from '../core/meta/seas';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { WHITE_INK, at, box, fit, img, lazyImg, onTap, opacity, progressBar, setInk, slice, text } from '../ui/kit';
import { Screen } from '../ui/screen';
import { Scroller } from '../ui/scroll';
import { HEAD_BOTTOM, PAGE_BOTTOM, Page, enterStagger, pageHead, ui } from '../ui/shell';

/** 一张海域卡多大、卡之间空多少 */
const CARD_W = 680;
const CARD_H = 230;
const GAP = 22;
/** 一个海域几关（economy.json 的 seas 里相邻两个 levelFrom 的差；最后一个按总关数算） */
const DIM = new Color(150, 160, 185, 255);

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
    const total = App.config.levelCount;
    const cur = Seas.forLevel(App.config.eco, Math.min(level, total));
    const y0 = Screen.top - HEAD_BOTTOM - 10;
    const y1 = Screen.bottom + PAGE_BOTTOM;
    const sc = new Scroller(v, Screen.W, y0 - y1);
    at(sc.node, 0, (y0 + y1) / 2);
    const cards = seas.map((sea, i) => {
      const from = sea.levelFrom;
      const to = (seas[i + 1]?.levelFrom ?? total + 1) - 1;
      const c = this.card(sc.content, i, sea.id, from, to, level, i === cur);
      at(c, 0, -CARD_H / 2 - i * (CARD_H + GAP) - 6);
      return c;
    });
    sc.setContentHeight(seas.length * (CARD_H + GAP) + 12);
    // 打开时停在现在的海域，上面露出一点前一个
    sc.scrollTo(Math.max(0, cur * (CARD_H + GAP) - CARD_H * 0.4));
    enterStagger(cards.slice(Math.max(0, cur - 1), cur + 3), 0.05);
  }

  /** 一张海域卡 */
  private card(parent: Node, i: number, id: string, from: number, to: number, level: number, current: boolean): Node {
    const open = level >= from;
    const n = slice(parent, 'kit/panel_blue', CARD_W, CARD_H, `sea${i}`);
    // 画面：这片海域的局内背景，取中间偏下的一截（有海底和景物），四边留出卡的边
    const pw = CARD_W - 24;
    const ph = CARD_H - 30;
    const pic = box('pic', n, pw, ph);
    at(pic, 0, 4);
    pic.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
    const im = lazyImg(pic, `bg/sea_${id}`, pw, pw * 1.5);
    at(im, 0, pw * 0.5);
    if (!open) {
      const sp = im.getComponent(Sprite);
      if (sp) {
        sp.grayscale = true;
        sp.color = DIM;
      }
    }
    // 左上：海域名
    const name = slice(n, 'kit/title_plate', 280, 66, 'name');
    at(name, -pw / 2 + 150, ph / 2 - 30);
    fit(text(name, tr(`ALBUM_BOOK_${i + 1}`), 34), 250, 34, 22);
    // 下面一条：关卡范围 + 进度
    const low = box('low', n, pw, 64);
    at(low, 0, -ph / 2 + 36);
    const shade = img(low, 'kit/white', pw, 64, 'shade');
    (shade.getComponent(Sprite) as Sprite).color = new Color(10, 30, 70, 150);
    setInk(low, WHITE_INK);
    const range = text(low, tr('MAP_RANGE', from, to), 28, { align: 'left' });
    at(range.node, -pw / 2 + 20, 0);
    if (open) {
      const done = Math.max(0, Math.min(to, level - 1) - from + 1);
      const bar = progressBar(low, 220, 30, done >= to - from + 1 ? 'green' : 'blue');
      at(bar.node, pw / 2 - 20 - 110 - 70, 0);
      bar.set(done / (to - from + 1));
      at(text(bar.node, `${done}/${to - from + 1}`, 22).node, 0, 1);
    } else {
      const lk = text(low, tr('H_UNLOCKS_AT', from), 28);
      at(lk.node, pw / 2 - 150, 0);
      at(img(low, 'kit/ic_lock', 36, 36, 'lock'), pw / 2 - 150 - 110, 0);
    }
    if (current) {
      // 现在所在的海域：右上一面「当前」小旗、整张卡轻轻呼吸
      const tag = slice(n, 'kit/btn_yellow', 120, 50, 'current');
      at(tag, pw / 2 - 70, ph / 2 - 26);
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
      ui.go('levels', { sea: i });
    }, { sound: null });
    return n;
  }
}
