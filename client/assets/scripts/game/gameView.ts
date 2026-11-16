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
import { buzz, sfx } from '../services/audio';
import { today } from '../services/clock';
import * as fx from '../ui/fx';
import { language, tr } from '../ui/i18n';
import { Capsule, COLOR, artNumber, at, blockInput, box, capsule, iconButton, img, keyButton, lazyImg, onTap, opacity, plate, setImg, setSlice, size, slice, text, tint } from '../ui/kit';
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
  /** 满缸后正在飘走 */
  leaving: boolean;
}

const SKILLS = ['shuffle', 'blow', 'net', 'current'] as const;
type SkillId = (typeof SKILLS)[number];

/** 连击四档的颜色（docs/01 3.2：蓝、金、红、紫） */
const COMBO_COLORS = [new Color(110, 215, 255), new Color(255, 214, 64), new Color(255, 110, 80), new Color(214, 130, 255)];
/** 升档夸奖词的字色：压在蓝色飘带上要看得清，比档位色更亮 */
const PRAISE_FILL = [new Color(150, 240, 255), new Color(255, 222, 70), new Color(255, 150, 120), new Color(235, 170, 255)];
/** 连击计的位置（顶栏中间，进度条和关卡号之间） */
const COMBO_X = -42;
/** 连击「满屏」的强度，按档位（docs/01 3.2）：四边光框的亮度、背景放射光的亮度和转一圈的秒数、每秒冒几个光点 */
const FEVER = [
  { frame: 150, rays: 60, turn: 16, rise: 6 },
  { frame: 180, rays: 85, turn: 11, rise: 10 },
  { frame: 210, rays: 110, turn: 8, rise: 14 },
  { frame: 240, rays: 135, turn: 5.5, rise: 18 },
];
const HOP_TAG = 9102;

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
  /** 场景和玩法之间的一层：连击时的放射光、往上冒的光点 */
  private under!: Node;
  private stage!: Node;
  private fly!: Node;
  private field!: Field;
  private progress!: Capsule;
  private levelCap!: Capsule;
  private comboRow!: Node;
  private comboBadge!: Node;
  private comboGlow!: Node;
  private comboNum!: Node;
  private comboBar!: Node;
  private comboBarW = 190;
  /** 连击时屏幕四边的光框（一个节点装四条边，整体调亮度） */
  private frame!: Node;
  private frameHi = 0;
  /** 连击时背景里慢慢转的放射光 */
  private feverRays!: Node;
  private comboTier = -1;
  private comboColor = COLOR.white;
  private riseT = 0;
  /** 断连动画播放中（倒计时到 0 后每帧都会进来，只播一次） */
  private comboBreaking = false;
  /** 正在播的升档夸奖（新的一来，旧的立刻收掉） */
  private praiseNode: Node | null = null;
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
  private skillNodes = new Map<SkillId, { node: Node; icon: Node; count: Label; lock: Node; plus: Node; name: Node; badge: Node }>();
  private hintNode: Node | null = null;
  /** 这一关要强制教的新技能（解锁关第一次能用上时压暗全屏只让点它，docs/01 第 8 节）；"" = 没有 */
  tutor = '';
  private tutorNode: Node | null = null;
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
    this.under = box('under', root, Screen.W, Screen.H);
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
    this.comboTier = -1;
    this.comboBreaking = false;
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
    this.under.destroyAllChildren();
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
    this.tutorNode = null;
    const eco = App.config.eco;
    const sea = eco.seas?.[Seas.forLevel(eco, file)]?.id ?? 'shore';
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(this.bg, `bg/sea_${sea}`, (bgH * 1024) / 1536, bgH);

    const top = Screen.top;
    // 顶栏：左进度、中连击、右关卡号 + 设置
    const hudY = top - 52;
    this.progress = capsule(this.stage, 196, 66, `fish/${this.species[0]}`, '', 34);
    at(this.progress.node, -Screen.W / 2 + 24 + 98, hudY);
    this.levelCap = capsule(this.stage, 160, 66, null, tr('UI_LEVEL', this.arg.level), 30);
    at(this.levelCap.node, Screen.W / 2 - 24 - 74 - 10 - 80, hudY);
    if (this.arg.daily) this.levelCap.set(tr('UI_TAB_DAILY'));
    const gear = iconButton(this.stage, 'kit/round_blue', 'kit/ic_gear', 74, () => Flow.pause(this));
    at(gear, Screen.W / 2 - 24 - 37, hudY);
    // 连击计（顶栏中间，docs/01 3.2）：深色凹槽里「连击 ×N」+ 本局连击金币，底边一条倒计时；背后一团按档位换色的光
    this.comboRow = box('combo', this.stage, 250, 90);
    at(this.comboRow, COMBO_X, hudY);
    this.comboGlow = img(this.comboRow, 'kit/fx_glow', 330, 170, 'glow');
    opacity(this.comboGlow).opacity = 150;
    this.comboBadge = plate(this.comboRow, 'skin/j_inset', 226, 76, 'badge');
    // 「连击」和数字都是 Codex 画的艺术字（中文用图，其它语言用字）
    if (language() === 'zh_CN') {
      const word = img(this.comboBadge, 'skin/j_combo_word', 50, 41, 'word');
      at(word, -80, 6);
    } else {
      const word = text(this.comboBadge, tr('UI_COMBO_WORD'), 22, { align: 'left' });
      at(word.node, -104, 6);
    }
    this.comboNum = box('num', this.comboBadge);
    at(this.comboNum, -46, 6);
    const track = tint(this.comboBadge, this.comboBarW, 7, new Color(0, 10, 50, 150), 'track');
    at(track, 0, -26);
    this.comboBar = tint(this.comboBadge, this.comboBarW, 7, COLOR.yellow, 'bar');
    (this.comboBar.getComponent(UITransform) as UITransform).setAnchorPoint(0, 0.5);
    at(this.comboBar, -this.comboBarW / 2, -26);
    this.comboRow.active = false;
    // 连击光框：四边各一条柔光，6 连以上常亮、随档位换色，每次命中闪一下，断连熄灭。盖在玩法上面、不挡点击
    this.frame = box('frame', this.fly, Screen.W, Screen.H);
    for (const sx of [-1, 1]) at(img(this.frame, 'kit/fx_glow', 300, Screen.H * 1.2, 'side'), (sx * Screen.W) / 2, 0);
    for (const sy of [-1, 1]) at(img(this.frame, 'kit/fx_glow', Screen.W * 1.2, 280, 'cap'), 0, (sy * Screen.H) / 2);
    opacity(this.frame).opacity = 0;
    // 连击放射光：垫在玩法后面，整屏大，慢慢转
    const raysS = Math.hypot(Screen.W, Screen.H) * 1.15;
    this.feverRays = img(this.under, 'kit/fx_rays', raysS, raysS, 'rays');
    opacity(this.feverRays).opacity = 0;

    // 木架与鱼缸
    this.bowlY = top - 180;
    const shelfW = Screen.W - 40;
    this.shelf = slice(this.stage, 'kit/shelf', shelfW, 40, 'shelf');
    at(this.shelf, 0, this.bowlY - 70);
    const bw = (shelfW - 30) / MAX_SLOTS;
    this.bowlX = Array.from({ length: MAX_SLOTS }, (_, i) => -shelfW / 2 + 15 + bw * (i + 0.5));
    for (let i = 0; i < MAX_SLOTS; i++) {
      const plus = img(this.stage, 'skin/j_bowl', 150, 139, `plus${i}`);
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
    at(this.feverRays, 0, (this.fieldTop + this.fieldBottom) / 2);
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

  /** 技能键：蓝色玻璃方块，插画图标 + 名字；数量是右上角的琥珀小标签，没有了换绿色加号 */
  private buildSkill(id: SkillId, x: number, y: number): void {
    const node = slice(this.stage, 'kit/panel_blue', 156, 168, id);
    at(node, x, y);
    const icon = img(node, `icon/skill_${id}`, 108, 108, 'icon');
    at(icon, 0, 16);
    const name = text(node, tr(`H_SKILL_${id === 'current' ? 'FLOW' : id.toUpperCase()}`), 30);
    at(name.node, 0, -54);
    const badge = slice(node, 'kit/tag_amber', 64, 40, 'badge');
    at(badge, 156 / 2 - 22, 168 / 2 - 10);
    const count = text(badge, '', 26);
    const plus = keyButton(node, 'green', 'kit/ic_plus', 50, null, 0.62);
    at(plus, 156 / 2 - 18, 168 / 2 - 14);
    const lock = box('lock', node, 156, 168);
    const lockIcon = img(lock, 'kit/ic_lock', 48, 48, 'icon');
    at(lockIcon, 0, 18);
    const lockLabel = text(lock, '', 24);
    at(lockLabel.node, 0, -56);
    lockLabel.string = tr('H_UNLOCKS_AT', Skills.unlockLevel(App.config.eco, id));
    onTap(node, () => Flow.useSkill(this, id));
    this.skillNodes.set(id, { node, icon, count, lock, plus, name: name.node, badge });
  }

  refreshSkills(): void {
    const save = App.save.data;
    const eco = App.config.eco;
    const lvl = this.arg.daily ? save.level : Math.max(save.level, this.arg.level);
    for (const [id, v] of this.skillNodes) {
      const unlocked = Skills.isUnlocked(eco, id, lvl);
      v.lock.active = !unlocked;
      (v.icon.getComponent(Sprite) as Sprite).grayscale = !unlocked;
      opacity(v.icon).opacity = unlocked ? 255 : 110;
      v.name.active = unlocked;
      const n = Skills.count(save, id);
      const free = Skills.freeAvailable(save, id);
      v.badge.active = unlocked && (n > 0 || free);
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
    if (this.act(() => Rules.tap(this.s, b, k)).length) this.field.wobble(b);
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
    const hitAt: [number, number][] = [];
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
          hitAt.push([delay, this.bowlX[e.slot as number]]);
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
          hitAt.push([delay, this.bowlX[e.slot as number]]);
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
          // 最后一缸消失后停半拍 → 闪白、两边彩纸炮、三发烟花 → 结算页（docs/01 3.3）
          fx.delay(this.fly, t + 0.35, () => this.celebrate());
          fx.delay(this.fly, t + 0.35 + Number(App.config.ui.win.celebrate ?? 1), () => Flow.win(this));
          break;
        case 'lose':
          fx.delay(this.fly, t + 0.6, () => Flow.lose(this));
          break;
      }
    }
    // 连击按入缸的先后计（暂存槽自动补进新缸也算命中）
    for (const [d, x] of hitAt) fx.delay(this.fly, d + cfg.fly.seconds, () => this.hitCombo(x));
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
    // 满缸正在飘走的不再压（它的缩放归飘走动画管）
    if (!view.leaving) fx.squash(view.node, 0.88);
    fx.sparkle(this.fly, view.node.position.x, this.bowlY, 6, 70, new Color(190, 240, 255, 255), 26);
    sfx('splash');
    // 飞行层里刚落进缸的鱼收掉
    for (const c of [...this.fly.children]) {
      if (c.name === 'fish' && Math.hypot(c.position.x - view.node.position.x, c.position.y - this.bowlY - 6) < 4) c.destroy();
    }
    if (view.done && view.incoming <= 0) this.bowlLeave(view);
  }

  private bowlIn(slot: number, sp: number, cap: number, timer: number, delay: number): void {
    const big = cap > 3;
    const s = big ? 170 : 150;
    const node = img(this.stage, 'skin/j_bowl', s, s * 0.925, `bowl${slot}`);
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
    const view: BowlView = { node, fish, count, badge, timer: timerNode, timerLabel, shown: 0, cap, incoming: 0, done: false, leaving: false };
    this.bowls[slot] = view;
    onTap(node, () => this.tapBowl(slot), { press: 0 });
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
    if (view.leaving) return;
    view.leaving = true;
    const n = view.node;
    // 落下、跳动还没播完的先收掉，从架子上的位置开始飘
    Tween.stopAllByTarget(n);
    n.setPosition(n.position.x, this.bowlY, 0);
    n.setScale(1, 1, 1);
    opacity(n).opacity = 255;
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

  private hitCombo(bowlX = 0): void {
    if (this.ended) return;
    const eco = App.config.eco;
    const cardsOpen = Features.isUnlocked(eco, 'album', App.save.data.level);
    const r = this.combo.hit(this.clock, eco.combo, this.rng, cardsOpen);
    // 声音：每一击升一个音；震动：每一击轻震一下（docs/01 3.2：画面、声音、震动一起升级）
    sfx('hit', r.count);
    if (r.count >= 2) buzz('light');
    if (r.tier < 0) {
      this.comboRow.active = false;
      // 蓄势（2–5 连）：鱼缸上方的数字一次比一次大
      if (r.count >= 2) this.hitPop(bowlX, `×${r.count}`, 24 + r.count * 4);
      return;
    }
    const col = COMBO_COLORS[r.tier] ?? COLOR.white;
    const was = this.comboRow.active && !this.comboBreaking;
    this.comboBreaking = false;
    this.comboRow.active = true;
    artNumber(this.comboNum, `×${r.count}`, 56, 'left');
    // 连击金币：每次涨了从连击计右边飘一个「金币 +N」
    if (r.coins > 0) {
      const cl = text(null, `+${r.coins}`, 28, { color: COLOR.yellow });
      at(img(cl.node, 'icon/coin', 28, 28, 'coin'), -34, 0);
      fx.floatUp(this.fly, cl.node, COMBO_X + 70, Screen.top - 100, 28, 0.6);
    }
    (this.comboBar.getComponent(Sprite) as Sprite).color = col;
    (this.comboGlow.getComponent(Sprite) as Sprite).color = col;
    if (!was) {
      Tween.stopAllByTarget(this.comboRow);
      Tween.stopAllByTarget(opacity(this.comboRow));
      at(this.comboRow, COMBO_X, Screen.top - 52);
      opacity(this.comboRow).opacity = 255;
      fx.popIn(this.comboRow, 0, 0.25);
    }
    // 数字砸下来：放大 2 倍、略歪，回弹到正（纯数字允许 ±4° 倾斜，docs/03）
    const ln = this.comboNum;
    Tween.stopAllByTarget(ln);
    ln.setScale(2, 2, 1);
    ln.angle = (Math.random() - 0.5) * 8;
    tween(ln).to(0.26, { scale: new Vec3(1, 1, 1), angle: 0 }, { easing: 'backOut' }).start();
    // 整块顿一下、背后的光闪一下
    const bd = this.comboBadge;
    Tween.stopAllByTarget(bd);
    bd.setScale(1.14, 1.14, 1);
    tween(bd).to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
    const gop = opacity(this.comboGlow);
    Tween.stopAllByTarget(gop);
    gop.opacity = 255;
    tween(gop).to(0.4, { opacity: 140 }).start();
    const cx = COMBO_X;
    const cy = Screen.top - 52;
    fx.ring(this.fly, cx, cy, 70, 200 + r.tier * 30, col);
    fx.sparkle(this.fly, cx, cy, 6 + Math.min(r.count, 10), 110, col, 28);
    // 满屏跟着这一击动：鱼缸炸一圈档位色的光和火花、冒出大号「×N」，整个场面顿一下，四边光框闪一下
    fx.glowPop(this.fly, bowlX, this.bowlY, 260 + r.tier * 40, col, 0.3, 220);
    fx.ring(this.fly, bowlX, this.bowlY, 80, 240 + r.tier * 40, col);
    fx.sparkle(this.fly, bowlX, this.bowlY, 8 + r.tier * 2, 130 + r.tier * 15, col, 30);
    this.hitPop(bowlX, `×${r.count}`, 46 + r.tier * 8);
    fx.punch(this.stage, 1.008 + r.tier * 0.004);
    this.setFever(r.tier, col);
    this.pulseFrame();
    if (r.tier_up) this.praise(tr(eco.combo.tiers[r.tier].key), r.tier, col);
    if (r.card) Flow.comboCard(this);
  }

  /** 鱼缸上方冒一个数字：略歪着弹出来，往上飘、淡出 */
  private hitPop(x: number, s: string, size0: number): void {
    const n = box('pop', null);
    artNumber(n, s, size0);
    n.angle = (Math.random() - 0.5) * 14;
    fx.floatUp(this.fly, n, x, this.bowlY + 16, 48, 0.55);
  }

  /**
   * 连击「满屏」的常驻部分：四边光框、背景放射光、往上冒的光点，随档位换色、越高越亮越快；tier < 0 全部收掉。
   * 光点在 update 里按 FEVER[tier].rise 的频率冒
   */
  private setFever(tier: number, col: Color): void {
    if (tier === this.comboTier) return;
    this.comboTier = tier;
    this.comboColor = col;
    const fop = opacity(this.frame);
    const rop = opacity(this.feverRays);
    Tween.stopAllByTarget(fop);
    Tween.stopAllByTarget(rop);
    if (tier < 0) {
      this.frameHi = 0;
      tween(fop).to(0.3, { opacity: 0 }).start();
      tween(rop).to(0.4, { opacity: 0 }).start();
      return;
    }
    const f = FEVER[Math.min(tier, FEVER.length - 1)];
    for (const g of this.frame.children) (g.getComponent(Sprite) as Sprite).color = col;
    (this.feverRays.getComponent(Sprite) as Sprite).color = col;
    this.frameHi = f.frame;
    this.breatheFrame();
    tween(rop).to(0.4, { opacity: f.rays }).start();
    Tween.stopAllByTarget(this.feverRays);
    tween(this.feverRays).repeatForever(tween(this.feverRays).by(f.turn, { angle: -360 })).start();
  }

  /** 光框呼吸：在档位亮度和它的六成之间来回 */
  private breatheFrame(): void {
    const op = opacity(this.frame);
    const hi = this.frameHi;
    const period = 1.1 - Math.max(0, this.comboTier) * 0.18;
    tween(op)
      .to(0.2, { opacity: hi })
      .call(() => {
        tween(op)
          .repeatForever(tween(op).to(period / 2, { opacity: Math.round(hi * 0.6) }).to(period / 2, { opacity: hi }))
          .start();
      })
      .start();
  }

  /** 每次命中：光框瞬间拉到最亮，再回到呼吸 */
  private pulseFrame(): void {
    if (this.frameHi <= 0) return;
    const op = opacity(this.frame);
    Tween.stopAllByTarget(op);
    op.opacity = 255;
    this.breatheFrame();
  }

  /** 冒一个光点：从屏幕底下往上飘。大多垫在玩法后面；少数在最前面，只走屏幕两侧，不挡中间的鱼 */
  private spawnRise(): void {
    const tier = Math.max(0, this.comboTier);
    const front = Math.random() < 0.3;
    const bubble = Math.random() < 0.3;
    const s0 = front ? 16 + Math.random() * 16 : 22 + Math.random() * 30;
    const n = img(front ? this.fly : this.under, bubble ? 'kit/bubble_small' : 'kit/fx_spark', s0, s0, 'rise');
    if (!bubble) (n.getComponent(Sprite) as Sprite).color = this.comboColor;
    const half = Screen.W / 2;
    const x = front ? (Math.random() < 0.5 ? -1 : 1) * (half - 10 - Math.random() * 70) : (Math.random() - 0.5) * Screen.W;
    const y0 = Screen.bottom - 30;
    const y1 = Screen.bottom + Screen.H * (0.55 + Math.random() * 0.5);
    const dur = (1.5 + Math.random() * 0.9) * (1 - tier * 0.1);
    at(n, x, y0);
    const op = opacity(n);
    op.opacity = front ? 190 : 235;
    tween(n)
      .to(dur, { position: new Vec3(x + (Math.random() - 0.5) * 90, y1, 0), angle: bubble ? 0 : 200 }, { easing: 'quadOut' })
      .call(() => n.destroy())
      .start();
    tween(op).delay(dur * 0.55).to(dur * 0.45, { opacity: 0 }).start();
  }

  /** 一发烟花：柔光一闪、两圈光环、一大一小两圈火花 */
  private boom(x: number, y: number, col: Color, loud = true): void {
    fx.glowPop(this.fly, x, y, 380, col, 0.3);
    fx.ring(this.fly, x, y, 60, 420, col);
    fx.ring(this.fly, x, y, 30, 240, COLOR.white);
    fx.sparkle(this.fly, x, y, 26, 280, col, 52);
    fx.sparkle(this.fly, x, y, 12, 140, COLOR.white, 30);
    if (loud) sfx('firework');
  }

  /**
   * 连击升档（docs/01 3.2）：整屏一起动——
   * 夸奖词从大砸下来（背后档位色柔光 + 爆炸星，不用飘带，用户 2026-11-16）；同一刻全屏闪档位色、放射光炸开到整屏、两圈冲击波、
   * 屏幕震、全场气泡跟着波纹鼓一下、鱼缸依次跳一下、两个下角喷彩纸；红档以上再炸几发烟花。
   * 升档音按档位换（越高越长越亮），震动中 / 重。停一下后夸奖词缩小飞进顶上的连击计
   */
  private praise(word: string, tier: number, col: Color): void {
    const y = this.fieldTop - 150;
    if (this.praiseNode?.isValid) this.praiseNode.destroy();
    const holder = box('praise', this.fly, 600, 220);
    this.praiseNode = holder;
    at(holder, 0, y);
    // 背后：档位色柔光 + Codex 画的爆炸星（慢慢转）；字：中文用 Codex 艺术字，其它语言用字
    const glow = img(holder, 'kit/fx_glow', 700, 400, 'glow');
    (glow.getComponent(Sprite) as Sprite).color = col;
    glow.setScale(0.3, 0.3, 1);
    tween(glow).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    const star = img(holder, 'skin/j_burst', 400, 429, 'burst');
    star.setScale(0.2, 0.2, 1);
    tween(star).to(0.2, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'quadOut' }).to(0.12, { scale: new Vec3(1, 1, 1) }).start();
    tween(star).by(1.4, { angle: -50 }).start();
    const ww = 560;
    const l = {
      node:
        language() === 'zh_CN'
          ? img(holder, `skin/j_praise_${tier + 1}`, ww, (ww * (tier === 2 ? 341 : 381)) / 660, 'word')
          : text(holder, word, 92, { color: PRAISE_FILL[tier] ?? COLOR.white, outline: COLOR.navy, outlineWidth: 8 }).node,
    };
    at(l.node, 0, 6);
    l.node.setScale(2.4, 2.4, 1);
    l.node.angle = -8;
    const lop = opacity(l.node);
    lop.opacity = 0;
    tween(lop).to(0.08, { opacity: 255 }).start();
    tween(l.node)
      .to(0.15, { scale: new Vec3(0.9, 0.9, 1), angle: 0 }, { easing: 'quadIn' })
      .call(() => this.praiseImpact(y, tier, col))
      .to(0.14, { scale: new Vec3(1.06, 1.06, 1) }, { easing: 'quadOut' })
      .to(0.1, { scale: new Vec3(1, 1, 1) })
      .start();
    // 停一下，缩小飞进连击计
    const cx = COMBO_X;
    const cy = Screen.top - 52;
    fx.delay(this.fly, 0.9, () => {
      if (!holder.isValid) return;
      fx.flyArc(
        holder,
        cx,
        cy,
        0.3,
        40,
        'quadIn',
        () => {
          holder.destroy();
          if (!this.comboRow.active) return;
          const bd = this.comboBadge;
          Tween.stopAllByTarget(bd);
          bd.setScale(1.3, 1.3, 1);
          tween(bd).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
          fx.sparkle(this.fly, cx, cy, 12, 140, col, 32);
        },
        0.15,
      );
      tween(opacity(holder)).delay(0.14).to(0.16, { opacity: 0 }).start();
    });
    sfx('tier', tier + 1);
  }

  /** 夸奖词落地的那一下：整屏的冲击都在这一帧 */
  private praiseImpact(y: number, tier: number, col: Color): void {
    const half = Screen.W / 2;
    const reach = Math.hypot(Screen.W, Screen.H);
    buzz(tier >= 2 ? 'heavy' : 'medium');
    fx.trauma(this.stage, 0.5 + tier * 0.12, 20);
    fx.flash(this.fly, Screen.W, Screen.H, 90 + tier * 25, col);
    fx.rayBurst(this.fly, 0, y, reach * 1.2, col, 0.6, 190);
    fx.ring(this.fly, 0, y, 140, reach * 1.1, col, 0.55);
    fx.ring(this.fly, 0, y, 100, 620, COLOR.white, 0.4);
    fx.sparkle(this.fly, 0, y, 18 + tier * 4, 340, col, 44);
    fx.sparkle(this.fly, 0, y, 10 + tier * 2, 180, COLOR.white, 30);
    // 两个下角往中间喷彩纸
    const n = 16 + tier * 10;
    fx.cannon(this.fly, -half - 10, this.fieldBottom - 20, 66, n, 900 + tier * 110);
    fx.cannon(this.fly, half + 10, this.fieldBottom - 20, 114, n, 900 + tier * 110);
    // 全场气泡从夸奖词往外鼓一圈；鱼缸依次跳一下
    const holder = this.field.node.parent as Node;
    this.field.ripple(-holder.position.x, y - holder.position.y, 0.1 + tier * 0.02);
    this.bowls.forEach((v, i) => {
      if (!v || v.done || Math.abs(v.node.position.y - this.bowlY) > 1) return;
      Tween.stopAllByTag(HOP_TAG, v.node);
      const x = this.bowlX[i];
      tween(v.node)
        .tag(HOP_TAG)
        .delay(0.05 + i * 0.05)
        .to(0.1, { position: new Vec3(x, this.bowlY + 18, 0) }, { easing: 'quadOut' })
        .to(0.16, { position: new Vec3(x, this.bowlY, 0) }, { easing: 'bounceOut' })
        .start();
    });
    // 红档、紫档：场地里再炸几发烟花
    const mid = (this.fieldTop + this.fieldBottom) / 2;
    const span = (this.fieldTop - this.fieldBottom) / 2;
    for (let i = 0; i < (tier >= 3 ? 5 : tier >= 2 ? 3 : 0); i++) {
      fx.delay(this.fly, 0.12 + i * 0.14, () => {
        this.boom((Math.random() - 0.5) * (Screen.W - 160), mid + (Math.random() - 0.5) * span * 1.4, COMBO_COLORS[(tier + i) % COMBO_COLORS.length], i % 2 === 0);
        if (i === 0) buzz('medium');
      });
    }
  }

  /** 过关庆祝（局内）：闪白、放射光、屏幕震、两个下角喷彩纸、四发烟花；连击计和连击的满屏效果收掉 */
  private celebrate(): void {
    this.comboRow.active = false;
    this.setFever(-1, COLOR.white);
    const mid = (this.fieldTop + this.fieldBottom) / 2;
    const half = Screen.W / 2;
    fx.flash(this.fly, Screen.W, Screen.H, 170);
    fx.rayBurst(this.fly, 0, mid, Math.hypot(Screen.W, Screen.H) * 1.2, COLOR.yellow, 0.8, 170);
    fx.ring(this.fly, 0, mid, 140, Screen.H * 1.2, COLOR.white, 0.6);
    fx.trauma(this.stage, 0.6, 20);
    fx.cannon(this.fly, -half - 10, this.fieldBottom - 20, 68, 60, 1250);
    fx.cannon(this.fly, half + 10, this.fieldBottom - 20, 112, 60, 1250);
    const cols = [new Color(255, 214, 64), new Color(110, 215, 255), new Color(255, 120, 200), new Color(140, 255, 120)];
    [[-160, mid + 200], [180, mid + 90], [-40, mid - 60], [150, mid - 220]].forEach(([x, y], i) => {
      fx.delay(this.fly, 0.1 + i * 0.2, () => {
        this.boom(x, y, cols[i]);
        buzz('light');
      });
    });
    buzz('heavy');
  }

  private missCombo(): void {
    const had = this.comboRow.active && !this.comboBreaking;
    this.combo.miss();
    this.setFever(-1, COLOR.white);
    if (!had) return;
    // 断连：一声往下走的闷音，数字变灰，整块抖一下往下掉、淡出
    sfx('comboBreak', 0, 0.8);
    this.comboBreaking = true;
    for (const g of this.comboNum.children) {
      const sp = g.getComponent(Sprite);
      if (sp) sp.grayscale = true;
    }
    const row = this.comboRow;
    Tween.stopAllByTarget(row);
    const x = COMBO_X;
    const y = Screen.top - 52;
    tween(row)
      .to(0.05, { position: new Vec3(x - 6, y, 0) })
      .to(0.05, { position: new Vec3(x + 6, y, 0) })
      .to(0.05, { position: new Vec3(x, y, 0) })
      .to(0.25, { position: new Vec3(x, y - 24, 0) }, { easing: 'quadIn' })
      .call(() => {
        this.comboBreaking = false;
        row.active = false;
        at(row, x, y);
        opacity(row).opacity = 255;
      })
      .start();
    const op = opacity(row);
    Tween.stopAllByTarget(op);
    tween(op).delay(0.15).to(0.25, { opacity: 0 }).start();
  }

  // ---------------------------------------------------------------- 每帧

  private update(dt: number): void {
    if (!this.node?.active || !this.s || this.ended) return;
    // 弹窗开着（提示、开缸位、买技能…）时局内暂停：限时缸不走、代打不点
    if (this.paused || ui.currentName !== 'game' || popupCount() > 0) return;
    this.clock += dt;
    // 连击倒计时细条
    if (this.comboRow.active && !this.comboBreaking) {
      const left = Math.max(0, 1 - (this.clock - this.lastHit()) / App.config.eco.combo.windowSeconds);
      size(this.comboBar, this.comboBarW * left, 7);
      if (left <= 0) this.missCombo();
    }
    // 连击中：光点按档位的频率往上冒
    if (this.comboTier >= 0) {
      this.riseT += dt * FEVER[Math.min(this.comboTier, FEVER.length - 1)].rise;
      while (this.riseT >= 1) {
        this.riseT -= 1;
        this.spawnRise();
      }
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
    if (!this.hintNode && !this.tutorNode && this.idle > wait && this.s.status === Status.PLAYING) this.showHint();
    if (this.tutor && !this.tutorNode) Flow.checkTutorial(this);
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
    // 教学关：再加一只手指点着它（docs/01 第 8 节：手指指向目标鱼）
    if (this.hintNode && this.arg.level <= App.config.ui.hint.tutorialLevels) addFinger(this.hintNode);
  }

  /** 新技能教学：压暗全屏，只留这个技能键能点，上方一句「试试新技能」+ 手指 */
  startTutorial(id: string, onUse: () => void): void {
    const v = this.skillNodes.get(id as SkillId);
    if (!v || this.tutorNode) return;
    this.clearHint();
    const layer = box('tutor', this.stage, Screen.W * 2, Screen.H * 2);
    this.tutorNode = layer;
    const shade = tint(layer, Screen.W * 2, Screen.H * 2, new Color(2, 16, 46, 160), 'shade');
    blockInput(shade);
    opacity(shade).opacity = 0;
    tween(opacity(shade)).to(0.2, { opacity: 255 }).start();
    const p = v.node.position;
    const ring = img(layer, 'kit/fx_ring', 190, 190, 'ring');
    (ring.getComponent(Sprite) as Sprite).color = new Color(255, 243, 107, 255);
    at(ring, p.x, p.y + 10);
    fx.breathe(ring, 0.15, 0.8);
    const copy = img(layer, `icon/skill_${id}`, 130, 130, 'icon');
    at(copy, p.x, p.y + 26);
    onTap(copy, () => {
      this.endTutorial();
      onUse();
    });
    const tip = text(layer, tr('UI_SKILL_TRY', tr(`H_SKILL_${id === 'current' ? 'FLOW' : id.toUpperCase()}`)), 40, { color: COLOR.yellow });
    at(tip.node, 0, p.y + 190);
    fx.popIn(tip.node, 0.1, 0.25);
    addFinger(copy);
    sfx('unlock');
  }

  endTutorial(): void {
    this.tutor = '';
    this.tutorNode?.destroy();
    this.tutorNode = null;
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

/** 手指：指尖点在 target 中心偏下，上下点动 */
function addFinger(target: Node): void {
  const f = img(target, 'skin/j_finger', 84, 120, 'finger');
  // 图里指尖在宽度 30%、最顶上：让指尖落在目标中心下方一点
  const x = 42 - 0.3 * 84;
  const y = -60 - 20;
  at(f, x + 6, y);
  f.angle = 18;
  tween(f)
    .repeatForever(
      tween(f)
        .to(0.35, { position: new Vec3(x + 6, y + 18, 0), scale: new Vec3(0.92, 0.92, 1) }, { easing: 'quadOut' })
        .to(0.35, { position: new Vec3(x + 6, y, 0), scale: new Vec3(1, 1, 1) }, { easing: 'quadIn' }),
    )
    .start();
}
