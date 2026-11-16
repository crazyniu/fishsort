// 主页：全游戏的总入口，没有底栏（用户 2026-11-16 定；docs/01 5.3）。
// 顶栏下面左右各一列四个入口——左列签到、选关、每日挑战、抽奖，右列商店、家园、收藏、任务；中间三个装着鱼的气泡；最下面是「开始」。
// 气泡一直是活的；小泡泡往上冒；「开始」呼吸；进场依次弹出（≤ 0.8 秒）。
import { Color, Node, Sprite, Tween, UITransform, Vec3, tween } from 'cc';
import * as Album from '../core/meta/album';
import * as DailyChallenge from '../core/meta/dailyChallenge';
import * as Dex from '../core/meta/dex';
import * as Features from '../core/meta/features';
import * as HomeBase from '../core/meta/homeBase';
import * as LevelCurve from '../core/gen/levelCurve';
import * as Meta from '../core/meta/meta';
import * as SignIn from '../core/meta/signIn';
import * as Tasks from '../core/meta/tasks';
import * as Wheel from '../core/meta/wheel';
import { App } from '../services/app';
import { buzz, sfx } from '../services/audio';
import { today } from '../services/clock';
import * as Flow from '../game/flow';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { Btn, at, box, button, fit, hex, img, lazyImg, onTap, opacity, plate, redDot, slice, text } from '../ui/kit';
import { openPopup } from '../ui/popup';
import { Screen } from '../ui/screen';
import { Page, enterStagger, ui } from '../ui/shell';
import { signInPopup } from './signin';

/**
 * 入口：左右各一列贴着屏幕边，每个入口是同样大的半透明白格子，图标放在格子里，格子下沿压一块蓝色标签牌。
 * 一列四个，所以比原来两个一列时小一号（用户 2026-11-16：八个入口加五个气泡「太挤」）
 */
const ENTRY_TILE = 112;
const ENTRY_ICON = 90;
const LABEL_W = 124;
const LABEL_H = 40;
const LABEL_FONT = 24;
/** 一个入口占的高（格子 + 压出去的半块标签牌），两个入口之间再空 ENTRY_GAP */
const ENTRY_H = ENTRY_TILE + LABEL_H / 2;
const ENTRY_GAP = 36;
/** 入口的标签牌离屏幕边多远 */
const ENTRY_MARGIN = 22;
/** 气泡的直径是里面那条鱼的几倍 */
const BUBBLE_K = 1.42;
/** 泡膜上转动的那层流光的颜色（和局内的气泡一样） */
const SHEEN = new Color(255, 200, 240, 255);
const WHITE = new Color(255, 255, 255, 255);
/** 「开始」按钮：上面大字「开始」，下面小字「第 N 关」；按钮底边离屏幕底 START_BOTTOM */
const START_W = 480;
const START_H = 156;
const START_BOTTOM = 50;
/** 顶栏占掉的高 */
const TOP_H = 144;
/** 顶栏到开始按钮之间的高，1334 高的屏上是这么多；更高的屏按比例把入口间距、气泡拉开一点 */
const ZONE_H = 984;

/** 主页上的一个气泡：node 整体漂、被点；drift 带着鱼在泡里慢慢转圈；fish 自己摆尾、偶尔往前窜一下；shell 是泡膜，sheen 是上面那层流光 */
interface Bubble {
  node: Node;
  home: Vec3;
  drift: Node;
  fish: Node;
  /** 鱼头朝哪边：1 朝左（原图方向），-1 朝右 */
  dir: number;
  shell: Node;
  sheen: Node;
  r: number;
}

/** 一个入口是什么：feature 是按关开放的功能（一开始就有的为 null），name 是标签的文案键，open 是点了以后做什么 */
interface EntryDef {
  id: string;
  feature: string | null;
  icon: string;
  name: string;
  open: () => void;
  /** 图标画得偏小的放大一点 */
  iconScale?: number;
}

interface Entry {
  def: EntryDef;
  node: Node;
  icon: Node;
  lock: Node;
  dot: Node;
  label: ReturnType<typeof text>;
}

export class HomePage extends Page {
  override readonly topBar = true;
  /** 入口，按 id 找（按关开放的那几个，id 就是功能开放项的名字） */
  private entries = new Map<string, Entry>();
  private start!: Btn;
  private levelLabel!: ReturnType<typeof text>;
  private tag!: Node;
  /** 鱼群：一个气泡一条鱼 */
  private school: Bubble[] = [];
  /** 每次进主页重新起一轮动画；上一轮还没到点的定时回调看到号变了就不再接着跑 */
  private animGen = 0;
  /** 动态光照：光柱、海底的水纹光斑、水里的亮点（盖在背景上、鱼和入口下面） */
  private light!: Node;
  private bubbles!: Node;

  build(root: Node): void {
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(root, 'bg/home', (bgH * 1024) / 1536, bgH);
    this.light = box('light', root, Screen.W, Screen.H);
    this.bubbles = box('bubbles', root, Screen.W, Screen.H);
    // 「开始」在最下面；顶栏和它之间是入口和气泡
    const btnY = -Screen.H / 2 + Math.max(START_BOTTOM, Screen.safeBottom + 24) + START_H / 2;
    const zoneTop = Screen.top - TOP_H;
    const zoneBottom = btnY + START_H / 2;
    const k = Math.max(1, Math.min(1.3, (zoneTop - zoneBottom) / ZONE_H));
    // 气泡：一个大的做主角，下面两个小的，摆在两列入口之间；大气泡对着两列的中段，小气泡落在两列下面，左右不顶在一起
    const ks = Math.min(1.12, k);
    const midY = (zoneTop + zoneBottom) / 2;
    for (const [id, x, y, s] of App.config.ui.homeDeco.school) {
      // 每条鱼装在一个气泡里（用户 2026-11-16；和局内「困在气泡里的小鱼」是同一个意思）。
      // 结构和局内的气泡一样：鱼在里面自己游；泡膜（气泡皮 + 一层慢慢转的流光）盖在鱼上面，像果冻一样软软地鼓、扁
      const d = s * ks;
      const D = d * BUBBLE_K;
      const b = box(`bubble_${id}`, root, D, D);
      at(b, x, midY + y * k);
      const drift = box('drift', b);
      const f = img(drift, `fish/${id}`, d, d, 'fish');
      const dir = x > 0 ? -1 : 1;
      f.setScale(dir, 1, 1);
      const shell = box('shell', b, D, D);
      img(shell, 'kit/bubble', D, D, 'film');
      const sheen = img(shell, 'kit/bubble', D, D, 'sheen');
      (sheen.getComponent(Sprite) as Sprite).color = SHEEN;
      opacity(sheen).opacity = 80;
      // 点一下：气泡往上窜一下、吐几个小泡泡
      onTap(b, () => this.poke(b), { press: 0, sound: null });
      this.school.push({ node: b, home: b.position.clone(), drift, fish: f, dir, shell, sheen, r: D / 2 });
    }
    // 入口：左列是「每天来点一下」的活动，右列是常驻的系统；从顶栏下面往下排
    const left: EntryDef[] = [
      { id: 'signin', feature: 'signin', icon: 'icon/entry_signin', name: 'H_FEAT_SIGNIN', open: () => signInPopup(() => ui.refresh()) },
      { id: 'levelSelect', feature: 'levelSelect', icon: 'icon/entry_levels', name: 'H_FEAT_LEVELS', open: () => ui.go('levels'), iconScale: 1.1 },
      { id: 'daily', feature: 'daily', icon: 'icon/entry_daily', name: 'UI_TAB_DAILY', open: () => ui.go('daily') },
      { id: 'wheel', feature: 'wheel', icon: 'icon/entry_wheel', name: 'H_FEAT_WHEEL', open: () => ui.go('wheel') },
    ];
    const right: EntryDef[] = [
      { id: 'shop', feature: null, icon: 'icon/tab_shop', name: 'UI_TAB_SHOP', open: () => ui.go('shop') },
      { id: 'homeBase', feature: 'homeBase', icon: 'icon/tab_base', name: 'UI_TAB_BASE', open: () => ui.go('base') },
      { id: 'album', feature: 'album', icon: 'icon/tab_collect', name: 'H_FEAT_COLLECTION', open: () => ui.go('collect') },
      { id: 'tasks', feature: 'tasks', icon: 'icon/tab_tasks', name: 'UI_TAB_TASKS', open: () => ui.go('tasks') },
    ];
    const x0 = Screen.W / 2 - ENTRY_MARGIN - LABEL_W / 2;
    const row1 = zoneTop - 18 - ENTRY_TILE / 2;
    const step = (ENTRY_H + ENTRY_GAP) * Math.min(1.2, k);
    left.forEach((d, i) => this.entry(root, d, -x0, row1 - i * step));
    right.forEach((d, i) => this.entry(root, d, x0, row1 - i * step));
    // 「开始」：全屏唯一的主按钮，平面绿色大按钮，两行字
    this.start = button(root, { color: 'green', w: START_W, h: START_H, onTap: () => Flow.startLevel(App.save.data.level) });
    at(this.start.node, 0, btnY);
    const row = this.start.node.getChildByName('row') as Node;
    const play = text(row, tr('UI_PLAY'), 66);
    at(play.node, 0, 22);
    fit(play, START_W - 80, 66, 40);
    this.levelLabel = text(row, '', 30, { color: hex('#E9FFE0') });
    at(this.levelLabel.node, 0, -38);
    // 挑战关：按钮右上角压一块红色「挑战」小标
    this.tag = slice(this.start.node, 'kit/tag_red', 96, 44, 'tag');
    at(this.tag, START_W / 2 - 70, START_H / 2 - 6);
    at(text(this.tag, tr('UI_CHALLENGE_TAG'), 26).node, 0, 3);
  }

  private entry(root: Node, def: EntryDef, x: number, y: number): void {
    const n = box(def.id, root, LABEL_W, ENTRY_TILE + LABEL_H);
    at(n, x, y);
    img(n, 'skin/f_card_glass', ENTRY_TILE, ENTRY_TILE, 'tile');
    const size = ENTRY_ICON * (def.iconScale ?? 1);
    const ic = img(n, def.icon, size, size, 'icon');
    at(ic, 0, 7);
    // 标签牌骑在格子的下沿上
    const pl = plate(n, 'skin/f_plate_blue', LABEL_W, LABEL_H, 'plate');
    at(pl, 0, -ENTRY_TILE / 2 - 2);
    const label = text(pl, tr(def.name), LABEL_FONT);
    at(label.node, 0, 3);
    const lock = img(n, 'kit/ic_lock', 40, 40, 'lock');
    at(lock, ENTRY_TILE / 2 - 20, -ENTRY_TILE / 2 + 40);
    const dot = redDot(n, ENTRY_TILE / 2 - 6, ENTRY_TILE / 2 - 6, 28);
    // 没有底栏了，切页的「嘟嘟」声放在入口上
    onTap(n, () => this.tapEntry(def), { sound: 'tab' });
    this.entries.set(def.id, { def, node: n, icon: ic, lock, dot, label });
  }

  private tapEntry(def: EntryDef): void {
    // 未开放：点进去是锁页（docs/01 5.3）
    if (def.feature && !Features.isUnlocked(App.config.eco, def.feature, App.save.data.level)) ui.go('lock', { feature: def.feature });
    else def.open();
  }

  override show(arg?: unknown): void {
    this.refresh();
    const nodes = Array.from(this.entries.values()).map((e) => e.node);
    enterStagger([...nodes, this.start.node], 0.05);
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
    const visible = unlocked.filter((f) => this.entries.has(f));
    if (visible.length) fx.delay(this.node, App.config.ui.unlockGuide.delay, () => this.unlockGuide(visible));
  }

  override hide(): void {
    this.animGen++;
    for (const b of this.school) for (const n of [b.node, b.drift, b.fish, b.shell, b.sheen]) Tween.stopAllByTarget(n);
    this.light.destroyAllChildren();
    this.bubbles.destroyAllChildren();
    Tween.stopAllByTarget(this.bubbles);
  }

  /**
   * 气泡的待机动画（用户 2026-11-16 要求加；参考了他发的录屏里「鱼在泡里一直是活的」那种感觉，做法是我们自己的）：
   * 气泡整体慢慢上下浮；泡膜像果冻一样鼓一下、扁一下，上面一层流光沿着泡边慢慢转；隔一两秒某个气泡的高光上闪一颗小星；
   * 鱼在泡里摆尾、慢慢转小圈，隔几秒挑一条往前窜一下、吐两个小泡泡再游回来。每个气泡的节奏都错开，不齐步
   */
  private animateSchool(): void {
    const gen = ++this.animGen;
    this.school.forEach((b, i) => {
      for (const n of [b.node, b.drift, b.fish, b.shell, b.sheen]) Tween.stopAllByTarget(n);
      b.node.setPosition(b.home);
      fx.bob(b.node, 8, 2.8 + i * 0.3, i * 0.45);
      // 泡膜：果冻
      b.shell.setScale(1, 1, 1);
      const t = 1.5 + (i % 5) * 0.17;
      tween(b.shell)
        .delay(i * 0.23)
        .repeatForever(
          tween(b.shell)
            .to(t, { scale: new Vec3(1.03, 0.97, 1) }, { easing: 'sineInOut' })
            .to(t, { scale: new Vec3(0.975, 1.025, 1) }, { easing: 'sineInOut' }),
        )
        .start();
      // 流光：慢慢转
      b.sheen.angle = (i * 47) % 360;
      tween(b.sheen)
        .repeatForever(tween(b.sheen).by(9 + (i % 4) * 1.5, { angle: i % 2 === 0 ? 360 : -360 }))
        .start();
      // 鱼：摆尾
      b.fish.setPosition(0, 0, 0);
      b.fish.angle = 0;
      b.fish.setScale(b.dir, 1, 1);
      tween(b.fish)
        .delay(i * 0.2)
        .repeatForever(
          tween(b.fish)
            .to(0.65 + i * 0.06, { angle: 5, scale: new Vec3(b.dir * 1.04, 0.96, 1) }, { easing: 'sineInOut' })
            .to(0.65 + i * 0.06, { angle: -4, scale: new Vec3(b.dir, 1, 1) }, { easing: 'sineInOut' }),
        )
        .start();
      // 鱼：在泡里慢慢转一个小圈（四个点连起来）
      const ax = b.r * 0.1;
      const ay = b.r * 0.08;
      const seg = 1.3 + (i % 3) * 0.25;
      b.drift.setPosition(0, 0, 0);
      tween(b.drift)
        .delay(i * 0.37)
        .repeatForever(
          tween(b.drift)
            .to(seg, { position: new Vec3(ax, ay, 0) }, { easing: 'sineInOut' })
            .to(seg, { position: new Vec3(-ax, ay * 0.4, 0) }, { easing: 'sineInOut' })
            .to(seg, { position: new Vec3(-ax * 0.6, -ay, 0) }, { easing: 'sineInOut' })
            .to(seg, { position: new Vec3(ax * 0.5, -ay * 0.5, 0) }, { easing: 'sineInOut' }),
        )
        .start();
    });
    // 隔一两秒，挑一个气泡在左上角的高光上闪一颗小星
    const twinkle = () => {
      if (gen !== this.animGen || !this.node.active) return;
      const b = this.school[Math.floor(Math.random() * this.school.length)];
      if (b) fx.sparkle(b.node, -b.r * 0.5, b.r * 0.52, 2, b.r * 0.12, WHITE, Math.max(18, b.r * 0.22));
      fx.delay(this.node, 0.9 + Math.random() * 1.4, twinkle);
    };
    fx.delay(this.node, 1, twinkle);
    // 隔几秒，挑一条鱼往前窜一下、吐两个小泡泡，再慢慢游回来
    const dart = () => {
      if (gen !== this.animGen || !this.node.active) return;
      const b = this.school[Math.floor(Math.random() * this.school.length)];
      if (b) {
        const step = -b.dir * b.r * 0.16;
        tween(b.fish)
          .to(0.18, { position: new Vec3(step, 0, 0) }, { easing: 'quadOut' })
          .delay(0.35)
          .to(0.9, { position: new Vec3(0, 0, 0) }, { easing: 'sineInOut' })
          .start();
        for (let j = 0; j < 2; j++) {
          const s = b.r * (0.09 + Math.random() * 0.05);
          const air = img(b.node, 'kit/bubble_small', s, s, 'air');
          // 从鱼嘴前面冒出来，往上漂到泡顶淡掉
          const x0 = b.drift.position.x + step - b.dir * b.r * 0.38;
          at(air, x0, b.drift.position.y + b.r * 0.05);
          opacity(air).opacity = 0;
          tween(opacity(air)).delay(0.12 + j * 0.16).to(0.1, { opacity: 220 }).delay(0.5).to(0.4, { opacity: 0 }).start();
          tween(air)
            .delay(0.12 + j * 0.16)
            .to(1, { position: new Vec3(x0 - b.dir * b.r * (0.05 + j * 0.08), b.r * 0.62, 0) }, { easing: 'sineOut' })
            .call(() => air.destroy())
            .start();
        }
      }
      fx.delay(this.node, 2.4 + Math.random() * 2, dart);
    };
    fx.delay(this.node, 1.8, dart);
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
    const floorTop = Screen.bottom + 280;
    for (let i = 0; i < 7; i++) {
      const w = 240 + Math.random() * 220;
      const c = img(L, 'kit/fx_glow', w, w * 0.28, 'caustic');
      (c.getComponent(Sprite) as Sprite).color = warm;
      const x = (Math.random() - 0.5) * (Screen.W - 80);
      const y = Screen.bottom + 20 + Math.random() * (floorTop - Screen.bottom - 20);
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
      at(g, (Math.random() - 0.5) * (Screen.W - 60), Screen.bottom + 80 + Math.random() * (Screen.H - 320));
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
    const eco = App.config.eco;
    const lvl = App.save.data.level;
    this.levelLabel.string = tr('UI_LEVEL', lvl);
    // 挑战关主按钮换橙色并加「挑战」小标
    const file = Meta.levelFile(lvl, App.config.levelCount);
    const hard = LevelCurve.isChallenge(App.config.curve, file);
    this.start.setColor('green');
    this.tag.active = hard;
    for (const e of this.entries.values()) {
      const f = e.def.feature;
      const open = f === null || Features.isUnlocked(eco, f, lvl);
      e.lock.active = !open;
      (e.icon.getComponent(Sprite) as Sprite).grayscale = !open;
      opacity(e.icon).opacity = open ? 255 : 120;
      // 没开放时标签写「第 N 关解锁」；字比标签牌宽就缩小，牌的大小不变（一列里的牌一样宽才整齐）
      e.label.string = f === null || open ? tr(e.def.name) : tr('H_UNLOCKS_AT', Features.unlockLevel(eco, f));
      fit(e.label, LABEL_W - 16, LABEL_FONT, 16);
      e.dot.active = open && this.hasNews(e.def.id);
    }
  }

  /** 这个入口里有没有东西可领、可做（红点） */
  private hasNews(id: string): boolean {
    const s = App.save.data;
    const eco = App.config.eco;
    const day = today();
    switch (id) {
      case 'signin':
        return SignIn.canClaim(s, day);
      case 'wheel':
        return Wheel.spinsLeft(s, eco, day) > 0;
      case 'daily':
        return DailyChallenge.canStartFree(s, day);
      case 'homeBase':
        return HomeBase.canBuild(s, eco);
      case 'album':
        return Album.claimable(s, eco) + Dex.claimable(s, eco) > 0;
      case 'tasks':
        return Tasks.claimable(s, eco, day) > 0;
      default:
        return false;
    }
  }

  /** 功能开放的当关过关后，主页播一次解锁动画并引导点进去（docs/01 5.3） */
  private unlockGuide(features: string[]): void {
    const [f, ...rest] = features;
    const e = this.entries.get(f) as Entry;
    const p = openPopup({ w: 600, h: 560, title: tr('H_UNLOCK_TITLE'), mascot: 'c01', onClose: () => rest.length && this.unlockGuide(rest) });
    const icon = img(p.body, e.def.icon, 200, 200, 'icon');
    at(icon, 0, 90);
    fx.rays(p.body, 320).setSiblingIndex(1);
    fx.sparkle(p.body, 0, 90, App.config.ui.unlockGuide.sparks, 200);
    const l = text(p.body, tr('H_UNLOCK_LINE', tr(e.def.name)), 40);
    at(l.node, 0, -60);
    const go = button(p.body, {
      color: 'green',
      w: 360,
      h: 100,
      label: tr('H_GO_LOOK'),
      onTap: () => {
        p.close();
        e.def.open();
      },
    });
    at(go.node, 0, -180);
    fx.ring(e.node.parent as Node, e.node.position.x, e.node.position.y, 100, 320);
    fx.breathe(e.node, 0.08, 0.8);
  }
}

type UnlockArg = { unlocked?: string[] } | null;

function argUnlocked(arg: unknown): string[] {
  const a = arg as UnlockArg;
  return a?.unlocked ?? [];
}
