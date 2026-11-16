// 宝箱抽奖页（docs/01 5.5；没有定版图，风格按 09 每日挑战、19 开奖，docs/09 第 5 节）。主页子页面，左上返回。
// 一只大宝箱 + 剩余次数 + 主按钮（有次数「开箱」，没次数「1000 金币开箱」），下面一排：十连、看广告 +1、分享 +1。
// 不展示概率。开箱：宝箱左右晃动越晃越大 → 盖子弹开冒星光 → 收藏卡先翻面 → 开奖弹窗。
// 十连：奖品一个个飞进格子；稀有以上的卡再全屏翻一次。
import { Node, Vec3, tween } from 'cc';
import * as Cards from '../core/meta/cards';
import type { CardResult } from '../core/meta/save';
import * as Share from '../core/meta/share';
import * as Wheel from '../core/meta/wheel';
import { Rng } from '../core/rng/rng';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import { now, today } from '../services/clock';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { COLOR, at, box, button, capsule, iconButton, img, lazyImg, setImg, slice, text } from '../ui/kit';
import { PrizeItem, cardItem, needCoins, revealCards, rewardPopup, skillIcon, skillName, watchAd } from '../ui/popups';
import { Screen } from '../ui/screen';
import { Page, ui } from '../ui/shell';

/** 一次抽奖结果 → 奖品格 */
export function spinItem(r: Wheel.SpinResult): PrizeItem {
  if (r.card) return cardItem(r.card);
  if (r.kind === 'coins') return { icon: 'icon/coin', amount: String(r.coins), name: tr('PRIZE_COINS') };
  if (r.kind === 'skill') return { icon: skillIcon(r.skill || 'shuffle'), amount: '×1', name: skillName(r.skill || 'shuffle') };
  if (r.kind === 'unlimited') return { icon: 'icon/heart_inf', amount: tr('UI_MINUTES', Math.round(r.unlimited / 60)) };
  return { icon: 'icon/gift', amount: '' };
}

export class WheelPage extends Page {
  readonly tab = null;
  private root!: Node;
  private view: Node | null = null;
  private chest!: Node;
  private busy = false;

  build(root: Node): void {
    this.root = root;
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(root, 'bg/sea_crystal', (bgH * 1024) / 1536, bgH);
  }

  override show(): void {
    this.busy = false;
    this.render(true);
  }

  override refresh(): void {
    if (!this.busy) this.render(false);
  }

  private render(enter: boolean): void {
    const s = App.save.data;
    const eco = App.config.eco;
    const day = today();
    const left = Wheel.spinsLeft(s, eco, day);
    this.view?.destroy();
    const v = box('view', this.root, Screen.W, Screen.H);
    this.view = v;
    const top = Screen.top;
    const back = iconButton(v, 'kit/round_blue', 'kit/ic_back', 96, () => ui.back());
    at(back, -Screen.W / 2 + 70, top - 80);
    const title = slice(v, 'kit/title_page', 340, 104, 'title');
    at(title, 20, top - 80);
    at(text(title, tr('H_FEAT_WHEEL'), 60).node, 0, 4);
    const coins = capsule(v, 230, 60, 'icon/coin', String(s.coins), 30);
    at(coins.node, Screen.W / 2 - 135, top - 180);

    // 大宝箱 + 光芒
    const mid = (top - 180 + Screen.bottom + 470) / 2;
    const rays = fx.rays(v, 640);
    at(rays, 0, mid);
    this.chest = img(v, 'icon/chest', 420, 420, 'chest');
    at(this.chest, 0, mid);
    if (left > 0) fx.wiggle(this.chest, 5, 2.2);
    else fx.bob(this.chest, 8, 2.6);

    // 剩余次数
    const cnt = slice(v, 'kit/title_plate', 340, 72, 'left');
    at(cnt, 0, mid - 270);
    at(text(cnt, tr('H_SPINS_LEFT', left), 36).node, 0, 3);

    // 主按钮
    const btnY = Screen.bottom + 330;
    const main =
      left > 0
        ? button(v, { color: 'green', w: 520, h: 140, label: tr('H_SPIN'), fontSize: 64, onTap: () => this.open('spin') })
        : button(v, { color: 'green', w: 520, h: 140, icon: 'icon/coin', iconSize: 76, label: String(eco.wheel.coinCost), fontSize: 60, onTap: () => this.open('coins') });
    at(main.node, 0, btnY);
    fx.breathe(main.node, 0.03, 1.3);

    // 下一排：十连 · 看广告 +1 · 分享 +1
    const y2 = btnY - 150;
    const ten = button(v, { color: 'purple', w: 220, h: 104, label: tr('H_TEN_PULL'), fontSize: 34, onTap: () => this.ten() });
    at(ten.node, -235, y2);
    const tenCost = text(ten.node, `${eco.wheel.tenCost}`, 24, { color: COLOR.yellow });
    at(tenCost.node, 0, -66);
    const adLeft = Wheel.adLeft(s, eco, day);
    const ad = button(v, {
      color: 'yellow',
      w: 220,
      h: 104,
      icon: 'kit/ic_video',
      label: '+1',
      fontSize: 40,
      onTap: async () => {
        if (Wheel.adLeft(App.save.data, eco, today()) <= 0) return;
        if (!(await watchAd('rv_wheel'))) return;
        Wheel.claimAd(App.save.data, eco, today());
        App.save.write();
        sfx('coin');
        ui.refresh();
      },
    });
    at(ad.node, 0, y2);
    ad.setEnabled(adLeft > 0 && App.platform.adsAvailable());
    at(text(ad.node, `${adLeft}/${eco.wheel.adPerDay}`, 24).node, 0, -66);
    if (App.platform.hasCapability('share')) {
      const shareLeft = Share.remaining(s, eco, 'wheel', day);
      const sh = button(v, {
        color: 'blue',
        w: 220,
        h: 104,
        icon: 'kit/ic_share',
        label: '+1',
        fontSize: 40,
        onTap: async () => {
          if (Share.remaining(App.save.data, eco, 'wheel', today()) <= 0) return;
          if (!(await App.platform.share({ kind: 'wheel' }))) return;
          Share.claim(App.save.data, eco, 'wheel', today(), now(), new Rng(Date.now() >>> 0));
          App.save.write();
          sfx('coin');
          ui.refresh();
        },
      });
      at(sh.node, 235, y2);
      sh.setEnabled(shareLeft > 0);
    }
    if (enter) fx.popIn(this.chest, 0, 0.3);
  }

  /** 开一个：先晃宝箱，再出结果 */
  private open(pay: 'spin' | 'coins'): void {
    if (this.busy) return;
    const s = App.save.data;
    const eco = App.config.eco;
    if (pay === 'coins' && s.coins < eco.wheel.coinCost) {
      needCoins(eco.wheel.coinCost - s.coins, () => ui.refresh());
      return;
    }
    const r = Wheel.spin(s, eco, App.config.species, new Rng(Date.now() >>> 0), today(), now(), pay);
    if (!r) return;
    App.save.write();
    this.busy = true;
    this.shakeOpen(() => {
      const show = () =>
        rewardPopup([spinItem(r)], {
          onClose: () => {
            this.busy = false;
            ui.refresh();
          },
        });
      if (r.card) revealCards([r.card], show);
      else show();
    });
  }

  private ten(): void {
    if (this.busy) return;
    const s = App.save.data;
    const eco = App.config.eco;
    if (s.coins < eco.wheel.tenCost) {
      needCoins(eco.wheel.tenCost - s.coins, () => ui.refresh());
      return;
    }
    const res = Wheel.tenPull(s, eco, App.config.species, new Rng(Date.now() >>> 0), today(), now());
    if (!res) return;
    App.save.write();
    this.busy = true;
    this.shakeOpen(() => {
      const items = res.results.map(spinItem);
      rewardPopup(items, {
        title: tr('TEN_REWARD'),
        onClose: () => {
          // 稀有以上的卡全屏再翻一次
          const good: CardResult[] = res.results
            .map((r) => r.card)
            .filter((c): c is CardResult => !!c && Cards.rank(eco, c.rarity) >= Cards.rank(eco, 'rare'));
          revealCards(good, () => {
            this.busy = false;
            ui.refresh();
          });
        },
      });
    });
  }

  /** 宝箱左右晃动越晃越大 → 盖子弹开、冒星光 */
  private shakeOpen(done: () => void): void {
    const c = this.chest;
    sfx('swell');
    const t = tween(c);
    const amps = [4, 6, 9, 12, 15];
    amps.forEach((a, i) => {
      const k = 1 + i * 0.04;
      t.to(0.07, { angle: a, scale: new Vec3(k, k, 1) }).to(0.07, { angle: -a });
    });
    t.to(0.06, { angle: 0, scale: new Vec3(1.25, 1.25, 1) })
      .call(() => {
        setImg(c, 'icon/chest_open', 420, 420);
        fx.flash(this.root, Screen.W, Screen.H, 160);
        fx.sparkle(this.root, c.position.x, c.position.y + 60, 20, 280, COLOR.yellow, 48);
        fx.confetti(this.root, c.position.x, c.position.y, 40, 360);
        sfx('chest');
      })
      .to(0.15, { scale: new Vec3(1, 1, 1) })
      .delay(0.35)
      .call(done)
      .start();
  }
}
