// 局内页面（定版图 12）。逻辑在 core 里立即结算，这里按事件播表现（docs/09 第 6 节：动画不挡操作）。
// 版式：顶栏（进度 · 连击 · 关卡号 · 设置）→ 木架鱼缸 → 暂存槽 → 场地（尽量大）→ 技能栏。
import { Color, Label, Node, Sprite, Tween, UITransform, Vec3, tween } from 'cc';
import { Combo } from '../core/meta/combo';
import * as Features from '../core/meta/features';
import * as Meta from '../core/meta/meta';
import * as Seas from '../core/meta/seas';
import * as Skills from '../core/meta/skills';
import { pickSpecies } from '../core/model/speciesPick';
import { Bowl, GameState, MAX_SLOTS, NO_TIMER, RETURN_BUBBLE, Status } from '../core/model/gameState';
import { LevelData } from '../core/model/levelData';
import { Rng } from '../core/rng/rng';
import * as Rules from '../core/rules/rules';
import type { GameEvent } from '../core/rules/rules';
import * as Bots from '../core/solver/bots';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import { today } from '../services/clock';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { COLOR, Capsule, at, box, capsule, img, lazyImg, onTap, opacity, setImg, setSlice, size, slice, text } from '../ui/kit';
import { Screen } from '../ui/screen';
import { popupCount } from '../ui/popup';
import { Page, ui } from '../ui/shell';
import { Field } from './field';
import * as Flow from './flow';

export interface GameArg {
  level: number;
  daily?: boolean;
}

interface BowlView {
  node: Node;
  fish: Node;
  count: Label;
  badge: Node;
  timer: Node | null;
  timerLabel: Label | null;
  shown: number;
  cap: number;
  /** 还在路上、要进这个缸的鱼 */
  incoming: number;
  done: boolean;
}

const SKILLS = ['shuffle', 'blow', 'net', 'current'] as const;
type SkillId = (typeof SKILLS)[number];

export class GamePage extends Page {
  readonly tab = null;
  // 一局的状态
  lv!: LevelData;
  s!: GameState;
  arg!: GameArg;
  species: string[] = [];
  combo = new Combo();
  /** 局内时钟（秒），连击窗口用 */
  clock = 0;
  moved = false;
  ended = false;
  paused = false;
  used: Record<string, number> = {};
  netMode = false;
  // 画面
  private bg!: Node;
  private stage!: Node;
  private fly!: Node;
  private field!: Field;
  private progress!: Capsule;
  private levelCap!: Capsule;
  private comboRow!: Node;
  private comboLabel!: Label;
  private comboCoins!: Label;
  private comboBar!: Node;
  private comboBarW = 220;
  private shelf!: Node;
  private bowls: (BowlView | null)[] = [];
  private bowlX: number[] = [];
  private bowlY = 0;
  private plusNodes: Node[] = [];
  private bufferSlots: Node[] = [];
  private bufferNodes: Node[] = [];
  private bufferY = 0;
  private returnNodes: Node[] = [];
  private returnY = 0;
  private skillNodes = new Map<SkillId, { node: Node; icon: Node; count: Label; lock: Node; plus: Node }>();
  private hintNode: Node | null = null;
  private idle = 0;
  private autoplayT = 0;
  private rng = new Rng(Date.now() >>> 0);
  private warned = new Set<Node>();
  private nudged = new Set<string>();
  private fieldTop = 0;
  private fieldBottom = 0;
  private total = 0;

  build(root: Node): void {
    this.bg = box('bg', root, Screen.W, Screen.H);
    this.stage = box('stage', root, Screen.W, Screen.H);
    this.fly = box('fly', root, Screen.W, Screen.H);
    // 每帧推进：限时缸、连击窗口、提示、代打
    const ticker = box('ticker', root);
    tween(ticker)
      .repeatForever(tween(ticker).delay(1 / 30).call(() => this.update(1 / 30)))
      .start();
  }

  override show(arg?: unknown): void {
    this.arg = arg as GameArg;
    void this.start();
  }

  override back(): boolean {
    Flow.pause(this);
    return false;
  }

  private async start(): Promise<void> {
    ui.busy(true);
    const { config, save } = App;
    const eco = config.eco;
    const id = this.arg.level;
    const file = Meta.levelFile(id, config.levelCount);
    const ease = this.arg.daily ? 0 : Meta.easeFor(save.data, eco, id);
    try {
      this.lv = await config.loadLevel(file, ease);
    } finally {
      ui.busy(false);
    }
    this.s = GameState.fromLevel(this.lv);
    if (!this.arg.daily) this.s.openSlots = Meta.openSlotsFor(save.data, eco, id, this.lv.bowlSlots);
    this.species = pickSpecies(config.species, this.lv.levelSeed + (this.arg.daily ? today() : 0), this.lv.palette);
    this.combo = new Combo();
    this.clock = 0;
    this.moved = false;
    this.ended = false;
    this.paused = false;
    this.netMode = false;
    this.used = {};
    this.idle = 0;
    this.total = this.s.fishLeft();
    this.layout(file);
    const ev = Rules.start(this.s);
    this.play(ev, true);
    Flow.onLevelStart(this);
  }

  // ---------------------------------------------------------------- 版式

  private layout(file: number): void {
    this.bg.destroyAllChildren();
    this.stage.destroyAllChildren();
    this.fly.destroyAllChildren();
    this.bowls = [];
    this.bufferNodes = [];
    this.returnNodes = [];
    this.bufferSlots = [];
    this.warned.clear();
    this.nudged.clear();
    this.plusNodes = [];
    this.skillNodes.clear();
    this.hintNode = null;
    const eco = App.config.eco;
    const sea = eco.seas?.[Seas.forLevel(eco, file)]?.id ?? 'shore';
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(this.bg, `bg/sea_${sea}`, (bgH * 1024) / 1536, bgH);

    const top = Screen.top;
    // 顶栏：左进度、中连击、右关卡号 + 设置
    const hudY = top - 52;
    this.progress = capsule(this.stage, 230, 64, `fish/${this.species[0]}`, '');
    at(this.progress.node, -Screen.W / 2 + 140, hudY);
    this.levelCap = capsule(this.stage, 180, 64, null, tr('UI_LEVEL', this.arg.level));
    at(this.levelCap.node, Screen.W / 2 - 170, hudY);
    if (this.arg.daily) this.levelCap.set(tr('UI_TAB_DAILY'));
    const gear = img(this.stage, 'kit/round_blue', 78, 78, 'gear');
    img(gear, 'kit/ic_gear', 46, 46, 'glyph');
    at(gear, Screen.W / 2 - 46, hudY);
    onTap(gear, () => Flow.pause(this));
    this.comboRow = box('combo', this.stage, 240, 70);
    at(this.comboRow, 6, hudY + 4);
    this.comboLabel = text(this.comboRow, '', 34);
    at(this.comboLabel.node, 0, 12);
    this.comboCoins = text(this.comboRow, '', 24, { color: COLOR.yellow });
    at(this.comboCoins.node, 0, -16);
    const track = slice(this.comboRow, 'kit/bar_track', this.comboBarW, 14, 'track');
    at(track, 0, -36);
    this.comboBar = slice(track, 'kit/bar_yellow', this.comboBarW, 14, 'bar');
    this.comboRow.active = false;

    // 木架与鱼缸
    this.bowlY = top - 180;
    const shelfW = Screen.W - 40;
    this.shelf = slice(this.stage, 'kit/shelf', shelfW, 40, 'shelf');
    at(this.shelf, 0, this.bowlY - 70);
    const bw = (shelfW - 30) / MAX_SLOTS;
    this.bowlX = Array.from({ length: MAX_SLOTS }, (_, i) => -shelfW / 2 + 15 + bw * (i + 0.5));
    for (let i = 0; i < MAX_SLOTS; i++) {
      const plus = img(this.stage, 'kit/bowl', 150, 150, `plus${i}`);
      at(plus, this.bowlX[i], this.bowlY);
      opacity(plus).opacity = 200;
      const p = img(plus, 'kit/round_green', 64, 64, 'btn');
      img(p, 'kit/ic_plus', 40, 40, 'glyph');
      at(p, 0, -4);
      fx.breathe(p, 0.06, 1.4);
      onTap(plus, () => Flow.unlockSlot(this));
      this.plusNodes.push(plus);
      this.bowls.push(null);
    }

    // 暂存槽
    this.bufferY = this.bowlY - 150;
    const cap = this.s.bufferCap;
    const sw = Math.min(124, (Screen.W - 60) / cap - 10);
    for (let i = 0; i < cap; i++) {
      const sl = slice(this.stage, 'kit/slot', sw, 92, `slot${i}`);
      at(sl, this.slotX(i), this.bufferY);
      this.bufferSlots.push(sl);
    }

    // 技能栏
    const skillY = Screen.bottom + 100;
    SKILLS.forEach((id, i) => this.buildSkill(id, -Screen.W / 2 + (Screen.W / 4) * (i + 0.5), skillY));

    // 场地：暂存槽和技能栏之间全部高度（用户 2026-11-16：场地尽量大）
    this.fieldTop = this.bufferY - 60;
    this.fieldBottom = skillY + 96;
    this.returnY = this.fieldTop - 40;
    const fh = this.fieldTop - this.fieldBottom;
    const fieldHolder = box('fieldHolder', this.stage, Screen.W, fh);
    at(fieldHolder, 0, (this.fieldTop + this.fieldBottom) / 2);
    this.field = new Field(
      fieldHolder,
      Screen.W - 16,
      fh,
      this.lv,
      this.species,
      (b, k) => this.tapFish(b, k),
      (b) => this.blocked(b),
    );
    this.field.build(this.s);
    // 进场：气泡依次弹出
    this.field.views.forEach((v, i) => v.node.active && fx.popIn(v.node, 0.15 + Math.floor(i / 4) * 0.12, 0.3));
    this.refreshHud();
    this.refreshSkills();
  }

  private slotX(i: number): number {
    const cap = this.s.bufferCap;
    const step = Math.min(134, (Screen.W - 40) / cap);
    return -((cap - 1) * step) / 2 + i * step;
  }

  private buildSkill(id: SkillId, x: number, y: number): void {
    const node = box(id, this.stage, 160, 190);
    at(node, x, y);
    const icon = img(node, `icon/skill_${id}`, 120, 120, 'icon');
    at(icon, 0, 26);
    const name = text(node, tr(`H_SKILL_${id === 'current' ? 'FLOW' : id.toUpperCase()}`), 32);
    at(name.node, 0, -44);
    const count = text(node, '', 30, { color: COLOR.yellow });
    at(count.node, 38, 70);
    const plus = img(node, 'kit/round_green', 48, 48, 'plus');
    img(plus, 'kit/ic_plus', 30, 30, 'glyph');
    at(plus, 44, 70);
    const lock = box('lock', node, 160, 190);
    const lockIcon = img(lock, 'kit/ic_lock', 60, 60, 'icon');
    at(lockIcon, 0, 30);
    const lockLabel = text(lock, '', 24);
    at(lockLabel.node, 0, -76);
    lockLabel.string = tr('H_UNLOCKS_AT', Skills.unlockLevel(App.config.eco, id));
    onTap(node, () => Flow.useSkill(this, id));
    this.skillNodes.set(id, { node, icon, count, lock, plus });
  }

  refreshSkills(): void {
    const save = App.save.data;
    const eco = App.config.eco;
    const lvl = this.arg.daily ? save.level : Math.max(save.level, this.arg.level);
    for (const [id, v] of this.skillNodes) {
      const unlocked = Skills.isUnlocked(eco, id, lvl);
      v.lock.active = !unlocked;
      (v.icon.getComponent(Sprite) as Sprite).grayscale = !unlocked;
      opacity(v.icon).opacity = unlocked ? 255 : 150;
      const n = Skills.count(save, id);
      const free = Skills.freeAvailable(save, id);
      v.count.node.active = unlocked && (n > 0 || free);
      v.plus.active = unlocked && n <= 0 && !free;
      v.count.string = free ? tr('UI_SKILL_FREE') : `×${Math.min(n, App.config.ui.badgeCap)}`;
    }
  }

  refreshHud(): void {
    const rescued = this.total - this.s.fishLeft();
    this.progress.set(`${rescued}/${this.total}`);
    const free = this.s.bufferCap - this.bufferNodes.length;
    const warn = free <= App.config.ui.buffer.warnFree && this.s.status === Status.PLAYING;
    this.bufferSlots.forEach((sl, i) => {
      const on = warn && i >= this.bufferNodes.length;
      if (this.warned.has(sl) === on) return;
      setSlice(sl, on ? 'kit/slot_warn' : 'kit/slot');
      const op = opacity(sl);
      Tween.stopAllByTarget(op);
      op.opacity = 255;
      if (on) {
        this.warned.add(sl);
        tween(op).repeatForever(tween(op).to(0.3, { opacity: 140 }).to(0.3, { opacity: 255 })).start();
      } else this.warned.delete(sl);
    });
    // 暂存槽只剩 2 格时，能救场的技能键发光跳动（docs/01 5.2）
    const nudge = free <= App.config.ui.buffer.skillNudgeFree && this.s.status === Status.PLAYING;
    for (const [id, v] of this.skillNodes) {
      const can = !v.lock.active && App.config.ui.buffer.rescueSkills.includes(id);
      const on = nudge && can;
      const glowing = this.nudged.has(id);
      if (on && !glowing) {
        this.nudged.add(id);
        fx.breathe(v.icon, 0.12, 0.6);
      } else if (!on && glowing) {
        this.nudged.delete(id);
        Tween.stopAllByTarget(v.icon);
        v.icon.setScale(1, 1, 1);
      }
    }
  }

  // ---------------------------------------------------------------- 输入

  private tapFish(b: number, k: number): void {
    if (this.ended || this.paused || this.s.status !== Status.PLAYING) return;
    if (this.netMode) {
      ui.toast(tr('UI_NET_HINT'));
      return;
    }
    if (!Rules.isOpen(this.s, b)) {
      this.blocked(b);
      return;
    }
    this.act(() => Rules.tap(this.s, b, k));
  }

  tapReturn(k: number): void {
    if (this.ended || this.paused || this.s.status !== Status.PLAYING) return;
    this.act(() => Rules.tap(this.s, RETURN_BUBBLE, k));
  }

  private blocked(b: number): void {
    this.field.shakeBubble(b);
    sfx('blocked');
  }

  /** 执行一步并播放；第一次有效操作记作「走过步」（扣命、每日挑战记次数） */
  act(step: () => GameEvent[]): GameEvent[] {
    const ev = step();
    if (ev.length === 0) return ev;
    if (!this.moved) {
      this.moved = true;
      Flow.onFirstMove(this);
    }
    this.clearHint();
    this.play(ev, false);
    return ev;
  }

  tapBowl(slot: number): void {
    if (!this.netMode) return;
    this.netMode = false;
    this.shelf.getChildByName('netHint')?.destroy();
    Flow.finishNet(this, slot);
  }

  enterNetMode(): void {
    this.netMode = true;
    ui.toast(tr('UI_NET_HINT'));
    for (let i = 0; i < this.s.openSlots; i++) {
      const v = this.bowls[i];
      if (v) fx.breathe(v.node, 0.06, 0.6);
    }
  }

  // ---------------------------------------------------------------- 事件表现

  /** 把一批事件变成动画。镜像（bufferNodes、returnNodes、bowls）立即跟着状态改，动画按时间表追 */
  play(events: GameEvent[], intro: boolean): void {
    const cfg = App.config.ui;
    let t = intro ? cfg.intro.startDelay : 0;
    let flyIdx = 0;
    let lastPop = -1;
    const hitAt: number[] = [];
    for (const e of events) {
      switch (e.t) {
        case 'fish_to_bowl':
        case 'net_fish': {
          const sp = e.species as number;
          const src = this.takeSource(e.b as number, e.k as number, sp);
          const view = this.bowls[e.slot as number];
          const delay = t + flyIdx * cfg.fly.stagger;
          flyIdx++;
          if (view) view.incoming++;
          this.flyTo(src, this.bowlX[e.slot as number], this.bowlY + 6, delay, () => this.arrive(view, sp));
          hitAt.push(delay);
          break;
        }
        case 'fish_to_buffer': {
          const sp = e.species as number;
          const src = this.takeSource(e.b as number, e.k as number, sp);
          const idx = this.bufferNodes.length;
          this.bufferNodes.push(src);
          this.flyTo(src, this.slotX(Math.min(idx, this.s.bufferCap - 1)), this.bufferY, t + flyIdx * cfg.fly.stagger, () => sfx('buffer'), 0.7, 60);
          flyIdx++;
          this.missCombo();
          break;
        }
        case 'buffer_to_bowl': {
          const idx = e.index as number;
          const n = this.bufferNodes.splice(idx, 1)[0];
          const view = this.bowls[e.slot as number];
          const delay = t + flyIdx * cfg.fly.stagger + 0.25;
          flyIdx++;
          if (view) view.incoming++;
          if (n) this.flyTo(n, this.bowlX[e.slot as number], this.bowlY + 6, delay, () => this.arrive(view, e.species as number), 1, 80);
          this.bufferNodes.forEach((m, i) => tween(m).delay(delay + 0.1).to(0.18, { position: new Vec3(this.slotX(i), this.bufferY, 0) }).start());
          hitAt.push(delay);
          break;
        }
        case 'bowl_done': {
          const view = this.bowls[e.slot as number];
          this.bowls[e.slot as number] = null;
          if (view) this.bowlDone(view, e.slot as number);
          break;
        }
        case 'bowl_in': {
          this.bowlIn(e.slot as number, e.species as number, e.cap as number, e.timer as number, intro ? t + (e.slot as number) * 0.1 : t + cfg.bowlDone.dropAt);
          break;
        }
        case 'slot_open': {
          const plus = this.plusNodes[e.slot as number];
          if (plus) plus.active = false;
          break;
        }
        case 'bubble_pop': {
          lastPop = e.b as number;
          const b = e.b as number;
          fx.delay(this.fly, t + 0.18, () => this.field.pop(b));
          fx.delay(this.fly, t + 0.18, () => sfx('pop'));
          break;
        }
        case 'bubble_drop': {
          this.field.dropIn(e.b as number, lastPop, t + 0.25);
          break;
        }
        case 'chain_tick':
        case 'chain_open':
        case 'ice_melt':
          break;
        case 'blow': {
          this.blowBuffer(t);
          break;
        }
        case 'shuffle': {
          this.field.reshuffle(this.s);
          sfx('shuffle');
          break;
        }
        case 'revive':
          break;
        case 'win':
          this.ended = true;
          fx.delay(this.fly, t + 0.9, () => Flow.win(this));
          break;
        case 'lose':
          fx.delay(this.fly, t + 0.6, () => Flow.lose(this));
          break;
      }
    }
    // 连击按入缸的先后计（暂存槽自动补进新缸也算命中）
    for (const d of hitAt) fx.delay(this.fly, d + cfg.fly.seconds, () => this.hitCombo());
    this.field.sync(this.s);
    this.layoutReturn(t + 0.2);
    this.refreshHud();
  }

  private takeSource(b: number, k: number, sp: number): Node {
    let n: Node;
    let x: number;
    let y: number;
    if (b === RETURN_BUBBLE) {
      n = this.returnNodes.splice(k, 1)[0];
      if (!n) n = img(null, this.field.spriteFor(sp), 80, 80, 'fish');
      const w = n.getComponent(UITransform)?.convertToWorldSpaceAR(new Vec3()) ?? new Vec3();
      const p = (this.fly.getComponent(UITransform) as UITransform).convertToNodeSpaceAR(w);
      x = p.x;
      y = p.y;
      n.removeFromParent();
      n.destroyAllChildren();
      setImg(n, this.field.spriteFor(sp), 80, 80);
    } else {
      const got = this.field.take(b, k, sp);
      n = got.node;
      const [fx0, fy0] = this.field.fishPos(b, k);
      const holder = this.field.node.parent as Node;
      x = fx0 + holder.position.x;
      y = fy0 + holder.position.y;
      n.removeFromParent();
    }
    this.fly.addChild(n);
    at(n, x, y);
    return n;
  }

  private flyTo(n: Node, x: number, y: number, delay: number, done: () => void, scale = 0.6, arc = 120): void {
    const cfg = App.config.ui.fly;
    Tween.stopAllByTarget(n);
    n.angle = 0;
    const s0 = Math.abs(n.scale.x) || 1;
    tween(n)
      .delay(delay)
      .to(cfg.tapPop, { scale: new Vec3(s0 * 1.2, s0 * 1.2, 1) })
      .call(() => {
        sfx('fly');
        fx.flyArc(n, x, y, cfg.seconds, arc, 'quadIn', done, s0 * scale);
      })
      .start();
  }

  private arrive(view: BowlView | null, _sp: number): void {
    if (!view) return;
    view.incoming--;
    view.shown++;
    view.count.string = `${Math.min(view.shown, view.cap)}/${view.cap}`;
    fx.squash(view.node, 0.88);
    fx.sparkle(this.fly, view.node.position.x, view.node.position.y, 6, 70, new Color(190, 240, 255, 255), 26);
    sfx('splash');
    // 飞行层里刚落进缸的鱼收掉
    for (const c of [...this.fly.children]) {
      if (Math.hypot(c.position.x - view.node.position.x, c.position.y - this.bowlY - 6) < 4 && c.name === 'fish') c.destroy();
    }
    if (view.done && view.incoming <= 0) this.bowlLeave(view);
  }

  private bowlIn(slot: number, sp: number, cap: number, timer: number, delay: number): void {
    const big = cap > 3;
    const s = big ? 170 : 150;
    const node = img(this.stage, 'kit/bowl', s, s, `bowl${slot}`);
    at(node, this.bowlX[slot], this.bowlY);
    const fish = img(node, this.field.spriteFor(sp), s * 0.5, s * 0.5, 'target');
    at(fish, 0, -s * 0.08);
    const badge = slice(node, 'kit/capsule', 104, 46, 'badge');
    at(badge, 0, -s / 2 - 2);
    const count = text(badge, `0/${cap}`, 28);
    let timerNode: Node | null = null;
    let timerLabel: Label | null = null;
    if (timer !== NO_TIMER) {
      timerNode = img(node, 'kit/round_red', 60, 60, 'timer');
      at(timerNode, s / 2 - 16, s / 2 - 22);
      timerLabel = text(timerNode, String(Math.ceil(timer)), 28);
    }
    if (big) {
      const tag = text(node, '×6', 26, { color: COLOR.yellow });
      at(tag.node, -s / 2 + 22, s / 2 - 22);
    }
    const view: BowlView = { node, fish, count, badge, timer: timerNode, timerLabel, shown: 0, cap, incoming: 0, done: false };
    this.bowls[slot] = view;
    onTap(node, () => this.tapBowl(slot), { press: 0.96 });
    // 新缸从上方落下
    node.setPosition(this.bowlX[slot], this.bowlY + 260, 0);
    opacity(node).opacity = 0;
    tween(node)
      .delay(delay)
      .call(() => (opacity(node).opacity = 255))
      .to(App.config.ui.bowlDone.dropSeconds, { position: new Vec3(this.bowlX[slot], this.bowlY, 0) }, { easing: 'bounceOut' })
      .start();
    const plus = this.plusNodes[slot];
    if (plus) plus.active = false;
  }

  /** 满缸：晃一下、发光、爆光、往上飘走（docs/01 3.1） */
  private bowlDone(view: BowlView, _slot: number): void {
    view.done = true;
    if (view.incoming <= 0) this.bowlLeave(view);
  }

  private bowlLeave(view: BowlView): void {
    const n = view.node;
    const cfg = App.config.ui.bowlDone;
    const glow = img(this.fly, 'kit/bowl_glow', 220, 220, 'glow');
    at(glow, n.position.x, n.position.y);
    tween(opacity(glow)).to(cfg.swell, { opacity: 255 }).to(0.3, { opacity: 0 }).call(() => glow.destroy()).start();
    tween(n)
      .to(0.06, { angle: 6 })
      .to(0.08, { angle: -6 })
      .to(0.06, { angle: 0 })
      .to(cfg.swell, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'quadOut' })
      .call(() => {
        fx.sparkle(this.fly, n.position.x, n.position.y, 14, 140, COLOR.yellow);
        fx.ring(this.fly, n.position.x, n.position.y, 100, 300);
        sfx('bowl');
      })
      .to(0.3, { position: new Vec3(n.position.x, n.position.y + 180, 0), scale: new Vec3(0.6, 0.6, 1) }, { easing: 'quadIn' })
      .call(() => n.destroy())
      .start();
    tween(opacity(n)).delay(cfg.swell + 0.25).to(0.25, { opacity: 0 }).start();
  }

  private blowBuffer(t: number): void {
    const nodes = this.bufferNodes.splice(0);
    nodes.forEach((n) => n.destroy());
    sfx('blow');
    this.layoutReturn(t);
  }

  /** 回流位：场地顶上一排小气泡，随时可点 */
  private layoutReturn(delay: number): void {
    const want = this.s.returnFish;
    // 镜像不对（吹泡、复活之后）就整排重建
    if (this.returnNodes.length !== want.length) {
      for (const n of this.returnNodes) n.destroy();
      this.returnNodes = want.map((sp, k) => {
        const b = img(this.stage, 'kit/bubble_small', 92, 92, 'return');
        img(b, this.field.spriteFor(sp), 68, 68, 'fish');
        onTap(b, () => this.tapReturn(this.returnNodes.indexOf(b)), { press: 0.9 });
        fx.popIn(b, delay + k * 0.05, 0.25);
        return b;
      });
    }
    const n = this.returnNodes.length;
    const step = Math.min(96, (Screen.W - 40) / Math.max(1, n));
    this.returnNodes.forEach((b, i) => {
      const x = -((n - 1) * step) / 2 + i * step;
      tween(b).to(0.2, { position: new Vec3(x, this.returnY, 0) }).start();
    });
  }

  // ---------------------------------------------------------------- 连击

  private hitCombo(): void {
    if (this.ended) return;
    const eco = App.config.eco;
    const cardsOpen = Features.isUnlocked(eco, 'album', App.save.data.level);
    const r = this.combo.hit(this.clock, eco.combo, this.rng, cardsOpen);
    if (r.tier < 0) {
      this.comboRow.active = false;
      sfx('hit', r.count);
      return;
    }
    this.comboRow.active = true;
    this.comboLabel.string = `×${r.count} ${tr('UI_COMBO_WORD')}`;
    this.comboCoins.string = tr('UI_COMBO_GOLD', this.combo.coins);
    const colors = [new Color(80, 190, 255), new Color(255, 205, 50), new Color(255, 90, 80), new Color(190, 100, 255)];
    this.comboLabel.color = colors[r.tier] ?? COLOR.white;
    fx.squash(this.comboLabel.node, 0.8);
    sfx('hit', r.count);
    if (r.tier_up) {
      const praise = text(null, tr(eco.combo.tiers[r.tier].key), 64, { color: colors[r.tier] });
      fx.floatUp(this.fly, praise.node, 0, this.fieldTop - 160, 120, 1.0);
      fx.flash(this.fly, Screen.W, Screen.H, 90);
      sfx('tier');
      App.platform.vibrate('light');
    }
    if (r.card) Flow.comboCard(this);
  }

  private missCombo(): void {
    this.combo.miss();
    this.comboRow.active = false;
  }

  // ---------------------------------------------------------------- 每帧

  private update(dt: number): void {
    if (!this.node?.active || !this.s || this.ended) return;
    // 弹窗开着（提示、开缸位、买技能…）时局内暂停：限时缸不走、代打不点
    if (this.paused || ui.currentName !== 'game' || popupCount() > 0) return;
    this.clock += dt;
    // 连击倒计时细条
    if (this.comboRow.active) {
      const left = Math.max(0, 1 - (this.clock - this.lastHit()) / App.config.eco.combo.windowSeconds);
      size(this.comboBar, this.comboBarW * left, 14);
      const skin = this.comboBar.getChildByName('skin');
      if (skin) size(skin, this.comboBarW * left * 3, 42);
      if (left <= 0) this.missCombo();
    }
    // 限时缸
    if (this.s.status === Status.PLAYING && this.moved) {
      const ev = Rules.tick(this.s, dt);
      if (ev.length) this.play(ev, false);
      for (let i = 0; i < MAX_SLOTS; i++) {
        const b: Bowl | null = this.s.slots[i];
        const v = this.bowls[i];
        if (b && v && v.timerLabel && b.timer !== NO_TIMER) v.timerLabel.string = String(Math.ceil(b.timer));
      }
    }
    // 提示
    this.idle += dt;
    const hint = App.config.ui.hint;
    const wait = this.arg.level <= hint.tutorialLevels ? hint.tutorialSeconds : hint.seconds;
    if (!this.hintNode && this.idle > wait && this.s.status === Status.PLAYING) this.showHint();
    // 机器人代打（调试，?autoplay=1）
    if (App.flags.autoplay && this.s.status === Status.PLAYING) {
      this.autoplayT += dt;
      if (this.autoplayT > 0.35) {
        this.autoplayT = 0;
        const t = Bots.nextTap(this.s, this.rng);
        if (t) this.act(() => Rules.tap(this.s, t[0], t[1]));
      }
    }
  }

  private lastHit(): number {
    return (this.combo as unknown as { last: number }).last;
  }

  private showHint(): void {
    const t = Bots.nextTap(this.s, this.rng);
    if (!t) return;
    if (t[0] === RETURN_BUBBLE) {
      const b = this.returnNodes[t[1]];
      if (b) {
        this.hintNode = img(b, 'kit/hint_ring', 120, 120, 'hint');
        fx.breathe(this.hintNode, 0.12, 0.9);
      }
    } else this.hintNode = this.field.hint(t[0], t[1]);
  }

  private clearHint(): void {
    this.idle = 0;
    this.hintNode?.destroy();
    this.hintNode = null;
  }

  // ---------------------------------------------------------------- 给流程用

  /** 复活后：暂存槽、回流位、缸的倒计时都按状态重画 */
  resync(): void {
    for (const n of this.bufferNodes) n.destroy();
    this.bufferNodes = this.s.buffer.map((sp, i) => {
      const f = img(this.fly, this.field.spriteFor(sp), 64, 64, 'fish');
      at(f, this.slotX(i), this.bufferY);
      return f;
    });
    this.layoutReturn(0);
    this.field.sync(this.s);
    this.refreshHud();
  }

  bowlPos(slot: number): [number, number] {
    return [this.bowlX[slot], this.bowlY];
  }

  fxLayer(): Node {
    return this.fly;
  }
}
