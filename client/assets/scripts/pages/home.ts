// 主页（定版图 01）。四角入口：左上签到、右上抽奖、左下选关、右下每日挑战（docs/09 第 4 节）。
// 中间鱼群常驻游动；气泡往上冒；「开始」呼吸（全屏唯一的常驻动效）；进场依次弹出（≤ 0.8 秒）。
import { Color, Node, Sprite, Tween, UITransform, Vec3, tween } from 'cc';
import * as DailyChallenge from '../core/meta/dailyChallenge';
import * as Features from '../core/meta/features';
import * as LevelCurve from '../core/gen/levelCurve';
import * as Meta from '../core/meta/meta';
import * as SignIn from '../core/meta/signIn';
import * as Wheel from '../core/meta/wheel';
import { App } from '../services/app';
import { buzz, sfx } from '../services/audio';
import { today } from '../services/clock';
import * as Flow from '../game/flow';
import * as fx from '../ui/fx';
import { language, tr } from '../ui/i18n';
import { Btn, at, box, button, img, lazyImg, onTap, opacity, plate, redDot, resizePlate, slice, text } from '../ui/kit';
import { openPopup } from '../ui/popup';
import { Screen } from '../ui/screen';
import { Page, TABBAR_H, enterStagger, ui } from '../ui/shell';
import { signInPopup } from './signin';

/** 入口：大图标直接浮在场景上，下面压一块蓝色标签条（定版图 01） */
const ENTRY_W = 176;
const ENTRY_H = 184;
const ENTRY_ICON = 140;
const LABEL_H = 58;
/** 「开始」按钮 */
/** 「开始」艺术字的显示尺寸（宽按图的比例，见 tools/art/skin.py） */
const START_WORD_H = 90;
const START_WORD_W = 189;
const START_W = 420;
const START_H = 134;

interface Entry {
  node: Node;
  icon: Node;
  plate: Node;
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
  tasks: 'UI_TAB_TASKS',
};

export class HomePage extends Page {
  readonly tab = 'home' as const;
  override readonly topBar = true;
  private entries = new Map<string, Entry>();
  private start!: Btn;
  private levelPill!: Node;
  private levelLabel!: ReturnType<typeof text>;
  private tag!: Node;
  private school: Node[] = [];
  /** 动态光照：光柱、海底的水纹光斑、水里的亮点（盖在背景上、鱼和入口下面） */
  private light!: Node;
  private bubbles!: Node;

  build(root: Node): void {
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(root, 'bg/home', (bgH * 1024) / 1536, bgH);
    this.light = box('light', root, Screen.W, Screen.H);
    this.bubbles = box('bubbles', root, Screen.W, Screen.H);
    // 四角入口：页边距 24。开始（全屏唯一的主按钮）+ 关卡号条在底栏上面；下面两个入口在关卡号条上方两侧
    const x0 = Screen.W / 2 - 24 - ENTRY_W / 2;
    const top = Screen.top - 144 - 16 - ENTRY_H / 2;
    const btnY = Screen.bottom + TABBAR_H + 28 + START_H / 2;
    const pillY = btnY + START_H / 2 + 10 + LABEL_H / 2;
    const low = pillY + LABEL_H / 2 + 14 + ENTRY_H / 2;
    // 鱼群聚在上下两排入口之间（定版图 01：大而聚拢）；屏幕高就上下拉开一点、放大一点
    const zoneTop = top - ENTRY_H / 2;
    const zoneBottom = low + ENTRY_H / 2;
    const k = Math.max(1, Math.min(1.35, (zoneTop - zoneBottom) / 380));
    const ks = Math.min(1.15, k);
    const midY = (zoneTop + zoneBottom) / 2;
    for (const [id, x, y, s] of App.config.ui.homeDeco.school) {
      const f = img(root, `fish/${id}`, s * ks, s * ks, `fish_${id}`);
      at(f, x, midY + y * k);
      if (x > 0) f.setScale(-1, 1, 1);
      // 点一下鱼：往上窜一下、吐几个泡泡
      onTap(f, () => this.poke(f), { press: 0, sound: null });
      this.school.push(f);
    }
    this.entry(root, 'signin', 'icon/entry_signin', -x0, top, () => signInPopup(() => ui.refresh()));
    this.entry(root, 'wheel', 'icon/entry_wheel', x0, top, () => ui.go('wheel'));
    this.entry(root, 'levelSelect', 'icon/entry_levels', -x0, low, () => ui.go('levels'), 1.18);
    this.entry(root, 'daily', 'icon/entry_daily', x0, low, () => ui.go('daily'));
    // 「开始」：中文用 Codex 画的艺术字（位图，不糊）；其它语言用字
    this.start = button(root, {
      color: 'green',
      w: START_W,
      h: START_H,
      label: tr('UI_PLAY'),
      fontSize: 80,
      art: language() === 'zh_CN' ? { path: 'skin/j_start_word', w: START_WORD_W, h: START_WORD_H } : undefined,
      onTap: () => Flow.startLevel(App.save.data.level),
    });
    at(this.start.node, 0, btnY);
    this.levelPill = plate(root, 'skin/j_plate', 232, LABEL_H, 'levelPill');
    at(this.levelPill, 0, pillY);
    this.levelLabel = text(this.levelPill, '', 36);
    // 挑战关：关卡号条加宽，左边放红色「挑战」小标（不歪斜、不出条外）
    this.tag = slice(this.levelPill, 'kit/tag_red', 88, 42, 'tag');
    text(this.tag, tr('UI_CHALLENGE_TAG'), 26);
  }

  private entry(root: Node, feature: string, icon: string, x: number, y: number, open: () => void, iconScale = 1): void {
    const n = box(feature, root, ENTRY_W, ENTRY_H);
    at(n, x, y);
    const ic = img(n, icon, ENTRY_ICON * iconScale, ENTRY_ICON * iconScale, 'icon');
    at(ic, 0, ENTRY_H / 2 - ENTRY_ICON / 2);
    // 标签条压住图标下沿一点
    const pl = plate(n, 'skin/j_plate', 150, LABEL_H, 'plate');
    at(pl, 0, -ENTRY_H / 2 + LABEL_H / 2);
    const label = text(pl, tr(FEATURE_LABEL[feature]), 36);
    at(label.node, 0, 2);
    const lock = img(n, 'kit/ic_lock', 52, 52, 'lock');
    at(lock, 46, 4);
    const dot = redDot(n, ENTRY_ICON / 2 - 8, ENTRY_H / 2 - 12, 30);
    onTap(n, () => {
      const s = App.save.data;
      if (!Features.isUnlocked(App.config.eco, feature, s.level)) {
        // 未开放：点进去是锁页（docs/01 5.3）
        ui.go('lock', { feature });
        return;
      }
      open();
    });
    this.entries.set(feature, { node: n, icon: ic, plate: pl, lock, dot, label, feature });
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
    this.startLight();
    this.startBubbles();
    // 有红点的入口隔一会晃一下图标，提醒「这里有东西可领」
    for (const e of this.entries.values()) {
      Tween.stopAllByTarget(e.icon);
      e.icon.angle = 0;
      if (e.dot.active) fx.wiggle(e.icon, 7, 2.6);
    }
    const unlocked = argUnlocked(arg);
    const visible = unlocked.filter((f) => FEATURE_LABEL[f]);
    if (visible.length) fx.delay(this.node, App.config.ui.unlockGuide.delay, () => this.unlockGuide(visible));
  }

  override hide(): void {
    for (const f of this.school) Tween.stopAllByTarget(f);
    this.light.destroyAllChildren();
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

  private poke(f: Node): void {
    sfx('pop');
    buzz('light');
    tween(f)
      .by(0.12, { position: new Vec3(0, 30, 0) }, { easing: 'quadOut' })
      .by(0.2, { position: new Vec3(0, -30, 0) }, { easing: 'quadIn' })
      .start();
    const p = f.position;
    fx.ring(this.bubbles, p.x, p.y, 60, 190);
    for (let i = 0; i < 4; i++) {
      const s = 16 + Math.random() * 18;
      const b = img(this.bubbles, 'kit/bubble_small', s, s, 'b');
      at(b, p.x + (Math.random() - 0.5) * 60, p.y + 20);
      tween(b)
        .to(0.9 + Math.random() * 0.5, { position: new Vec3(p.x + (Math.random() - 0.5) * 140, p.y + 150 + Math.random() * 120, 0) }, { easing: 'quadOut' })
        .call(() => b.destroy())
        .start();
      tween(opacity(b)).delay(0.6).to(0.5, { opacity: 0 }).start();
    }
  }

  /**
   * 动态光照（用户 2026-11-16）：阳光从水面照下来——
   * 顶上一团呼吸的日光；五束光柱从顶上斜着照下来，各自慢慢摆、忽明忽暗，另有一束宽光慢慢左右扫；海底几块水纹光斑左右漂、明暗交替；水里零星的亮点一闪一闪
   */
  private startLight(): void {
    const L = this.light;
    L.destroyAllChildren();
    const warm = new Color(255, 250, 215, 255);
    const sun = img(L, 'kit/fx_glow', Screen.W * 1.3, 620, 'sun');
    (sun.getComponent(Sprite) as Sprite).color = warm;
    at(sun, 0, Screen.top - 60);
    const sop = opacity(sun);
    sop.opacity = 120;
    tween(sop).repeatForever(tween(sop).to(2.4, { opacity: 215 }, { easing: 'sineInOut' }).to(2.4, { opacity: 110 }, { easing: 'sineInOut' })).start();
    // 光柱：[横向位置, 宽, 基础亮度, 摆动周期, 明暗周期]。顶端固定，往两边散开
    const beams: [number, number, number, number, number][] = [
      [-290, 250, 170, 7.5, 4.2],
      [-140, 190, 205, 6.2, 3.4],
      [20, 300, 185, 8.4, 5.0],
      [170, 200, 210, 6.8, 3.8],
      [310, 260, 165, 7.9, 4.6],
    ];
    beams.forEach(([x, w, hi, sway, pulse], i) => {
      const b = img(L, 'kit/fx_beam', w, Screen.H * 0.86, 'beam');
      (b.getComponent(UITransform) as UITransform).setAnchorPoint(0.5, 1);
      (b.getComponent(Sprite) as Sprite).color = warm;
      at(b, x * 0.55, Screen.top + 30);
      const base = x * 0.045;
      b.angle = base - 4.5;
      tween(b)
        .delay(i * 0.4)
        .repeatForever(tween(b).to(sway / 2, { angle: base + 4.5 }, { easing: 'sineInOut' }).to(sway / 2, { angle: base - 4.5 }, { easing: 'sineInOut' }))
        .start();
      const op = opacity(b);
      op.opacity = Math.round(hi * 0.5);
      tween(op)
        .delay(i * 0.7)
        .repeatForever(tween(op).to(pulse / 2, { opacity: hi }, { easing: 'sineInOut' }).to(pulse / 2, { opacity: Math.round(hi * 0.25) }, { easing: 'sineInOut' }))
        .start();
    });
    // 一束更宽的光慢慢从左扫到右再扫回来（一眼能看出光在动）
    const sweep = img(L, 'kit/fx_beam', 460, Screen.H * 0.95, 'sweep');
    (sweep.getComponent(UITransform) as UITransform).setAnchorPoint(0.5, 1);
    (sweep.getComponent(Sprite) as Sprite).color = warm;
    at(sweep, 0, Screen.top + 30);
    opacity(sweep).opacity = 120;
    sweep.angle = -20;
    tween(sweep).repeatForever(tween(sweep).to(5.5, { angle: 20 }, { easing: 'sineInOut' }).to(5.5, { angle: -20 }, { easing: 'sineInOut' })).start();
    // 海底的水纹光斑：扁的柔光，左右漂、明暗交替
    const floorTop = Screen.bottom + TABBAR_H + 280;
    for (let i = 0; i < 7; i++) {
      const w = 240 + Math.random() * 220;
      const c = img(L, 'kit/fx_glow', w, w * 0.28, 'caustic');
      (c.getComponent(Sprite) as Sprite).color = warm;
      const x = (Math.random() - 0.5) * (Screen.W - 80);
      const y = Screen.bottom + TABBAR_H + 20 + Math.random() * (floorTop - Screen.bottom - TABBAR_H - 20);
      at(c, x, y);
      const dx = 50 + Math.random() * 50;
      const dur = 3 + Math.random() * 2.5;
      tween(c)
        .repeatForever(tween(c).to(dur, { position: new Vec3(x + dx, y, 0) }, { easing: 'sineInOut' }).to(dur, { position: new Vec3(x - dx, y, 0) }, { easing: 'sineInOut' }))
        .start();
      const op = opacity(c);
      op.opacity = 0;
      const pd = 1.6 + Math.random() * 1.6;
      tween(op)
        .delay(Math.random() * 2)
        .repeatForever(tween(op).to(pd, { opacity: 185 }, { easing: 'sineInOut' }).to(pd, { opacity: 10 }, { easing: 'sineInOut' }))
        .start();
    }
    // 水里的亮点：随机位置闪一下
    const glint = () => {
      if (!this.node.active) return;
      const g = img(L, 'kit/fx_spark', 26, 26, 'glint');
      at(g, (Math.random() - 0.5) * (Screen.W - 60), Screen.bottom + TABBAR_H + 80 + Math.random() * (Screen.H - TABBAR_H - 320));
      g.setScale(0.1, 0.1, 1);
      opacity(g).opacity = 200;
      const k = 0.6 + Math.random() * 0.8;
      tween(g)
        .to(0.35, { scale: new Vec3(k, k, 1), angle: 45 }, { easing: 'quadOut' })
        .to(0.45, { scale: new Vec3(0.05, 0.05, 1), angle: 90 }, { easing: 'quadIn' })
        .call(() => g.destroy())
        .start();
      fx.delay(L, 0.35 + Math.random() * 0.5, glint);
    };
    glint();
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
    this.start.setColor('green');
    this.tag.active = hard;
    resizePlate(this.levelPill, hard ? 344 : 240, LABEL_H);
    at(this.tag, -344 / 2 + 16 + 44, 2);
    at(this.levelLabel.node, hard ? 48 : 0, 2);
    for (const e of this.entries.values()) {
      const open = Features.isUnlocked(eco, e.feature, lvl);
      e.lock.active = !open;
      (e.icon.getComponent(Sprite) as Sprite).grayscale = !open;
      opacity(e.icon).opacity = open ? 255 : 120;
      // 没开放时标签写「第 N 关解锁」，字小一号、条按字宽撑开
      const name = tr(FEATURE_LABEL[e.feature]);
      e.label.fontSize = !open ? 24 : name.length > 3 ? 32 : 36;
      e.label.string = open ? name : tr('H_UNLOCKS_AT', Features.unlockLevel(eco, e.feature));
      e.label.updateRenderData(true);
      const tw = (e.label.node.getComponent(UITransform) as UITransform).width;
      resizePlate(e.plate, Math.max(156, Math.min(ENTRY_W + 8, tw + 44)), LABEL_H);
      let dot = false;
      if (open) {
        if (e.feature === 'signin') dot = SignIn.canClaim(s, day);
        if (e.feature === 'wheel') dot = Wheel.spinsLeft(s, eco, day) > 0;
        if (e.feature === 'daily') dot = DailyChallenge.canStartFree(s, day);
      }
      e.dot.active = dot;
    }
  }

  /** 功能开放的当关过关后，主页播一次解锁动画并引导点进去（docs/01 5.3） */
  private unlockGuide(features: string[]): void {
    const [f, ...rest] = features;
    const p = openPopup({ w: 600, h: 560, title: tr('H_UNLOCK_TITLE'), mascot: 'c01', onClose: () => rest.length && this.unlockGuide(rest) });
    const e = this.entries.get(f);
    const iconPath = e ? `icon/entry_${f === 'levelSelect' ? 'levels' : f}` : f === 'homeBase' ? 'icon/tab_base' : f === 'album' ? 'icon/tab_collect' : 'icon/tab_tasks';
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
        else if (f === 'tasks') ui.go('tasks');
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
