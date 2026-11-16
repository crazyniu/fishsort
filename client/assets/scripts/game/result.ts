// 过关结算页（定版图 13）。横幅砸下 → 三颗星依次点亮 → 金币数字滚动 → 宝箱晃动、弹开亮出奖品 → 按钮出现、
// 「下一关」呼吸；点任意处跳到最终状态；全程 ≤ 3 秒（docs/09 第 6 节）。三颗星是过关演出，不是评级。
import { Node, Sprite, Tween, UITransform, Vec3, tween } from 'cc';
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
    const starPos: [number, number][] = [0, 1, 2].map((i) => [(i - 1) * 170, top - 130 + (i === 1 ? 30 : 0)]);
    for (let i = 0; i < 3; i++) {
      const st = img(c, 'icon/star', i === 1 ? 150 : 120, i === 1 ? 150 : 120, 'star');
      at(st, starPos[i][0], starPos[i][1]);
      stars.push(st);
    }
    // 两条开心的鱼 + 宝箱
    const left = img(c, 'fish/c01', 210, 210, 'fishL');
    at(left, -240, chestY);
    const right = img(c, 'fish/c02', 190, 190, 'fishR');
    at(right, 240, chestY + 20);
    right.setScale(-1, 1, 1);
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
    const btnHome = buttons.map((b) => b.position.y);

    // ---- 演出时间表（docs/01 3.3）：横幅砸下 → 三颗星从宝箱飞上去依次落位 → 宝箱掉下、越晃越大、弹开 → 金币飞进奖励条、数字滚动 →
    // 按钮从下往上升起，「下一关」呼吸。全程约 2 秒，点任意处跳到最终状态
    const finalState = () => {
      this.skipTo = null;
      for (const n of [ribbon, ...stars, chest, pill, rays, left, right, ...buttons, ...extras]) {
        Tween.stopAllByTarget(n);
        Tween.stopAllByTarget(opacity(n));
      }
      ribbon.setScale(1, 1, 1);
      opacity(ribbon).opacity = 255;
      at(ribbon, 0, ribbonY);
      stars.forEach((st, i) => {
        st.setScale(1, 1, 1);
        st.angle = 0;
        at(st, starPos[i][0], starPos[i][1]);
        opacity(st).opacity = 255;
      });
      at(chest, 0, chestY);
      chest.setScale(1, 1, 1);
      chest.angle = 0;
      if (d.chest) setImg(chest, 'icon/chest_open', chestS, chestS);
      opacity(rays).opacity = 255;
      rays.setScale(1, 1, 1);
      tween(rays).repeatForever(tween(rays).by(6, { angle: 360 })).start();
      pill.setScale(1, 1, 1);
      opacity(pill).opacity = 235;
      at(pill, 0, rowY);
      coinLabel.string = r.rewarded ? `+${r.coins}` : tr('UI_REPLAY_NO_REWARD');
      for (const e of extras) {
        e.active = true;
        e.setScale(1, 1, 1);
      }
      buttons.forEach((b, i) => {
        b.active = true;
        b.setScale(1, 1, 1);
        at(b, b.position.x, btnHome[i]);
        opacity(b).opacity = 255;
      });
      at(left, -240, chestY);
      at(right, 240, chestY + 20);
      left.setScale(1, 1, 1);
      right.setScale(-1, 1, 1);
      fx.bob(left, 10, 1.8);
      fx.bob(right, 10, 2.1, 0.4);
      fx.breathe(next.node, 0.04, 1.2);
      if (d.cards.length) Flow.revealPending(d.cards.splice(0), () => {});
    };
    this.skipTo = finalState;
    const live = () => this.skipTo !== null;

    // 1. 横幅：从大到小砸下来，落地一震
    opacity(ribbon).opacity = 0;
    ribbon.setScale(1.9, 1.9, 1);
    tween(opacity(ribbon)).to(0.12, { opacity: 255 }).start();
    tween(ribbon)
      .to(0.24, { scale: new Vec3(0.94, 0.94, 1) }, { easing: 'quadIn' })
      .call(() => {
        if (!live()) return;
        fx.shake(c, 10);
        fx.ring(c, 0, ribbonY, 120, 620, COLOR.yellow);
        fx.confetti(c, -Screen.W / 2 + 40, ribbonY - 40, 30, 420);
        fx.confetti(c, Screen.W / 2 - 40, ribbonY - 40, 30, 420);
      })
      .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
    sfx('win');

    // 2. 宝箱从上面掉下来，落地压扁回弹
    at(chest, 0, chestY + 420);
    opacity(chest).opacity = 0;
    tween(opacity(chest)).delay(0.1).to(0.1, { opacity: 255 }).start();
    tween(chest)
      .delay(0.1)
      .to(0.3, { position: new Vec3(0, chestY, 0) }, { easing: 'quadIn' })
      .to(0.08, { scale: new Vec3(1.15, 0.85, 1) })
      .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();

    // 3. 三颗星：灰色星位先在，金星从宝箱处转着飞上去依次落位
    stars.forEach((st, i) => {
      const [sx, sy] = starPos[i];
      const slot = img(c, 'icon/star', st.getComponent(UITransform)?.width ?? 120, st.getComponent(UITransform)?.height ?? 120, 'slot');
      at(slot, sx, sy);
      (slot.getComponent(Sprite) as Sprite).grayscale = true;
      opacity(slot).opacity = 110;
      slot.setSiblingIndex(st.getSiblingIndex());
      st.active = true;
      opacity(st).opacity = 0;
      fx.delay(c, at0('starAt') + i * at0('starGap'), () => {
        if (!live()) return;
        at(st, 0, chestY);
        st.setScale(0.3, 0.3, 1);
        st.angle = -200;
        opacity(st).opacity = 255;
        tween(st)
          .to(0.32, { position: new Vec3(sx, sy, 0), scale: new Vec3(1.3, 1.3, 1), angle: 0 }, { easing: 'quadOut' })
          .call(() => {
            if (!live()) return;
            fx.ring(c, sx, sy, 60, 260, COLOR.yellow);
            fx.sparkle(c, sx, sy, 10, 120, COLOR.yellow, 36);
            sfx('star');
          })
          .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
          .start();
      });
    });

    // 4. 宝箱越晃越大，弹开：白光一闪、光芒放大、火花、两条鱼跳一下
    const shakeAt = at0('chestAt');
    const openAt = shakeAt + at0('chestShake');
    if (d.chest) {
      tween(chest)
        .delay(shakeAt)
        .to(0.06, { angle: 5, scale: new Vec3(1.03, 1.03, 1) })
        .to(0.07, { angle: -7, scale: new Vec3(1.06, 1.06, 1) })
        .to(0.07, { angle: 9, scale: new Vec3(1.09, 1.09, 1) })
        .to(0.08, { angle: -11, scale: new Vec3(1.12, 1.12, 1) })
        .to(0.06, { angle: 0, scale: new Vec3(1.16, 1.16, 1) })
        .call(() => {
          if (!live()) return;
          setImg(chest, 'icon/chest_open', chestS, chestS);
          fx.flash(c, Screen.W, Screen.H, 150);
          fx.sparkle(c, 0, chestY, 18, 240, COLOR.yellow, 44);
          fx.ring(c, 0, chestY, 100, 480, COLOR.yellow);
          sfx('chest');
          extras.forEach((e, i) => {
            e.active = true;
            fx.popIn(e, 0.25 + i * 0.08, 0.25);
          });
        })
        .to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
        .start();
    } else {
      fx.delay(c, openAt, () => {
        if (!live()) return;
        extras.forEach((e, i) => {
          e.active = true;
          fx.popIn(e, i * 0.08, 0.25);
        });
      });
    }
    opacity(rays).opacity = 0;
    rays.setScale(0.4, 0.4, 1);
    tween(opacity(rays)).delay(openAt).to(0.25, { opacity: 255 }).start();
    tween(rays).delay(openAt).to(0.35, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    for (const [f, sx] of [[left, 1], [right, -1]] as const) {
      fx.delay(c, openAt, () => {
        if (!live()) return;
        const p = f.position.clone();
        tween(f)
          .to(0.14, { position: new Vec3(p.x, p.y + 50, 0), scale: new Vec3(sx * 0.9, 1.12, 1) }, { easing: 'quadOut' })
          .to(0.18, { position: p, scale: new Vec3(sx * 1.1, 0.9, 1) }, { easing: 'quadIn' })
          .to(0.12, { scale: new Vec3(sx, 1, 1) })
          .call(() => fx.bob(f, 10, sx > 0 ? 1.8 : 2.1))
          .start();
      });
    }

    // 5. 奖励条从下面滑上来；金币从星星那里撒下来飞进金币图标，数字滚动，滚完弹一下
    const pillY0 = rowY;
    at(pill, 0, pillY0 - 60);
    opacity(pill).opacity = 0;
    tween(pill).delay(at0('coinsAt')).to(0.25, { position: new Vec3(0, pillY0, 0) }, { easing: 'backOut' }).start();
    tween(opacity(pill)).delay(at0('coinsAt')).to(0.2, { opacity: 235 }).start();
    if (r.rewarded) {
      const roll = at0('coinsRoll');
      const coinAt = at0('coinsAt') + 0.2;
      fx.delay(c, coinAt, () => {
        if (!live()) return;
        const ci = coinIcon.worldPosition;
        const lp = (c.getComponent(UITransform) as UITransform).convertToNodeSpaceAR(ci.clone());
        for (let i = 0; i < 10; i++) {
          const cn = img(c, 'icon/coin', 54, 54, 'flyCoin');
          at(cn, starPos[1][0] + (Math.random() - 0.5) * 160, starPos[1][1] - 40 + (Math.random() - 0.5) * 60);
          fx.flyArc(cn, lp.x, lp.y, 0.45 + i * 0.03, 60, 'quadIn', () => {
            cn.destroy();
            if (i % 3 === 0) sfx('coin');
            if (!coinIcon.isValid) return;
            Tween.stopAllByTarget(coinIcon);
            coinIcon.setScale(1.25, 1.25, 1);
            tween(coinIcon).to(0.1, { scale: new Vec3(1, 1, 1) }).start();
          });
        }
      });
      fx.countUp(coinLabel, 0, r.coins, roll, (v) => `+${v}`, coinAt + 0.3);
      fx.delay(c, coinAt + 0.3 + roll, () => {
        if (!live()) return;
        Tween.stopAllByTarget(coinLabel.node);
        coinLabel.node.setScale(1.35, 1.35, 1);
        tween(coinLabel.node).to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
      });
    }

    // 6. 按钮从下往上依次升起
    fx.delay(c, at0('buttonsAt'), () => {
      if (!live()) return;
      buttons.forEach((b, i) => {
        b.active = true;
        at(b, b.position.x, btnHome[i] - 90);
        opacity(b).opacity = 0;
        tween(b)
          .delay(i * 0.07)
          .to(0.28, { position: new Vec3(b.position.x, btnHome[i], 0) }, { easing: 'backOut' })
          .start();
        tween(opacity(b)).delay(i * 0.07).to(0.18, { opacity: 255 }).start();
      });
      fx.delay(c, 0.5, () => live() && fx.breathe(next.node, 0.04, 1.2));
    });
    // 收尾：连击送的卡、宝箱开出的卡翻面；之后点击不再跳
    fx.delay(c, at0('buttonsAt') + 0.45, () => {
      if (!live()) return;
      this.skipTo = null;
      if (d.cards.length) Flow.revealPending(d.cards.splice(0), () => {});
    });
  }
}
