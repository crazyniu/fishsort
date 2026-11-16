// 商店页签（定版图 04，docs/01 7.4、docs/09 第 4 节）：金币买技能（2×2 卡片）、金币买生命、看广告领金币。
// 海底场景做背景，卡片是蓝色玻璃面板、白字。上面是完整顶栏（金币、生命都要看得到，docs/01 5.3），下面居中的标题牌。
// 六张卡片同一种排法：左上名字、右上小字状态、中间图标、下面按钮。没解锁的技能换灰色锁定条和「第 N 关」。
// 金币不够：按钮照常可点，点了弹「金币不足」（spend）。
import { Node, Sprite, Tween, UITransform } from 'cc';
import * as Lives from '../core/meta/lives';
import * as Meta from '../core/meta/meta';
import * as Skills from '../core/meta/skills';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import { now, today } from '../services/clock';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { Btn, COLOR, at, hex, button, fitPair, fmt, img, lazyImg, opacity, pageTitle, plate, slice, text } from '../ui/kit';
import { coinsFly, spend, watchAd } from '../ui/popups';
import { Screen } from '../ui/screen';
import { Page, TABBAR_H, enterStagger, ui } from '../ui/shell';

interface SkillCard {
  id: string;
  node: Node;
  name: ReturnType<typeof text>;
  /** 卡片里一行字能用的宽 */
  room: number;
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

/** 插画的视觉大小不一样（洗牌的箭头偏小），按图微调到看起来一样大 */
const ICON_K: Record<string, number> = { shuffle: 1.1, blow: 1.06, net: 1, current: 0.96 };

/** 蓝色面板上的次要文字（已有数量、今日次数）：比白色淡一档 */
const SOFT = hex('#D4ECFF');

export class ShopPage extends Page {
  readonly tab = 'shop' as const;
  override readonly topBar = true;
  private cards: SkillCard[] = [];
  private lifeBtn!: Btn;
  private lifeTitle!: ReturnType<typeof text>;
  private adTitle!: ReturnType<typeof text>;
  private smallRoom = 0;
  private lifeCount!: ReturnType<typeof text>;
  private heart!: Node;
  private adBtn!: Btn;
  private adLeft!: ReturnType<typeof text>;
  private rows: Node[] = [];
  private deco: Node[] = [];

  build(root: Node): void {
    const eco = App.config.eco;
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(root, 'bg/home', (bgH * 1024) / 1536, bgH);
    // 顶栏下面：标题牌居中，两侧各一条小鱼（定版图 04）；小鱼上下浮动是全页唯一的常驻动效
    const titleY = Screen.top - 122 - 14 - 40;
    // 夹在顶栏和卡片之间：牌比别的页小一号，上下各让出几个像素，不贴着顶栏
    at(pageTitle(root, tr('UI_TAB_SHOP'), 68), 0, titleY - 2);
    for (const [id, x] of [['c01', -196], ['c02', 196]] as const) {
      const f = img(root, `fish/${id}`, 96, 96, `deco_${id}`);
      at(f, x, titleY + 2);
      if (x > 0) f.setScale(-1, 1, 1);
      this.deco.push(f);
    }

    // 2 × 2 技能卡 + 一行两张小卡（生命、免费金币）；页边距 20，卡片间距 16
    const M = 20;
    const G = 16;
    const cardW = (Screen.W - M * 2 - G) / 2;
    // 选中的页签方块会高出底栏一截，下面多留一点
    const y1 = Screen.bottom + TABBAR_H + 36;
    const rowH = 168;
    const room = titleY - 40 - 18 - y1;
    const cardH = Math.min(410, (room - rowH - G * 2) / 2);
    // 屏幕高、放不满时整块略往下放，不贴着标题
    const y0 = titleY - 40 - 18 - (room - (cardH * 2 + rowH + G * 2)) / 3;
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
    // 和下面两张小卡同一种排法：左上名字、右上小字状态（已有数量）
    const name = text(n, tr(NAME[id]), 38, { align: 'left' });
    at(name.node, -w / 2 + 26, h / 2 - 44);
    const owned = text(n, '', 26, { color: SOFT, align: 'right' });
    at(owned.node, w / 2 - 24, h / 2 - 44);
    const btnH = 92;
    const btnW = w - 44;
    const btnY = -h / 2 + 24 + btnH / 2;
    // 插画占满名字和按钮之间，后面垫一团柔光把它从面板上托起来
    const lo = btnY + btnH / 2 + 10;
    const room = h / 2 - 76 - lo;
    const is = Math.max(110, Math.min(210, room)) * (ICON_K[id] ?? 1);
    const cy = lo + room / 2;
    const glow = img(n, 'kit/fx_glow', is * 1.5, is * 1.5, 'glow');
    at(glow, 0, cy);
    opacity(glow).opacity = 110;
    const icon = img(n, `icon/skill_${id}`, is, is, 'icon');
    at(icon, 0, cy);

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
    return { id, node: n, name, room: w - 50, icon, owned, buy, lock };
  }

  /** 生命：标题、心 + 当前数量、金币买一条 */
  private lifeRow(root: Node, x: number, y: number, w: number, h: number): Node {
    const n = slice(root, 'skin/j_panel', w, h, 'lives');
    at(n, x, y);
    this.lifeTitle = text(n, tr('H_LIVES_TITLE'), 36, { align: 'left' });
    at(this.lifeTitle.node, -w / 2 + 26, h / 2 - 42);
    this.smallRoom = w - 50;
    // 和右边的小卡同一种排法：左上标题、右上小字状态、左下图标、右下按钮
    this.lifeCount = text(n, '', 26, { color: SOFT, align: 'right' });
    at(this.lifeCount.node, w / 2 - 24, h / 2 - 42);
    this.heart = img(n, 'icon/heart', 88, 88, 'heart');
    at(this.heart, -w / 2 + 26 + 44, -30);
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
    this.adTitle = text(n, tr('SHOP_FREE_COINS'), 36, { align: 'left' });
    at(this.adTitle.node, -w / 2 + 26, h / 2 - 42);
    this.adLeft = text(n, '', 26, { color: SOFT, align: 'right' });
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
    const titleY = Screen.top - 122 - 14 - 40;
    this.deco.forEach((f, i) => {
      Tween.stopAllByTarget(f);
      at(f, f.position.x, titleY + 2);
      fx.bob(f, 5, 2.6, i * 0.5);
    });
    enterStagger([...this.cards.map((c) => c.node), ...this.rows], 0.05);
  }

  override hide(): void {
    for (const f of this.deco) Tween.stopAllByTarget(f);
  }

  override refresh(): void {
    const s = App.save.data;
    const eco = App.config.eco;
    const t = now();
    for (const c of this.cards) {
      const open = Skills.isUnlocked(eco, c.id, s.level);
      (c.icon.getComponent(Sprite) as Sprite).grayscale = !open;
      c.buy.node.active = open;
      c.lock.active = !open;
      c.owned.string = open ? tr('UI_OWNED', Skills.count(s, c.id)) : '';
      fitPair(c.name, c.owned, c.room, 38, 26);
    }
    Lives.refresh(s, eco, t);
    const unlimited = Lives.isUnlimited(s, t);
    const full = unlimited || Lives.count(s, eco, t) >= eco.lives.max;
    this.lifeCount.string = unlimited ? '∞' : `${Lives.count(s, eco, t)}/${eco.lives.max}`;
    fitPair(this.lifeTitle, this.lifeCount, this.smallRoom, 36, 26);
    this.lifeBtn.setEnabled(!full);
    if (this.lifeBtn.icon) this.lifeBtn.icon.active = !full;
    this.lifeBtn.setLabel(full ? tr('UI_FULL') : fmt(eco.lives.buyOneCoins));
    const left = Meta.freeCoinLeft(s, eco, today());
    this.adLeft.string = tr('SHOP_AD_LEFT', left, eco.freeCoin.daily);
    fitPair(this.adTitle, this.adLeft, this.smallRoom, 36, 26);
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
    const to = tf.convertToNodeSpaceAR(ui.topbar.coinIcon.worldPosition.clone());
    coinsFly([from.x, from.y], ui.topbar.coins, [to.x, to.y]);
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
