// 过关结算页（定版图 13）。横幅砸下 → 三颗星依次点亮 → 金币数字滚动 → 宝箱晃动、弹开亮出奖品 → 按钮出现、
// 「下一关」呼吸；点任意处跳到最终状态；全程 ≤ 3 秒（docs/09 第 6 节）。三颗星是过关演出，不是评级。
import { Node, Sprite, Tween, Vec3, tween } from 'cc';
import * as Cards from '../core/meta/cards';
import * as Settle from '../core/meta/settle';
import * as Share from '../core/meta/share';
import { Rng } from '../core/rng/rng';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import { now, today } from '../services/clock';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { Btn, COLOR, at, box, button, hex, img, lazyImg, onTap, opacity, plate, setImg, slice, text } from '../ui/kit';
import { cardItem, prizeCell, watchAd } from '../ui/popups';
import { Screen } from '../ui/screen';
import { Page } from '../ui/shell';
import * as Flow from './flow';

/** 底部 Banner 广告的高度（设计单位） */
const BANNER_H = 120;

export class ResultPage extends Page {
  readonly tab = null;
  private d!: Flow.WinData;
  private content!: Node;
  private skipTo: (() => void) | null = null;

  build(root: Node): void {
    lazyImg(root, 'bg/home', Screen.W * 1.02, Math.max(Screen.H, Screen.W * 1.5));
    this.content = box('content', root, Screen.W, Screen.H);
    onTap(root, () => this.skipTo?.(), { press: 0, sound: null });
  }

  override back(): boolean {
    void Flow.afterResult(this.d, false);
    return false;
  }

  override hide(): void {
    App.platform.hideBanner();
  }

  override show(arg?: unknown): void {
    App.platform.showBanner('bn_result');
    this.d = arg as Flow.WinData;
    this.content.destroyAllChildren();
    const d = this.d;
    const r = d.result;
    const c = this.content;
    const cfg = App.config.ui.win;
    const at0 = (k: string) => Number(cfg[k] ?? 0);
    const top = Screen.top;
    // 从下往上排：底部给 Banner 留位（docs/01 7.1），返回主页 → 下一关 → 翻倍 / 分享 → 奖励条 → 宝箱；横幅和星星贴顶
    const homeY = Screen.bottom + BANNER_H + 64;
    const nextY = homeY + 140;
    const btnY = nextY + 150;
    const rowY = btnY + 160;
    const ribbonY = top - 270;
    const chestY = (ribbonY - 100 + rowY + 85) / 2;
    const chestS = Math.min(260, ribbonY - 100 - (rowY + 85) - 10);

    // 横幅与星星
    const ribbon = plate(c, 'skin/j_ribbon', 700, 200, 'ribbon');
    at(ribbon, 0, ribbonY);
    const title = text(ribbon, tr('WIN_TITLE'), 88, { color: COLOR.yellow, outline: hex('#B4500A'), outlineWidth: 8 });
    at(title.node, 0, 14);
    const stars: Node[] = [];
    for (let i = 0; i < 3; i++) {
      const st = img(c, 'icon/star', i === 1 ? 150 : 120, i === 1 ? 150 : 120, 'star');
      at(st, (i - 1) * 170, top - 130 + (i === 1 ? 30 : 0));
      (st.getComponent(Sprite) as Sprite).grayscale = true;
      stars.push(st);
    }
    // 两条开心的鱼 + 宝箱
    const left = img(c, 'fish/c01', 210, 210, 'fishL');
    at(left, -240, chestY);
    const right = img(c, 'fish/c02', 190, 190, 'fishR');
    at(right, 240, chestY + 20);
    right.setScale(-1, 1, 1);
    fx.bob(left, 10, 1.8);
    fx.bob(right, 10, 2.1, 0.4);
    const rays = fx.rays(c, 420);
    at(rays, 0, chestY);
    opacity(rays).opacity = 0;
    const chestIcon = d.chest ? 'icon/chest' : 'icon/chest_open';
    const chest = img(c, chestIcon, chestS, chestS, 'chest');
    at(chest, 0, chestY);

    // 奖励一排：金币总数、技能、收藏卡、家园星星、首胜（docs/01 3.3：图标 + 数字，不写明细）
    const pill = slice(c, 'kit/panel_glass', 660, 170, 'rewards');
    at(pill, 0, rowY);
    opacity(pill).opacity = 235;
    const items: Node[] = [];
    // 金币一格：图标 + 左对齐的数字（数字跳动变长也不压到右边的格子）
    const coinCell = box('coins', pill, 270, 150);
    const coinIcon = img(coinCell, 'icon/coin', 96, 96, 'icon');
    at(coinIcon, -80, 0);
    const coinLabel = text(coinCell, '+0', 50, { align: 'left' });
    at(coinLabel.node, -24, 0);
    items.push(coinCell);
    const extras: Node[] = [];
    if (r.stars > 0) {
      const st = box('stars', pill, 130, 150);
      const ic = img(st, 'icon/star', 80, 80, 'icon');
      at(ic, 0, 18);
      at(text(st, `+${r.stars}`, 34).node, 0, -46);
      extras.push(st);
    }
    const chestPrize = d.chest;
    if (chestPrize && chestPrize.kind === 'skill' && chestPrize.skill) {
      extras.push(prizeCell(pill, { icon: `icon/skill_${chestPrize.skill}`, amount: '×1' }, 96));
    }
    if (chestPrize && chestPrize.kind === 'coins') {
      extras.push(prizeCell(pill, { icon: 'icon/gift', amount: `+${chestPrize.coins}` }, 96));
    }
    for (const card of d.cards) extras.push(prizeCell(pill, cardItem(card), 96));
    if (r.first_win) extras.push(prizeCell(pill, { icon: 'icon/heart_inf', amount: tr('UI_MINUTES', Math.round(r.unlimited / 60)) }, 96));
    const all = [coinCell, ...extras];
    const widths = all.map((_n, i) => (i === 0 ? 270 : 128));
    const total = widths.reduce((a, b) => a + b, 0);
    let x = -total / 2;
    all.forEach((n, i) => {
      at(n, x + widths[i] / 2, 0);
      x += widths[i];
    });
    for (const e of extras) e.active = false;
    if (!r.rewarded) {
      // 今天重玩的奖励领完了：整条只写一句话，居中、放得下
      coinCell.active = false;
      at(text(pill, tr('UI_REPLAY_NO_REWARD'), 34, { width: 600 }).node, 0, 0);
    }

    // 按钮
    const s = App.save.data;
    const eco = App.config.eco;
    let dbl: Btn | null = null;
    const bestCard = d.cards.reduce((m, cd) => Math.max(m, Cards.rank(eco, cd.rarity)), -1);
    const showShare = bestCard >= Cards.rank(eco, String(cfg.shareFromRarity ?? 'rare')) && Share.remaining(s, eco, 'card', today()) > 0;
    if (r.rewarded && r.coins > 0) {
      dbl = button(c, {
        color: 'yellow',
        w: showShare ? 320 : 480,
        h: 100,
        icon: 'kit/ic_video',
        label: tr('WIN_DOUBLE'),
        onTap: async () => {
          if (!dbl || !dbl.enabled) return;
          if (!(await watchAd('rv_double_coin'))) return;
          const extra = Settle.doubleCoins(s, eco, r);
          App.save.write();
          dbl.setEnabled(false);
          fx.countUp(coinLabel, r.coins, r.coins + extra, 0.5, (v) => `+${v}`);
          sfx('coins');
        },
      });
      at(dbl.node, showShare ? -170 : 0, btnY);
    }
    let share: Btn | null = null;
    if (showShare) {
      share = button(c, {
        color: 'blue',
        w: 300,
        h: 100,
        icon: 'kit/ic_share',
        label: tr('UI_SHARE_SHORT'),
        onTap: async () => {
          if (!share?.enabled) return;
          if (!(await App.platform.share({ kind: 'card' }))) return;
          Share.claim(s, eco, 'card', today(), now(), new Rng(Date.now() >>> 0));
          App.save.write();
          share.setEnabled(false);
          sfx('coins');
        },
      });
      at(share.node, dbl ? 180 : 0, btnY);
    }
    const next = button(c, { color: 'green', w: 540, h: 130, label: tr('UI_NEXT_LEVEL'), fontSize: 64, onTap: () => void Flow.afterResult(d, true) });
    at(next.node, 0, nextY);
    const home = button(c, { color: 'blue', w: 340, h: 90, label: tr('RETURN_HOME'), onTap: () => void Flow.afterResult(d, false) });
    at(home.node, 0, homeY);
    const buttons = [dbl?.node, share?.node, next.node, home.node].filter((n): n is Node => !!n);
    for (const b of buttons) b.active = false;

    // ---- 演出时间表
    const finalState = () => {
      this.skipTo = null;
      for (const n of [ribbon, ...stars, chest, pill, rays, ...buttons]) {
        Tween.stopAllByTarget(n);
        n.setScale(n === right ? -1 : 1, 1, 1);
      }
      at(ribbon, 0, ribbonY);
      stars.forEach((st) => ((st.getComponent(Sprite) as Sprite).grayscale = false));
      if (d.chest) setImg(chest, 'icon/chest_open', chestS, chestS);
      opacity(rays).opacity = 255;
      coinLabel.string = r.rewarded ? `+${r.coins}` : tr('UI_REPLAY_NO_REWARD');
      for (const e of extras) e.active = true;
      for (const b of buttons) b.active = true;
      Tween.stopAllByTarget(next.node);
      fx.breathe(next.node, 0.04, 1.2);
      if (d.cards.length) Flow.revealPending(d.cards.splice(0), () => {});
    };
    this.skipTo = finalState;
    // 横幅砸下
    at(ribbon, 0, top + 200);
    tween(ribbon).to(0.3, { position: new Vec3(0, ribbonY, 0) }, { easing: 'backOut' }).start();
    fx.confetti(c, 0, ribbonY, 50, 400);
    sfx('win');
    // 星星依次点亮
    stars.forEach((st, i) => {
      fx.delay(c, at0('starAt') + i * at0('starGap'), () => {
        if (!this.skipTo) return;
        (st.getComponent(Sprite) as Sprite).grayscale = false;
        fx.popIn(st, 0, 0.25);
        fx.sparkle(c, st.position.x, st.position.y, 8, 90, COLOR.yellow);
        sfx('star');
      });
    });
    // 金币滚动
    fx.popIn(pill, at0('coinsAt'), 0.25);
    if (r.rewarded) fx.countUp(coinLabel, 0, r.coins, at0('coinsRoll'), (v) => `+${v}`, at0('coinsAt'));
    // 宝箱晃动、弹开
    tween(chest)
      .delay(at0('chestAt'))
      .to(0.07, { angle: 8 })
      .to(0.1, { angle: -8 })
      .to(0.1, { angle: 6 })
      .to(0.08, { angle: 0 })
      .call(() => {
        if (!this.skipTo) return;
        if (d.chest) setImg(chest, 'icon/chest_open', chestS, chestS);
        tween(opacity(rays)).to(0.25, { opacity: 255 }).start();
        fx.sparkle(c, 0, chestY, 14, 200, COLOR.yellow, 40);
        sfx('chest');
        extras.forEach((e, i) => {
          e.active = true;
          fx.popIn(e, i * 0.08, 0.25);
        });
      })
      .start();
    // 按钮出现
    fx.delay(c, at0('buttonsAt'), () => {
      if (!this.skipTo) return;
      buttons.forEach((b, i) => {
        b.active = true;
        fx.popIn(b, i * 0.06, 0.25);
      });
      fx.delay(c, 0.4, () => fx.breathe(next.node, 0.04, 1.2));
      // 连击送的卡、宝箱开出的卡：翻面
      if (d.cards.length) Flow.revealPending(d.cards.splice(0), () => {});
      this.skipTo = null;
    });
  }
}

