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
import { Btn, COLOR, Capsule, INK, at, button, capsule, fmt, img, slice, text } from '../ui/kit';
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
    img(root, 'kit/bg_page', Screen.W, Screen.H, 'bg');
    const top = Screen.top;
    // 标题 + 右上金币（8 栅格，页边距 32）
    const titleY = top - 72;
    at(text(root, tr('UI_TAB_SHOP'), 56).node, 0, titleY);
    this.coins = capsule(root, 220, 64, 'icon/coin', '0', 30);
    at(this.coins.node, Screen.W / 2 - 32 - 110, titleY);

    // 2 × 2 技能卡 + 一行两张小卡（生命、免费金币），卡片间距 24
    const M = 32;
    const G = 24;
    const cardW = (Screen.W - M * 2 - G) / 2;
    const y0 = titleY - 32 - 32;
    const y1 = Screen.bottom + TABBAR_H + 32;
    const rowH = 184;
    const cardH = Math.min(368, (y0 - y1 - rowH - G * 2) / 2);
    const cx = cardW / 2 + G / 2;
    Skills.ids(eco).forEach((id, i) => {
      const x = (i % 2 === 0 ? -1 : 1) * cx;
      const y = y0 - cardH / 2 - Math.floor(i / 2) * (cardH + G);
      this.cards.push(this.skillCard(root, id, x, y, cardW, cardH));
    });
    const rowY = y0 - 2 * (cardH + G) - rowH / 2;
    this.rows.push(this.lifeRow(root, -cx, rowY, cardW, rowH));
    this.rows.push(this.adRow(root, cx, rowY, cardW, rowH));
  }

  /** 技能卡：名字 · 插画 · 已有数量 · 金币价格按钮（主按钮色）；没开放的换灰色锁定条 */
  private skillCard(root: Node, id: string, x: number, y: number, w: number, h: number): SkillCard {
    const eco = App.config.eco;
    const n = slice(root, 'kit/panel_glass', w, h, `skill_${id}`);
    at(n, x, y);
    const name = text(n, tr(NAME[id]), 32);
    at(name.node, 0, h / 2 - 24 - 20);
    const btnH = 88;
    const btnY = -h / 2 + 24 + btnH / 2;
    const ownedY = btnY + btnH / 2 + 24;

    const icon = img(n, `icon/skill_${id}`, 140, 140, 'icon');
    at(icon, 0, (h / 2 - 64 + ownedY + 13) / 2);

    const owned = text(n, '', 26, { color: INK.sub });
    at(owned.node, 0, ownedY);
    const buy = button(n, {
      color: 'green',
      w: w - 48,
      h: btnH,
      icon: 'icon/coin',
      iconSize: 48,
      label: fmt(Skills.price(eco, id)),
      fontSize: 34,
      onTap: () => this.buySkill(id),
    });
    at(buy.node, 0, btnY);
    const lock = slice(n, 'kit/btn_gray', w - 48, btnH, 'lock');
    at(lock, 0, btnY);
    const li = img(lock, 'kit/ic_lock', 40, 40, 'ic');
    const ll = text(lock, tr('SKILL_LOCKED', Skills.unlockLevel(eco, id)), 28);
    ll.updateRenderData(true);
    const lw = (ll.node.getComponent(UITransform) as UITransform).width;
    at(li, -(lw + 48) / 2 + 20, 4);
    at(ll.node, 24, 4);
    return { id, node: n, icon, owned, buy, lock };
  }

  /** 生命：标题、心 + 当前数量、金币买一条 */
  private lifeRow(root: Node, x: number, y: number, w: number, h: number): Node {
    const n = slice(root, 'kit/panel_glass', w, h, 'lives');
    at(n, x, y);
    at(text(n, tr('H_LIVES_TITLE'), 32, { align: 'left' }).node, -w / 2 + 24, h / 2 - 44);
    this.heart = img(n, 'icon/heart', 72, 72, 'heart');
    at(this.heart, -w / 2 + 24 + 36, -28);
    this.lifeCount = text(this.heart, '', 28, { color: COLOR.white });
    at(this.lifeCount.node, 0, 2);
    this.lifeBtn = button(n, {
      color: 'green',
      w: 168,
      h: 72,
      icon: 'icon/coin',
      iconSize: 40,
      label: fmt(App.config.eco.lives.buyOneCoins),
      fontSize: 30,
      onTap: () => this.buyLife(),
    });
    at(this.lifeBtn.node, w / 2 - 24 - 84, -28);
    return n;
  }

  /** 免费金币：看广告（琥珀色按钮）+ 今日剩余次数 */
  private adRow(root: Node, x: number, y: number, w: number, h: number): Node {
    const eco = App.config.eco;
    const n = slice(root, 'kit/panel_glass', w, h, 'freeCoins');
    at(n, x, y);
    at(text(n, tr('SHOP_FREE_COINS'), 32, { align: 'left' }).node, -w / 2 + 24, h / 2 - 44);
    this.adLeft = text(n, '', 22, { color: INK.sub, align: 'right' });
    at(this.adLeft.node, w / 2 - 24, h / 2 - 44);
    const pile = box3(n);
    at(pile, -w / 2 + 24 + 36, -24);
    pile.setScale(0.72, 0.72, 1);
    this.adBtn = button(n, {
      color: 'yellow',
      w: 168,
      h: 72,
      icon: 'kit/ic_video',
      iconSize: 36,
      label: `+${eco.freeCoin.amount}`,
      fontSize: 30,
      onTap: () => void this.freeCoins(),
    });
    at(this.adBtn.node, w / 2 - 24 - 84, -28);
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
    this.coins.set(fmt(s.coins));
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
    this.lifeBtn.setLabel(full ? tr('UI_FULL') : fmt(eco.lives.buyOneCoins));
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
