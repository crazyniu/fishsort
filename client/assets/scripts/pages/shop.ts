// 商店页签（定版图 04，docs/01 7.4、docs/09 第 4 节）：金币买技能（2×2 卡片）、金币买生命、看广告领金币。
// 海底场景做背景，卡片是蓝色玻璃面板、白字。顶栏只在主页，这里标题右边放一个金币条显示余额。
// 技能卡上写已有数量；没解锁的灰色带锁和「第 N 关」。金币不够：按钮照常可点，点了弹「金币不足」（spend）。
import { Label, Node, Sprite, UITransform } from 'cc';
import * as Lives from '../core/meta/lives';
import * as Meta from '../core/meta/meta';
import * as Skills from '../core/meta/skills';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import { now, today } from '../services/clock';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { Btn, COLOR, at, hex, button, fmt, img, lazyImg, plate, slice, text } from '../ui/kit';
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

/** 蓝色面板上的次要文字（已有数量、今日次数）：比白色淡一档 */
const SOFT = hex('#D4ECFF');

export class ShopPage extends Page {
  readonly tab = 'shop' as const;
  private coins!: Label;
  private coinIcon!: Node;
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
    // 标题牌居中，右边是金币余额条
    const titleY = top - 76;
    const title = plate(root, 'skin/j_plate', 232, 84, 'title');
    at(title, 0, titleY);
    at(text(title, tr('UI_TAB_SHOP'), 56).node, 0, 3);
    const CHIP = 214;
    const chip = plate(root, 'skin/j_bar_top', CHIP, 68, 'coins');
    at(chip, Screen.W / 2 - 20 - CHIP / 2, titleY);
    this.coinIcon = img(chip, 'icon/coin', 54, 54, 'icon');
    at(this.coinIcon, -CHIP / 2 + 36, 2);
    this.coins = text(chip, '0', 32, { align: 'left' });
    at(this.coins.node, -CHIP / 2 + 68, 2);

    // 2 × 2 技能卡 + 一行两张小卡（生命、免费金币）；页边距 20，卡片间距 16
    const M = 20;
    const G = 16;
    const cardW = (Screen.W - M * 2 - G) / 2;
    const y1 = Screen.bottom + TABBAR_H + 22;
    const rowH = 172;
    const room = titleY - 42 - 22 - y1;
    const cardH = Math.min(410, (room - rowH - G * 2) / 2);
    // 屏幕高、放不满时整块略往下放，不贴着标题
    const y0 = titleY - 42 - 22 - (room - (cardH * 2 + rowH + G * 2)) / 3;
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

  /** 技能卡：名字 · 大插画 · 已有数量 · 金币价格按钮（主按钮色）；没开放的换灰色锁定条 */
  private skillCard(root: Node, id: string, x: number, y: number, w: number, h: number): SkillCard {
    const eco = App.config.eco;
    const n = slice(root, 'skin/j_panel', w, h, `skill_${id}`);
    at(n, x, y);
    const name = text(n, tr(NAME[id]), 40);
    at(name.node, 0, h / 2 - 48);
    const btnH = 92;
    const btnW = w - 44;
    const btnY = -h / 2 + 24 + btnH / 2;
    const ownedY = btnY + btnH / 2 + 24;
    // 插画占满名字和数量之间
    const room = h / 2 - 80 - (ownedY + 20);
    const is = Math.max(110, Math.min(200, room));
    const icon = img(n, `icon/skill_${id}`, is, is, 'icon');
    at(icon, 0, ownedY + 20 + room / 2);

    const owned = text(n, '', 28, { color: SOFT });
    at(owned.node, 0, ownedY);
    const buy = button(n, {
      color: 'green',
      w: btnW,
      h: btnH,
      icon: 'icon/coin',
      iconSize: 56,
      label: fmt(Skills.price(eco, id)),
      fontSize: 44,
      onTap: () => this.buySkill(id),
    });
    at(buy.node, 0, btnY);
    const lock = plate(n, 'skin/j_btn_gray', btnW, btnH, 'lock');
    at(lock, 0, btnY);
    const li = img(lock, 'kit/ic_lock', 44, 44, 'ic');
    const ll = text(lock, tr('SKILL_LOCKED', Skills.unlockLevel(eco, id)), 30);
    ll.updateRenderData(true);
    const lw = (ll.node.getComponent(UITransform) as UITransform).width;
    at(li, -(lw + 52) / 2 + 22, 4);
    at(ll.node, 26, 3);
    return { id, node: n, icon, owned, buy, lock };
  }

  /** 生命：标题、心 + 当前数量、金币买一条 */
  private lifeRow(root: Node, x: number, y: number, w: number, h: number): Node {
    const n = slice(root, 'skin/j_panel', w, h, 'lives');
    at(n, x, y);
    at(text(n, tr('H_LIVES_TITLE'), 36, { align: 'left' }).node, -w / 2 + 26, h / 2 - 42);
    this.heart = img(n, 'icon/heart', 84, 84, 'heart');
    at(this.heart, -w / 2 + 26 + 42, -30);
    this.lifeCount = text(this.heart, '', 32, { color: COLOR.white, outline: hex('#8A1F12') });
    this.lifeCount.color = COLOR.white;
    at(this.lifeCount.node, 0, 3);
    this.lifeBtn = button(n, {
      color: 'green',
      w: 176,
      h: 78,
      icon: 'icon/coin',
      iconSize: 46,
      label: fmt(App.config.eco.lives.buyOneCoins),
      fontSize: 36,
      onTap: () => this.buyLife(),
    });
    at(this.lifeBtn.node, w / 2 - 24 - 88, -32);
    return n;
  }

  /** 免费金币：看广告（琥珀色按钮）+ 今日剩余次数 */
  private adRow(root: Node, x: number, y: number, w: number, h: number): Node {
    const eco = App.config.eco;
    const n = slice(root, 'skin/j_panel', w, h, 'freeCoins');
    at(n, x, y);
    at(text(n, tr('SHOP_FREE_COINS'), 36, { align: 'left' }).node, -w / 2 + 26, h / 2 - 42);
    this.adLeft = text(n, '', 24, { color: SOFT, align: 'right' });
    at(this.adLeft.node, w / 2 - 24, h / 2 - 42);
    const pile = box3(n);
    at(pile, -w / 2 + 26 + 44, -28);
    pile.setScale(0.84, 0.84, 1);
    this.adBtn = button(n, {
      color: 'yellow',
      w: 176,
      h: 78,
      icon: 'kit/ic_video',
      iconSize: 42,
      label: `+${eco.freeCoin.amount}`,
      fontSize: 36,
      onTap: () => void this.freeCoins(),
    });
    at(this.adBtn.node, w / 2 - 24 - 88, -32);
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
    const cs = fmt(s.coins);
    this.coins.fontSize = cs.length > 7 ? 26 : 32;
    this.coins.string = cs;
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
    const to = tf.convertToNodeSpaceAR(this.coinIcon.worldPosition.clone());
    coinsFly([from.x, from.y], this.coins, [to.x, to.y]);
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
