// 商店页签（定版图 04，docs/01 7.4、docs/09 第 4 节）：金币买技能（2×2 卡片）、金币买生命、看广告领金币。
// 顶栏只在主页，这里右上放一个金币胶囊显示余额。技能卡上写已有数量；没解锁的灰色带锁和「第 N 关」。
// 金币不够：按钮照常可点，点了弹「金币不足」（spend）。
import { Node, Sprite, UITransform } from 'cc';
import * as Lives from '../core/meta/lives';
import * as Meta from '../core/meta/meta';
import * as Skills from '../core/meta/skills';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import { now, today } from '../services/clock';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { Btn, COLOR, Capsule, at, button, capsule, img, lazyImg, slice, text } from '../ui/kit';
import { coinsFly, spend, watchAd } from '../ui/popups';
import { Screen } from '../ui/screen';
import { Page, TABBAR_H, enterStagger, ui } from '../ui/shell';

interface SkillCard {
  id: string;
  node: Node;
  icon: Node;
  owned: ReturnType<typeof text>;
  buy: Btn;
  lock: Node;
}

const NAME: Record<string, string> = {
  shuffle: 'H_SKILL_SHUFFLE',
  blow: 'H_SKILL_BLOW',
  net: 'H_SKILL_NET',
  current: 'H_SKILL_FLOW',
};

export class ShopPage extends Page {
  readonly tab = 'shop' as const;
  private coins!: Capsule;
  private cards: SkillCard[] = [];
  private lifeBtn!: Btn;
  private lifeCount!: ReturnType<typeof text>;
  private heart!: Node;
  private adBtn!: Btn;
  private adLeft!: ReturnType<typeof text>;
  private rows: Node[] = [];

  build(root: Node): void {
    const eco = App.config.eco;
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(root, 'bg/home', (bgH * 1024) / 1536, bgH);
    const top = Screen.top;
    // 标题 + 两条鱼 + 金币胶囊
    const title = slice(root, 'kit/title_page', 320, 100, 'title');
    at(title, 0, top - 150);
    at(text(title, tr('UI_TAB_SHOP'), 60).node, 0, 4);
    const f1 = img(root, 'fish/c03', 120, 120, 'fishL');
    at(f1, -250, top - 150);
    const f2 = img(root, 'fish/c05', 110, 110, 'fishR');
    at(f2, 250, top - 150);
    f2.setScale(-1, 1, 1);
    fx.bob(f1, 8, 2.2);
    fx.bob(f2, 8, 2.6, 0.5);
    this.coins = capsule(root, 230, 64, 'icon/coin', '0');
    at(this.coins.node, Screen.W / 2 - 140, top - 50);

    // 可用高度：标题下到底栏上
    const y0 = top - 220;
    const y1 = Screen.bottom + TABBAR_H + 20;
    const rowH = 150;
    const gap = 22;
    const cardH = Math.min(380, (y0 - y1 - rowH - gap * 3) / 2);
    const cardW = 330;
    Skills.ids(eco).forEach((id, i) => {
      const x = (i % 2 === 0 ? -1 : 1) * (cardW / 2 + gap / 2);
      const y = y0 - cardH / 2 - Math.floor(i / 2) * (cardH + gap);
      this.cards.push(this.skillCard(root, id, x, y, cardW, cardH));
    });
    const rowY = y0 - 2 * (cardH + gap) - rowH / 2;
    this.rows.push(this.lifeRow(root, -(cardW / 2 + gap / 2), rowY, cardW, rowH));
    this.rows.push(this.adRow(root, cardW / 2 + gap / 2, rowY, cardW, rowH));
  }

  private skillCard(root: Node, id: string, x: number, y: number, w: number, h: number): SkillCard {
    const eco = App.config.eco;
    const n = slice(root, 'kit/panel_glass', w, h, `skill_${id}`);
    at(n, x, y);
    const name = text(n, tr(NAME[id]), 44);
    at(name.node, 0, h / 2 - 50);
    const is = Math.min(160, h - 230);
    const icon = img(n, `icon/skill_${id}`, is, is, 'icon');
    at(icon, 0, (h / 2 - 80 + (-h / 2 + 140)) / 2);
    const owned = text(n, '', 30);
    at(owned.node, 0, -h / 2 + 122);
    const buy = button(n, {
      color: 'green',
      w: w - 60,
      h: 84,
      icon: 'icon/coin',
      label: String(Skills.price(eco, id)),
      fontSize: 44,
      onTap: () => this.buySkill(id),
    });
    at(buy.node, 0, -h / 2 + 58);
    const lock = slice(n, 'kit/btn_gray', w - 60, 84, 'lock');
    at(lock, 0, -h / 2 + 58);
    const li = img(lock, 'kit/ic_lock', 44, 44, 'ic');
    at(li, -(w - 60) / 2 + 50, 2);
    at(text(lock, tr('SKILL_LOCKED', Skills.unlockLevel(eco, id)), 30).node, 20, 3);
    return { id, node: n, icon, owned, buy, lock };
  }

  private lifeRow(root: Node, x: number, y: number, w: number, h: number): Node {
    const n = slice(root, 'kit/panel_glass', w, h, 'lives');
    at(n, x, y);
    at(text(n, tr('H_LIVES_TITLE'), 38).node, -w / 2 + 70, 26);
    this.heart = img(n, 'icon/heart', 84, 84, 'heart');
    at(this.heart, -w / 2 + 70, -26);
    this.lifeCount = text(this.heart, '', 30);
    at(this.lifeCount.node, 0, 2);
    this.lifeBtn = button(n, {
      color: 'green',
      w: 180,
      h: 84,
      icon: 'icon/coin',
      label: String(App.config.eco.lives.buyOneCoins),
      fontSize: 36,
      onTap: () => this.buyLife(),
    });
    at(this.lifeBtn.node, w / 2 - 110, 0);
    return n;
  }

  private adRow(root: Node, x: number, y: number, w: number, h: number): Node {
    const eco = App.config.eco;
    const n = slice(root, 'kit/panel_glass', w, h, 'freeCoins');
    at(n, x, y);
    at(text(n, tr('SHOP_FREE_COINS'), 34).node, -w / 2 + 80, 30);
    const pile = box3(n);
    at(pile, -w / 2 + 80, -22);
    pile.setScale(0.8, 0.8, 1);
    this.adLeft = text(n, '', 24);
    at(this.adLeft.node, w / 2 - 110, -54);
    this.adBtn = button(n, {
      color: 'yellow',
      w: 180,
      h: 80,
      icon: 'kit/ic_video',
      label: `+${eco.freeCoin.amount}`,
      fontSize: 36,
      onTap: () => void this.freeCoins(),
    });
    at(this.adBtn.node, w / 2 - 110, 8);
    return n;
  }

  override show(): void {
    this.refresh();
    enterStagger([...this.cards.map((c) => c.node), ...this.rows], 0.05);
  }

  override refresh(): void {
    const s = App.save.data;
    const eco = App.config.eco;
    const t = now();
    this.coins.set(String(s.coins));
    for (const c of this.cards) {
      const open = Skills.isUnlocked(eco, c.id, s.level);
      (c.icon.getComponent(Sprite) as Sprite).grayscale = !open;
      c.buy.node.active = open;
      c.lock.active = !open;
      c.owned.string = open ? tr('UI_OWNED', Skills.count(s, c.id)) : '';
    }
    Lives.refresh(s, eco, t);
    const unlimited = Lives.isUnlimited(s, t);
    const full = unlimited || Lives.count(s, eco, t) >= eco.lives.max;
    this.lifeCount.string = unlimited ? '∞' : String(Lives.count(s, eco, t));
    this.lifeBtn.setEnabled(!full);
    if (this.lifeBtn.icon) this.lifeBtn.icon.active = !full;
    this.lifeBtn.setLabel(full ? tr('UI_FULL') : String(eco.lives.buyOneCoins));
    const left = Meta.freeCoinLeft(s, eco, today());
    this.adLeft.string = tr('SHOP_AD_LEFT', left, eco.freeCoin.daily);
    this.adBtn.setEnabled(left > 0 && App.platform.adsAvailable());
  }

  private buySkill(id: string): void {
    const s = App.save.data;
    const eco = App.config.eco;
    const price = Skills.price(eco, id);
    if (!spend(price)) return;
    if (!Skills.buy(s, eco, id)) return;
    App.save.write();
    sfx('coin');
    const c = this.cards.find((k) => k.id === id);
    if (c) {
      fx.squash(c.icon);
      const plus = text(null, '+1', 48, { color: COLOR.yellow });
      fx.floatUp(c.node, plus.node, 0, 40);
    }
    ui.refresh();
  }

  private buyLife(): void {
    const s = App.save.data;
    const eco = App.config.eco;
    if (!spend(eco.lives.buyOneCoins)) return;
    if (!Lives.buyOne(s, eco, now())) {
      ui.toast(tr('H_LIVES_FULL'));
      return;
    }
    App.save.write();
    sfx('coin');
    fx.squash(this.heart);
    ui.refresh();
  }

  private async freeCoins(): Promise<void> {
    const s = App.save.data;
    const eco = App.config.eco;
    if (Meta.freeCoinLeft(s, eco, today()) <= 0) {
      ui.toast(tr('SHOP_AD_DONE'));
      return;
    }
    if (!(await watchAd('rv_free_coin'))) return;
    if (!Meta.takeFreeCoin(s, eco, today())) return;
    App.save.write();
    const tf = ui.fx.getComponent(UITransform) as UITransform;
    const from = tf.convertToNodeSpaceAR(this.adBtn.node.worldPosition.clone());
    const to = tf.convertToNodeSpaceAR((this.coins.icon ?? this.coins.node).worldPosition.clone());
    coinsFly([from.x, from.y], this.coins.label, [to.x, to.y]);
    sfx('coins');
    ui.refresh();
  }
}

/** 一小堆金币（三枚叠放） */
function box3(parent: Node): Node {
  const n = img(parent, 'icon/coin', 70, 70, 'pile');
  const a = img(n, 'icon/coin', 56, 56, 'a');
  at(a, -26, -16);
  const b = img(n, 'icon/coin', 56, 56, 'b');
  at(b, 26, -18);
  a.setSiblingIndex(0);
  b.setSiblingIndex(0);
  return n;
}
