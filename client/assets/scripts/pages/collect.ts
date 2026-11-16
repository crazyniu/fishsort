// 收藏页签（定版图 06、08 左；docs/01 5.4；docs/ux/collection.md；docs/09 第 4 节）。
// 首页：总进度 N/60 + 终极大奖宝箱，下面 6 册（一册一个海域）：进行中 / 集齐可领 / 已领取 / 未开放。
// 册内：顶部大奖条（金币 + 四个技能 + 进度），10 张卡 3 列。卡片：鱼缸 + 鱼 + 名字（稀有度颜色），
// 没有的是剪影和「未知」；拥有 ≥2 张右上角红点写张数；局内出场的 16 种多一行「已救 N 只」进度，到档出「领取」。
import { Node, Sprite, UITransform } from 'cc';
import * as Album from '../core/meta/album';
import * as Dex from '../core/meta/dex';
import * as PlayerData from '../core/meta/playerData';
import type { Species } from '../core/config';
import { Rng } from '../core/rng/rng';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import { now } from '../services/clock';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { COLOR, at, box, button, hex, iconButton, img, lazyImg, onTap, opacity, progressBar, redDot, slice, text } from '../ui/kit';
import { RARITY_GLOW, coinsFly, prizeItems, rewardPopup, speciesName } from '../ui/popups';
import { Scroller } from '../ui/scroll';
import { Screen } from '../ui/screen';
import { Page, TABBAR_H, enterStagger, ui } from '../ui/shell';

const ROW_H = 170;
const ROW_GAP = 16;
const CELL_W = 224;
const CELL_H = 300;

/** 册内卡片的稀有度底色（名字牌） */
const RARITY_PLATE: Record<string, string> = {
  common: '#3C5FA8',
  uncommon: '#2F8F3A',
  rare: '#1F6FD8',
  epic: '#7A35D0',
  legend: '#C98A08',
};

export class CollectPage extends Page {
  readonly tab = 'collect' as const;
  /** 正在看哪一册；-1 = 册子列表。切走再回来还在这一册 */
  private static book = -1;
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

  override back(): boolean {
    if (CollectPage.book >= 0) {
      CollectPage.book = -1;
      this.render(true);
      return false;
    }
    return true;
  }

  override refresh(): void {
    // 领奖后整页重画（数字、按钮、红点一起变），不重播进场
    this.render(false);
  }

  private render(enter: boolean): void {
    const keep = this.scroller ? this.scrollOffset() : 0;
    this.scroller?.stop();
    this.view?.destroy();
    this.view = box('view', this.root, Screen.W, Screen.H);
    this.scroller = null;
    if (CollectPage.book >= 0) this.bookView(this.view, CollectPage.book, enter);
    else this.listView(this.view, enter);
    if (!enter && this.scroller) (this.scroller as Scroller).scrollTo(keep);
  }

  private scrollOffset(): number {
    const s = this.scroller;
    return s ? s.content.position.y - s.h / 2 : 0;
  }

  // ---------------------------------------------------------------- 册子列表
  private listView(v: Node, enter: boolean): void {
    const s = App.save.data;
    const eco = App.config.eco;
    const top = Screen.top;
    const title = slice(v, 'kit/title_page', 320, 100, 'title');
    at(title, 0, top - 90);
    at(text(title, tr('UI_TAB_COLLECTION'), 60).node, 0, 4);
    const fish = img(v, 'fish/c03', 110, 110, 'fish');
    at(fish, -230, top - 90);
    fx.bob(fish, 8, 2.4);

    // 总进度 + 终极大奖宝箱
    const books = Album.books(eco);
    const total = books.reduce((a, b) => a + b.cards.length, 0);
    const got = books.reduce((a, _b, i) => a + Album.have(s, eco, i), 0);
    const head = slice(v, 'kit/panel_glass', 690, 130, 'total');
    at(head, 0, top - 230);
    const ic = img(head, 'icon/tab_collect', 110, 110, 'icon');
    at(ic, -270, 0);
    const n = text(head, `${got}/${total}`, 46, { align: 'left' });
    at(n.node, -190, 22);
    const bar = progressBar(head, 300, 28, 'green');
    at(bar.node, -40, -28);
    bar.set(got / total);
    const final = Album.canClaimFinal(s, eco);
    const chest = img(head, s.album.final ? 'icon/chest_open' : 'icon/chest', 130, 130, 'chest');
    at(chest, 250, 6);
    if (final) {
      fx.breathe(chest, 0.08, 1);
      redDot(chest, 46, 46);
    }
    onTap(chest, () => this.tapFinal());

    // 册子行
    const y0 = top - 310;
    const y1 = Screen.bottom + TABBAR_H + 10;
    const sc = new Scroller(v, Screen.W, y0 - y1);
    at(sc.node, 0, (y0 + y1) / 2);
    this.scroller = sc;
    const rows: Node[] = [];
    books.forEach((b, i) => {
      const row = this.bookRow(sc.content, i, b.cards, b.unlock);
      at(row, 0, -ROW_GAP / 2 - ROW_H / 2 - i * (ROW_H + ROW_GAP));
      rows.push(row);
    });
    sc.setContentHeight(books.length * (ROW_H + ROW_GAP) + ROW_GAP);
    if (enter) enterStagger([head, ...rows], 0.05);
  }

  private bookRow(parent: Node, i: number, cards: string[], unlock: number): Node {
    const s = App.save.data;
    const eco = App.config.eco;
    const open = Album.isOpen(eco, i, s.level);
    const row = slice(parent, 'kit/panel_glass', 690, ROW_H, `book${i}`);
    const cover = img(row, `skin/j_book_${i + 1}`, 146, 148, 'cover');
    at(cover, -250, 0);
    const star = App.config.speciesById.get(cards[cards.length - 1]);
    const fish = img(cover, `fish/${star?.id ?? cards[0]}`, 100, 100, 'fish');
    at(fish, 6, 4);
    const name = text(row, tr(`ALBUM_BOOK_${i + 1}`), 42, { align: 'left' });
    at(name.node, -160, 34);
    if (!open) {
      for (const n of [cover, fish]) (n.getComponent(Sprite) as Sprite).grayscale = true;
      silhouette(fish);
      const l = img(row, 'kit/ic_lock', 40, 40, 'lk');
      at(l, -140, -30);
      const t = text(row, tr('H_UNLOCKS_AT', unlock), 32, { align: 'left', color: COLOR.yellow });
      at(t.node, -110, -30);
      return row;
    }
    const have = Album.have(s, eco, i);
    // 名字下面一行：进度条 + 右边的数字，不叠在一起
    const bar = progressBar(row, 220, 22, 'green');
    at(bar.node, -160 + 110, -30);
    bar.set(have / cards.length);
    const cnt = text(row, `${have}/${cards.length}`, 28, { align: 'left', color: hex('#D4ECFF') });
    at(cnt.node, -160 + 220 + 16, -30);
    if (Album.canClaim(s, eco, i)) {
      const b = button(row, { color: 'green', w: 170, h: 84, label: tr('ALBUM_TAKE'), fontSize: 40, onTap: () => this.claimBook(i) });
      at(b.node, 220, 0);
      fx.breathe(b.node, 0.05, 1.1);
    } else if (Album.isClaimed(s, i)) {
      const t = text(row, tr('ALBUM_CLAIMED'), 34, { color: COLOR.yellow });
      at(t.node, 230, 0);
    } else {
      // 往右的箭头：用返回键图标左右翻转，和全套图标同一风格
      const arrow = img(row, 'kit/ic_back', 52, 52, 'arrow');
      arrow.setScale(-1, 1, 1);
      at(arrow, 262, 0);
    }
    onTap(row, () => {
      CollectPage.book = i;
      this.render(true);
    }, { press: 0.97 });
    return row;
  }

  private claimBook(i: number): void {
    const s = App.save.data;
    const prizes = Album.claim(s, App.config.eco, i, now(), new Rng(Date.now() >>> 0));
    if (!prizes.length) return;
    App.save.write();
    sfx('chest');
    rewardPopup(prizeItems(prizes), { title: tr('H_GRAND_PRIZE'), onClose: () => ui.refresh() });
  }

  private tapFinal(): void {
    const s = App.save.data;
    const eco = App.config.eco;
    if (!Album.canClaimFinal(s, eco)) {
      // 没集齐：看看里面有什么（只预览）
      const items = prizeItems(Album.grant(clonePreview(), eco.album.final, 0));
      items.push({ icon: 'kit/fx_ring', amount: tr('H_PRIZE_FRAME') });
      rewardPopup(items, { title: tr('ALBUM_FINAL_PREVIEW') });
      return;
    }
    const prizes = Album.claimFinal(s, eco, now(), new Rng(Date.now() >>> 0));
    App.save.write();
    sfx('chest');
    rewardPopup(prizeItems(prizes), { title: tr('H_GRAND_PRIZE'), onClose: () => ui.refresh() });
  }

  // ---------------------------------------------------------------- 一册之内
  private bookView(v: Node, i: number, enter: boolean): void {
    const s = App.save.data;
    const eco = App.config.eco;
    const b = Album.books(eco)[i];
    const top = Screen.top;
    const back = iconButton(v, 'kit/round_blue', 'kit/ic_back', 96, () => this.back());
    at(back, -Screen.W / 2 + 70, top - 80);
    const title = slice(v, 'kit/title_page', 360, 100, 'title');
    at(title, 0, top - 80);
    at(text(title, tr(`ALBUM_BOOK_${i + 1}`), 50).node, 0, 4);

    // 大奖条：金币 + 每种技能 ×n + 进度
    const strip = slice(v, 'kit/panel_glass', 690, 150, 'prize');
    at(strip, 0, top - 220);
    const items = prizeItems(Album.grant(clonePreview(), b.reward, 0));
    const cellW = 88;
    items.forEach((it, k) => {
      const c = box('it', strip, cellW, 130);
      at(c, -322 + cellW / 2 + k * cellW, 0);
      const icon = img(c, it.icon, 66, 66, 'icon');
      at(icon, 0, 14);
      at(text(c, it.amount, 26).node, 0, -40);
    });
    const have = Album.have(s, eco, i);
    const right = 238;
    const sep = img(strip, 'kit/tab_divider', 4, 100, 'sep');
    at(sep, right - 98, 0);
    if (Album.canClaim(s, eco, i)) {
      const btn = button(strip, { color: 'green', w: 170, h: 84, label: tr('ALBUM_TAKE'), fontSize: 40, onTap: () => this.claimBook(i) });
      at(btn.node, right, 0);
      fx.breathe(btn.node, 0.05, 1.1);
    } else if (Album.isClaimed(s, i)) {
      at(text(strip, tr('ALBUM_CLAIMED'), 34, { color: COLOR.yellow }).node, right, 0);
    } else {
      at(text(strip, `${have}/${b.cards.length}`, 40).node, right, 22);
      const bar = progressBar(strip, 160, 24, 'green');
      at(bar.node, right, -28);
      bar.set(have / b.cards.length);
    }

    // 卡片网格
    const y0 = top - 310;
    const y1 = Screen.bottom + TABBAR_H + 10;
    const sc = new Scroller(v, Screen.W, y0 - y1);
    at(sc.node, 0, (y0 + y1) / 2);
    this.scroller = sc;
    const cells: Node[] = [];
    b.cards.forEach((id, k) => {
      const sp = App.config.speciesById.get(id);
      if (!sp) return;
      const cell = this.cardCell(sc.content, sp);
      const row = Math.floor(k / 3);
      const inRow = Math.min(3, b.cards.length - row * 3);
      const col = k % 3;
      at(cell, (col - (inRow - 1) / 2) * CELL_W, -10 - CELL_H / 2 - row * CELL_H);
      cells.push(cell);
    });
    sc.setContentHeight(Math.ceil(b.cards.length / 3) * CELL_H + 20);
    if (enter) enterStagger([strip, ...cells], 0.04);
  }

  private cardCell(parent: Node, sp: Species): Node {
    const s = App.save.data;
    const eco = App.config.eco;
    const owned = s.cards[sp.id] ?? 0;
    const cell = box(sp.id, parent, CELL_W, CELL_H);
    const bowl = img(cell, 'skin/j_bowl', 200, 185, 'bowl');
    at(bowl, 0, 50);
    const fish = img(cell, `fish/${sp.id}`, 140, 140, 'fish');
    at(fish, 0, 40);
    const plate = slice(cell, 'kit/capsule', 190, 52, 'plate');
    at(plate, 0, -58);
    if (owned > 0) {
      (plate.getChildByName('skin')?.getComponent(Sprite) as Sprite).color = hex(RARITY_PLATE[sp.rarity] ?? '#3C5FA8');
      text(plate, speciesName(sp.id), 30, { color: owned > 0 ? COLOR.white : COLOR.gray });
      fx.wiggle(fish, 4, 2 + Math.random());
      const ring = RARITY_GLOW[sp.rarity];
      if (ring && sp.rarity !== 'common') {
        const glow = img(cell, 'kit/fx_glow', 190, 190, 'glow');
        at(glow, 0, 40);
        glow.setSiblingIndex(0);
        (glow.getComponent(Sprite) as Sprite).color = ring;
        opacity(glow).opacity = 120;
      }
      if (owned >= 2) {
        const dot = redDot(cell, 80, 120, 46);
        at(text(dot, String(owned), 24).node, 0, 1);
      }
    } else {
      silhouette(fish);
      opacity(bowl).opacity = 170;
      const q = text(fish, '?', 64, { color: COLOR.white });
      at(q.node, 0, 0);
      text(plate, tr('UI_UNKNOWN'), 30);
    }
    // 救援记录：局内出场的 16 种
    if (sp.inLevel) {
      const n = Dex.count(s, sp.id);
      if (Dex.canClaim(s, eco, sp.id)) {
        const coins = eco.dex.coins[Dex.claimedTier(s, sp.id)];
        const btn = button(cell, {
          color: 'green',
          w: 190,
          h: 64,
          icon: 'icon/coin',
          label: tr('ALBUM_TAKE'),
          fontSize: 30,
          onTap: () => {
            const got = Dex.claim(App.save.data, eco, sp.id);
            if (!got) return;
            App.save.write();
            sfx('coins');
            const tf = ui.fx.getComponent(UITransform) as UITransform;
            const f = tf.convertToNodeSpaceAR(btn.node.worldPosition.clone());
            coinsFly([f.x, f.y], undefined, [0, Screen.top - 200]);
            ui.toast(tr('UI_COINS_GAIN', coins));
            ui.refresh();
          },
        });
        at(btn.node, 0, -116);
        fx.breathe(btn.node, 0.05, 1.1);
      } else {
        const need = Dex.nextNeed(s, eco, sp.id);
        const bar = progressBar(cell, 190, 40, 'blue');
        at(bar.node, 0, -116);
        bar.set(need > 0 ? n / need : 1);
        const t = text(bar.node, need > 0 ? `${n}/${need}` : tr('DEX_RESCUED', n), 24);
        at(t.node, 0, 1);
      }
    }
    return cell;
  }
}

/** 剪影：灰度后染成浅蓝、半透明（没有的卡、没开的册子封面鱼）。不用深色，锁定状态要干净 */
function silhouette(n: Node): void {
  const sp = n.getComponent(Sprite) as Sprite;
  sp.grayscale = true;
  sp.color = hex('#7FA6DA');
  opacity(n).opacity = 190;
}

/** 只为生成奖品列表的空存档（预览用，不改真存档） */
function clonePreview(): ReturnType<typeof PlayerData.create> {
  const save = PlayerData.create(App.config.eco);
  for (const id of App.config.eco.skills.order) save.tools[id] = 0;
  return save;
}
