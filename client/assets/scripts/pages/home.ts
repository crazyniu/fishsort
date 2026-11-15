// 主页（定版图 01）。四角入口：左上签到、右上抽奖、左下选关、右下每日挑战（docs/09 第 4 节）。
// 中间鱼群常驻游动；气泡往上冒；「开始」呼吸；有红点的入口轻晃；进场依次弹出（≤ 0.8 秒）。
import { Node, Sprite, Tween, Vec3, tween } from 'cc';
import * as DailyChallenge from '../core/meta/dailyChallenge';
import * as Features from '../core/meta/features';
import * as LevelCurve from '../core/gen/levelCurve';
import * as Meta from '../core/meta/meta';
import * as SignIn from '../core/meta/signIn';
import * as Wheel from '../core/meta/wheel';
import { App } from '../services/app';
import { today } from '../services/clock';
import * as Flow from '../game/flow';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { Btn, at, box, button, img, lazyImg, onTap, opacity, redDot, slice, text } from '../ui/kit';
import { openPopup } from '../ui/popup';
import { Screen } from '../ui/screen';
import { Page, TABBAR_H, enterStagger, ui } from '../ui/shell';
import { signInPopup } from './signin';

interface Entry {
  node: Node;
  icon: Node;
  lock: Node;
  dot: Node;
  label: ReturnType<typeof text>;
  feature: string;
}

const FEATURE_LABEL: Record<string, string> = {
  signin: 'H_FEAT_SIGNIN',
  wheel: 'H_FEAT_WHEEL',
  levelSelect: 'H_FEAT_LEVELS',
  daily: 'UI_TAB_DAILY',
  homeBase: 'UI_TAB_BASE',
  album: 'H_FEAT_COLLECTION',
  rank: 'H_FEAT_RANK',
};

export class HomePage extends Page {
  readonly tab = 'home' as const;
  private entries = new Map<string, Entry>();
  private start!: Btn;
  private levelPill!: Node;
  private levelLabel!: ReturnType<typeof text>;
  private tag!: Node;
  private school: Node[] = [];
  private bubbles!: Node;

  build(root: Node): void {
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(root, 'bg/home', (bgH * 1024) / 1536, bgH);
    this.bubbles = box('bubbles', root, Screen.W, Screen.H);
    // 鱼群（中间，越近越大）
    const midY = (Screen.top - 260 + Screen.bottom + TABBAR_H + 300) / 2;
    for (const [id, x, y, s] of App.config.ui.homeDeco.school) {
      const f = img(root, `fish/${id}`, s, s, `fish_${id}`);
      at(f, x, midY + y);
      if (x > 0) f.setScale(-1, 1, 1);
      this.school.push(f);
    }
    // 四角入口
    const top = Screen.top - 210;
    const low = Screen.bottom + TABBAR_H + 330;
    this.entry(root, 'signin', 'icon/entry_signin', -Screen.W / 2 + 112, top, () => signInPopup(() => ui.refresh()));
    this.entry(root, 'wheel', 'icon/entry_wheel', Screen.W / 2 - 112, top, () => ui.go('wheel'));
    this.entry(root, 'levelSelect', 'icon/entry_levels', -Screen.W / 2 + 112, low, () => ui.go('levels'));
    this.entry(root, 'daily', 'icon/entry_daily', Screen.W / 2 - 112, low, () => ui.go('daily'));
    // 关卡号 + 开始
    const btnY = Screen.bottom + TABBAR_H + 150;
    this.levelPill = slice(root, 'kit/title_plate', 250, 66, 'levelPill');
    at(this.levelPill, 0, btnY + 112);
    this.levelLabel = text(this.levelPill, '', 38);
    at(this.levelLabel.node, 0, 4);
    this.start = button(root, { color: 'green', w: 560, h: 164, label: tr('UI_PLAY'), fontSize: 100, onTap: () => Flow.startLevel(App.save.data.level) });
    at(this.start.node, 0, btnY);
    this.tag = slice(this.start.node, 'kit/btn_purple', 120, 56, 'tag');
    at(this.tag, 220, 64);
    text(this.tag, tr('UI_CHALLENGE_TAG'), 28);
    this.tag.angle = 8;
  }

  private entry(root: Node, feature: string, icon: string, x: number, y: number, open: () => void): void {
    const n = box(feature, root, 200, 220);
    at(n, x, y);
    const ic = img(n, icon, 176, 176, 'icon');
    at(ic, 0, 34);
    const pill = slice(n, 'kit/title_page', 184, 70, 'pill');
    at(pill, 0, -66);
    const label = text(pill, tr(FEATURE_LABEL[feature]), 36);
    at(label.node, 0, 4);
    const lock = img(n, 'kit/ic_lock', 56, 56, 'lock');
    at(lock, 50, 0);
    const dot = redDot(n, 62, 92, 34);
    onTap(n, () => {
      const s = App.save.data;
      if (!Features.isUnlocked(App.config.eco, feature, s.level)) {
        // 未开放：点进去是锁页（docs/01 5.3）
        ui.go('lock', { feature });
        return;
      }
      open();
    });
    this.entries.set(feature, { node: n, icon: ic, lock, dot, label, feature });
  }

  override show(arg?: unknown): void {
    this.refresh();
    const nodes = Array.from(this.entries.values()).map((e) => e.node);
    enterStagger([...nodes, this.levelPill, this.start.node], 0.07);
    Tween.stopAllByTarget(this.start.node);
    fx.delay(this.node, 0.6, () => {
      this.start.node.setScale(1, 1, 1);
      fx.breathe(this.start.node, 0.03, 1.4);
    });
    this.animateSchool();
    this.startBubbles();
    const unlocked = argUnlocked(arg);
    const visible = unlocked.filter((f) => FEATURE_LABEL[f]);
    if (visible.length) fx.delay(this.node, App.config.ui.unlockGuide.delay, () => this.unlockGuide(visible));
  }

  override hide(): void {
    for (const f of this.school) Tween.stopAllByTarget(f);
    this.bubbles.destroyAllChildren();
    Tween.stopAllByTarget(this.bubbles);
  }

  /** 每条鱼上下浮、身体轻摆；隔几秒挑一条换位置游一小段 */
  private animateSchool(): void {
    this.school.forEach((f, i) => {
      Tween.stopAllByTarget(f);
      const sx = f.scale.x;
      tween(f)
        .repeatForever(
          tween(f)
            .to(0.6 + i * 0.07, { angle: 5, scale: new Vec3(sx * 1.03, 0.97, 1) }, { easing: 'sineInOut' })
            .to(0.6 + i * 0.07, { angle: -4, scale: new Vec3(sx, 1, 1) }, { easing: 'sineInOut' }),
        )
        .start();
    });
    const home = this.school.map((f) => f.position.clone());
    const wander = () => {
      if (!this.node.active) return;
      const i = Math.floor(Math.random() * this.school.length);
      const f = this.school[i];
      const h = home[i];
      const tx = h.x + (Math.random() - 0.5) * 120;
      const ty = h.y + (Math.random() - 0.5) * 60;
      tween(f)
        .to(1.4, { position: new Vec3(tx, ty, 0) }, { easing: 'sineInOut' })
        .to(1.6, { position: h.clone() }, { easing: 'sineInOut' })
        .start();
      fx.delay(this.node, 2.2 + Math.random() * 1.5, wander);
    };
    fx.delay(this.node, 1.2, wander);
  }

  /** 气泡从下往上冒 */
  private startBubbles(): void {
    const spawn = () => {
      if (!this.node.active) return;
      const s = 14 + Math.random() * 26;
      const b = img(this.bubbles, 'kit/bubble_small', s, s, 'b');
      const x = (Math.random() - 0.5) * (Screen.W - 60);
      at(b, x, Screen.bottom + 40);
      opacity(b).opacity = 200;
      tween(b)
        .to(5 + Math.random() * 3, { position: new Vec3(x + (Math.random() - 0.5) * 80, Screen.top + 40, 0) }, { easing: 'sineIn' })
        .call(() => b.destroy())
        .start();
      fx.delay(this.bubbles, 0.5 + Math.random() * 0.8, spawn);
    };
    spawn();
  }

  override refresh(): void {
    const s = App.save.data;
    const eco = App.config.eco;
    const day = today();
    const lvl = s.level;
    this.levelLabel.string = tr('UI_LEVEL', lvl);
    // 挑战关主按钮换橙色并加「挑战」小标
    const file = Meta.levelFile(lvl, App.config.levelCount);
    const hard = LevelCurve.isChallenge(App.config.curve, file);
    this.start.setColor(hard ? 'orange' : 'green');
    this.tag.active = hard;
    for (const e of this.entries.values()) {
      const open = Features.isUnlocked(eco, e.feature, lvl);
      e.lock.active = !open;
      (e.icon.getComponent(Sprite) as Sprite).grayscale = !open;
      e.label.string = open ? tr(FEATURE_LABEL[e.feature]) : tr('H_UNLOCKS_AT', Features.unlockLevel(eco, e.feature));
      let dot = false;
      if (open) {
        if (e.feature === 'signin') dot = SignIn.canClaim(s, day);
        if (e.feature === 'wheel') dot = Wheel.spinsLeft(s, eco, day) > 0;
        if (e.feature === 'daily') dot = DailyChallenge.canStartFree(s, day);
      }
      const had = e.dot.active;
      e.dot.active = dot;
      if (dot && !had) {
        fx.wiggle(e.icon, 7, 2.6);
        fx.breathe(e.dot, 0.15, 0.9);
      } else if (!dot) {
        Tween.stopAllByTarget(e.icon);
        e.icon.angle = 0;
      }
    }
  }

  /** 功能开放的当关过关后，主页播一次解锁动画并引导点进去（docs/01 5.3） */
  private unlockGuide(features: string[]): void {
    const [f, ...rest] = features;
    const p = openPopup({ w: 600, h: 560, title: tr('H_UNLOCK_TITLE'), mascot: 'c01', onClose: () => rest.length && this.unlockGuide(rest) });
    const e = this.entries.get(f);
    const iconPath = e ? `icon/entry_${f === 'levelSelect' ? 'levels' : f}` : f === 'homeBase' ? 'icon/tab_base' : f === 'album' ? 'icon/tab_collect' : 'icon/tab_rank';
    const icon = img(p.body, iconPath, 200, 200, 'icon');
    at(icon, 0, 90);
    fx.rays(p.body, 320).setSiblingIndex(1);
    fx.sparkle(p.body, 0, 90, App.config.ui.unlockGuide.sparks, 200);
    const l = text(p.body, tr('H_UNLOCK_LINE', tr(FEATURE_LABEL[f])), 40);
    at(l.node, 0, -60);
    const go = button(p.body, {
      color: 'green',
      w: 360,
      h: 100,
      label: tr('H_GO_LOOK'),
      onTap: () => {
        p.close();
        if (f === 'signin') signInPopup(() => ui.refresh());
        else if (f === 'wheel') ui.go('wheel');
        else if (f === 'levelSelect') ui.go('levels');
        else if (f === 'daily') ui.go('daily');
        else if (f === 'homeBase') ui.go('base');
        else if (f === 'album') ui.go('collect');
        else if (f === 'rank') ui.go('rank');
      },
    });
    at(go.node, 0, -180);
    if (e) {
      fx.ring(e.node.parent as Node, e.node.position.x, e.node.position.y, 100, 320);
      fx.breathe(e.node, 0.08, 0.8);
    }
  }
}

type UnlockArg = { unlocked?: string[] } | null;

function argUnlocked(arg: unknown): string[] {
  const a = arg as UnlockArg;
  return a?.unlocked ?? [];
}
