// 家园「重建海湾」页签（定版图 05；docs/01 5.12；docs/ux/home_base.md）。
// 一页一个区域：区域名、星星 · 区域 N/6 · 金币信息条、带框的场景（每一步一个物件）、这一步的名字、
// 5 颗星进度 + 区域宝箱、大「建造」按钮（按钮上写星星和金币花费，不够的变红）。
// 建造：物件从小弹大 + 金光 + 星星飞溅，数字滚动；建完区域：宝箱晃动弹开 → 开奖 → 换下一区域。
import { Label, Node, Sprite, Tween, Vec3, tween } from 'cc';
import * as HomeBase from '../core/meta/homeBase';
import * as Tasks from '../core/meta/tasks';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import { now, today } from '../services/clock';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { Btn, COLOR, at, box, button, fmt, hex, img, lazyImg, opacity, pageTitle, setImg, sizeOf, slice, text } from '../ui/kit';
import { needCoins, prizeItems, rewardPopup } from '../ui/popups';
import { Screen } from '../ui/screen';
import { Page, TABBAR_H, ui } from '../ui/shell';

const RED = hex('#FF5A4E');

export class BasePage extends Page {
  readonly tab = 'base' as const;
  private root!: Node;
  private view: Node | null = null;
  private starsLabel!: Label;
  private coinsLabel!: Label;
  private btn!: Btn;
  private costStars!: Label;
  private costCoins!: Label;
  private objects: Node[] = [];
  private slots: Node[] = [];
  private chest!: Node;
  private ring: Node | null = null;
  private scene!: Node;
  private busy = false;

  build(root: Node): void {
    this.root = root;
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(root, 'bg/home', (bgH * 1024) / 1536, bgH);
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
    this.view?.destroy();
    const v = box('view', this.root, Screen.W, Screen.H);
    this.view = v;
    const areas = HomeBase.areas(eco);
    const areaIdx = Math.min(HomeBase.currentArea(s, eco), areas.length - 1);
    const area = areas[areaIdx];
    const done = HomeBase.allDone(s, eco);
    const built = done ? area.steps.length : HomeBase.built(s, areaIdx);
    const open = HomeBase.isOpen(eco, areaIdx, s.level);
    const top = Screen.top;
    const bottom = Screen.bottom + TABBAR_H;

    // 区域名
    // 区域名：和别的页一样的标题牌（原来是一行 72 号的裸字，顶着下面的信息条）
    at(pageTitle(v, tr(`BASE_AREA_${area.id.toUpperCase()}`), 72), 0, top - 62);
    // 信息条：星星 | 区域 N/6 | 金币
    const bar = slice(v, 'kit/capsule', 690, 84, 'info');
    at(bar, 0, top - 160);
    const st = img(bar, 'icon/star', 66, 66, 'star');
    at(st, -300, 2);
    this.starsLabel = text(bar, String(HomeBase.stars(s)), 40, { align: 'left' });
    at(this.starsLabel.node, -255, 0);
    at(img(bar, 'kit/tab_divider', 4, 56, 'd1'), -115, 0);
    at(text(bar, tr('BASE_PROGRESS', areaIdx + 1, areas.length), 36).node, 0, 0);
    at(img(bar, 'kit/tab_divider', 4, 56, 'd2'), 115, 0);
    const co = img(bar, 'icon/coin', 66, 66, 'coin');
    at(co, 150, 2);
    this.coinsLabel = text(bar, fmt(s.coins), 40, { align: 'left' });
    at(this.coinsLabel.node, 195, 0);

    // 场景（带框）：高度按屏幕剩下的空间算
    const btnH = 160;
    const below = 100 + 60 + 90 + btnH + 40;
    const size = Math.max(420, Math.min(690, top - 215 - (bottom + below)));
    const sceneY = top - 215 - size / 2;
    const frame = slice(v, 'kit/panel_blue', size + 36, size + 36, 'frame');
    at(frame, 0, sceneY);
    this.scene = box('scene', frame, size, size);
    lazyImg(this.scene, `base/${area.id}_bg`, size, size);
    const steps = App.config.ui.basePage.steps[area.id] ?? [];
    this.objects = [];
    steps.forEach(([fx0, fy0, s0], i) => {
      const k = size / App.config.ui.basePage.scene;
      const o = lazyImg(this.scene, `base/${area.id}_${i + 1}`, s0 * k, s0 * k);
      at(o, (fx0 - 0.5) * size, (0.5 - fy0) * size);
      if (i >= built) {
        const sp = o.getComponent(Sprite) as Sprite;
        // 还没建的：浅色半透明的「虚影」，不用深色剪影
        sp.grayscale = true;
        sp.color = hex('#DCEBFF');
        opacity(o).opacity = 150;
      }
      this.objects.push(o);
    });
    this.ring = null;
    if (!done && open && built < steps.length) {
      const o = this.objects[built];
      // 下一步的位置：一圈呼吸的金光垫在物件下面
      const rs = sizeOf(o).w * 1.3;
      const r = box('ring', this.scene, rs, rs);
      at(r, o.position.x, o.position.y);
      const glow = img(r, 'kit/fx_glow', rs * 1.2, rs * 1.2, 'glow');
      (glow.getComponent(Sprite) as Sprite).color = COLOR.yellow;
      r.setSiblingIndex(o.getSiblingIndex());
      const ringTop = img(this.scene, 'kit/hint_ring', rs, rs, 'hint');
      at(ringTop, o.position.x, o.position.y);
      fx.breathe(r, 0.12, 1.2);
      fx.breathe(ringTop, 0.1, 1.2);
      this.ring = ringTop;
    }
    if (!open) {
      const dim = slice(this.scene, 'kit/round_white', size, size, 'dim');
      ((dim.getChildByName('skin') as Node).getComponent(Sprite) as Sprite).color = hex('#0A1E50');
      opacity(dim).opacity = 160;
      const lk = img(this.scene, 'icon/lock', 160, 160, 'lock');
      at(lk, 0, 40);
      at(text(this.scene, tr('H_UNLOCKS_AT', HomeBase.unlockLevel(eco, areaIdx)), 48).node, 0, -90);
    }

    // 这一步的名字 + N/5
    let y = sceneY - size / 2 - 60;
    const stepName = done ? tr('BASE_ALL_DONE') : tr(`BASE_STEP_${area.id.toUpperCase()}_${Math.min(built + 1, area.steps.length)}`);
    at(text(v, stepName, 50).node, 0, y);
    y -= 60;
    const line = img(v, 'kit/tab_divider', 4, 520, 'line');
    line.angle = 90;
    at(line, 0, y);
    opacity(line).opacity = 160;
    const cnt = slice(v, 'kit/capsule', 150, 48, 'cnt');
    at(cnt, 0, y);
    text(cnt, `${built}/${area.steps.length}`, 30);
    // 5 颗星 + 区域宝箱
    y -= 80;
    this.slots = [];
    const n = area.steps.length;
    const gap = 108;
    const x0 = -((n + 1) * gap) / 2 + gap / 2;
    for (let i = 0; i < n; i++) {
      const sl = img(v, 'icon/star', 84, 84, `slot${i}`);
      at(sl, x0 + i * gap, y);
      if (i >= built) {
        const sp = sl.getComponent(Sprite) as Sprite;
        sp.grayscale = true;
        sp.color = hex('#BFD6F3');
        opacity(sl).opacity = 170;
      }
      this.slots.push(sl);
    }
    this.chest = img(v, done || HomeBase.isComplete(s, eco, areaIdx) ? 'icon/chest_open' : 'icon/chest', 120, 120, 'chest');
    at(this.chest, x0 + n * gap + 10, y + 6);

    // 建造按钮：两行（建造 / ★2 ●100）
    const btnY = Math.max(y - 70 - btnH / 2, bottom + 32 + btnH / 2);
    const cost = HomeBase.nextCost(s, eco);
    this.btn = button(v, { color: 'green', w: 560, h: btnH, onTap: () => this.tapBuild() });
    at(this.btn.node, 0, btnY);
    const l1 = text(this.btn.node, done ? tr('BASE_ALL_DONE') : open ? tr('BASE_BUILD') : tr('H_UNLOCKS_AT', HomeBase.unlockLevel(eco, areaIdx)), done || !open ? 46 : 64, {
      outline: hex('#1B6B10'),
    });
    at(l1.node, 0, cost && open ? 26 : 4);
    const row = box('cost', this.btn.node, 400, 50);
    at(row, 0, -36);
    const cs = img(row, 'icon/star', 52, 52, 'st');
    at(cs, -120, 0);
    this.costStars = text(row, String(cost?.stars ?? 0), 40, { align: 'left', outline: hex('#1B6B10') });
    at(this.costStars.node, -88, 0);
    const cc = img(row, 'icon/coin', 52, 52, 'co');
    at(cc, 20, 0);
    this.costCoins = text(row, fmt(cost?.coins ?? 0), 40, { align: 'left', outline: hex('#1B6B10') });
    at(this.costCoins.node, 52, 0);
    row.active = Boolean(cost) && open && !done;
    const block = HomeBase.check(s, eco);
    if (cost) {
      this.costStars.color = HomeBase.stars(s) < cost.stars ? RED : COLOR.white;
      this.costCoins.color = s.coins < cost.coins ? RED : COLOR.white;
      this.starsLabel.color = HomeBase.stars(s) < cost.stars ? RED : COLOR.white;
      this.coinsLabel.color = s.coins < cost.coins ? RED : COLOR.white;
    }
    if (block === 'done' || block === 'locked') this.btn.setEnabled(false);
    else if (block === '') fx.breathe(this.btn.node, 0.03, 1.3);
    if (enter) fx.popIn(frame, 0, 0.25);
  }

  private tapBuild(): void {
    if (this.busy) return;
    const s = App.save.data;
    const eco = App.config.eco;
    const block = HomeBase.check(s, eco);
    if (block === 'done' || block === 'locked') return;
    if (block === 'stars') {
      fx.shake(this.starsLabel.node, 8);
      ui.toast(tr('BASE_NEED_STARS'));
      return;
    }
    if (block === 'coins') {
      const cost = HomeBase.nextCost(s, eco);
      needCoins((cost?.coins ?? 0) - s.coins, () => ui.refresh());
      return;
    }
    const starsBefore = HomeBase.stars(s);
    const coinsBefore = s.coins;
    const res = HomeBase.build(s, eco, now());
    if (!res.ok) return;
    Tasks.add(s, eco, today(), 'build');
    App.save.write();
    this.busy = true;
    sfx('unlock');
    // 物件亮起：从小弹大 + 金光 + 星星飞溅
    const o = this.objects[res.step];
    if (this.ring) this.ring.destroy();
    this.scene.getChildByName('ring')?.destroy();
    if (o) {
      const sp = o.getComponent(Sprite) as Sprite;
      sp.grayscale = false;
      sp.color = COLOR.white;
      opacity(o).opacity = 255;
      Tween.stopAllByTarget(o);
      o.setScale(0.2, 0.2, 1);
      tween(o).to(0.3, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' }).to(0.12, { scale: new Vec3(1, 1, 1) }).start();
      fx.sparkle(this.scene, o.position.x, o.position.y, 14, sizeOf(o).w, COLOR.yellow, 40);
      fx.ring(this.scene, o.position.x, o.position.y, 40, sizeOf(o).w * 1.4, COLOR.yellow);
    }
    const slot = this.slots[res.step];
    if (slot) {
      const sp = slot.getComponent(Sprite) as Sprite;
      sp.grayscale = false;
      sp.color = COLOR.white;
      fx.popIn(slot, 0.15, 0.25);
    }
    fx.countUp(this.starsLabel, starsBefore, HomeBase.stars(s), 0.4);
    fx.countUp(this.coinsLabel, coinsBefore, s.coins, 0.4);
    const cfg = App.config.ui.basePage;
    if (!res.completed) {
      fx.delay(this.root, cfg.buildFx + 0.1, () => {
        this.busy = false;
        ui.refresh();
      });
      return;
    }
    // 区域建完：宝箱晃动、弹开，开奖；收下后换下一区域
    fx.delay(this.root, cfg.chestDelay, () => {
      const c = this.chest;
      tween(c)
        .to(0.12, { scale: new Vec3(1.3, 1.3, 1) })
        .to(0.07, { angle: 10 })
        .to(0.1, { angle: -10 })
        .to(0.1, { angle: 14 })
        .to(0.1, { angle: -14 })
        .to(0.08, { angle: 0 })
        .call(() => {
          setImg(c, 'icon/chest_open', 120, 120);
          fx.confetti(this.root, c.position.x, c.position.y, 40, 300);
          fx.sparkle(this.root, c.position.x, c.position.y, 16, 220, COLOR.yellow, 44);
          sfx('chest');
          fx.delay(this.root, 0.5, () => {
            rewardPopup(prizeItems(res.prizes), {
              title: tr('BASE_AREA_DONE'),
              onClose: () => {
                this.busy = false;
                this.render(true);
                ui.refresh();
              },
            });
          });
        })
        .start();
    });
  }
}
