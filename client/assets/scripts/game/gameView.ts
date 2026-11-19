// 局内页面（定版图 12）。逻辑在 core 里立即结算，这里按事件播表现（docs/09 第 6 节：动画不挡操作）。
// 版式：顶栏（进度 · 连击 · 关卡号 · 设置）→ 木架鱼缸 → 暂存槽 → 场地（尽量大）→ 技能栏。
import { Color, Label, Node, Sprite, Tween, UITransform, Vec3, tween } from 'cc';
import { Combo } from '../core/meta/combo';
import * as Daily from '../core/meta/daily';
import * as LevelChest from '../core/meta/levelChest';
import * as Lucky from '../core/meta/lucky';
import * as Stars from '../core/meta/stars';
import * as Features from '../core/meta/features';
import * as LevelCurve from '../core/gen/levelCurve';
import * as Meta from '../core/meta/meta';
import * as Seas from '../core/meta/seas';
import * as Skills from '../core/meta/skills';
import { pickSpecies } from '../core/model/speciesPick';
import { Bowl, GameState, MAX_SLOTS, NO_TIMER, RETURN_BUBBLE, Status } from '../core/model/gameState';
import { LevelData, Tap } from '../core/model/levelData';
import { Rng } from '../core/rng/rng';
import * as AutoFinish from '../core/rules/autoFinish';
import * as Rules from '../core/rules/rules';
import type { GameEvent } from '../core/rules/rules';
import * as Bots from '../core/solver/bots';
import * as Players from '../core/solver/players';
import * as Route from '../core/solver/route';
import { App } from '../services/app';
import { buzz, sfx } from '../services/audio';
import { today } from '../services/clock';
import * as fx from '../ui/fx';
import * as Alive from '../ui/alive';
import { language, tr } from '../ui/i18n';
import { artNumber, at, blockInput, box, Capsule, capsule, COLOR, fit, iconButton, img, keyButton, lazyImg, onTap, opacity, resizeSlice, setImg, setSlice, slice, text, textWidth, tint, plate } from '../ui/kit';
import { Screen } from '../ui/screen';
import { loadFrames } from '../ui/res';
import { popupCount } from '../ui/popup';
import { CARD_ASPECT, RARITY_GLOW, miniCard, speciesName } from '../ui/popups';
import { Page, ui } from '../ui/shell';
import { Field } from './field';
import * as Flow from './flow';
import { lab } from '../devtools/levelLab';
import { labBuffer } from './labHooks';
import { KIND_STYLE, kindBanner, kindTag, levelKind } from './levelKind';
import * as ComboGoal from '../core/meta/comboGoal';

export interface GameArg {
  level: number;
  daily?: boolean;
  /**
   * 难度调试页的演示（docs/01 9.7）：电脑替玩家点，每一步先圈出要点的那条鱼。不记成绩、不扣命。
   * route = 按关卡文件里的参考解（想清楚的玩家赢下来的路线，能走完就证明这一档一定过得去）；
   * casual = 现场按「正常打法」打一局（每次随机，输赢都有，看正常打法是怎么输的）
   */
  demo?: 'route' | 'casual';
}

interface BowlView {
  node: Node;
  /** 缸里已经进来的鱼（空缸是空的） */
  inside: Node;
  /** 木架下面钉着的目标卡：要的那种鱼 +「进了几条 / 要几条」 */
  tag: Node;
  tagLabel: Label;
  got: number;
  sp: number;
  timer: Node | null;
  timerLabel: Label | null;
  shown: number;
  cap: number;
  /** 还在路上、要进这个缸的鱼 */
  incoming: number;
  done: boolean;
  /** 坐在木架上时节点的 y（大缸更高，中心比普通缸高一点） */
  restY: number;
  /** 缸的显示高度 */
  h: number;
  /** 满缸后正在飘走 */
  leaving: boolean;
}

/** 技能栏从左到右（docs/ux/route-2026-11-19.md 第 4 节）：撤销、提示在最左，后面四个是原来的 */
const SKILLS = ['undo', 'hint', 'shuffle', 'blow', 'net', 'current'] as const;
type SkillId = (typeof SKILLS)[number];

/** 撤销用的存档：点之前的局面、每个气泡当时在哪、开局占格还剩几条在暂存槽里 */
interface UndoSnap {
  s: GameState;
  pos: ([number, number] | null)[];
  prefill: number;
}

/** 连击四档的颜色（docs/01 3.2：蓝、金、红、紫） */
const COMBO_COLORS = [new Color(110, 215, 255), new Color(255, 214, 64), new Color(255, 110, 80), new Color(214, 130, 255)];
/** 限时关连击加时间飘的「+N」的颜色 */
const CLOCK_PLUS = new Color(130, 245, 140);
/** 升档夸奖词的字色：压在蓝色飘带上要看得清，比档位色更亮 */
const PRAISE_FILL = [new Color(150, 240, 255), new Color(255, 222, 70), new Color(255, 150, 120), new Color(235, 170, 255)];
/** 连击「满屏」的强度，按档位（docs/01 3.2）：四边光框的亮度、背景放射光的亮度和转一圈的秒数、每秒冒几个光点 */
const FEVER = [
  { frame: 150, rays: 60, turn: 16, rise: 6 },
  { frame: 180, rays: 85, turn: 11, rise: 10 },
  { frame: 210, rays: 110, turn: 8, rise: 14 },
  { frame: 240, rays: 135, turn: 5.5, rise: 18 },
];
const HOP_TAG = 9102;
/** 鱼游动时拖的光带、星光的颜色 */
const TRAIL = new Color(190, 235, 255, 255);
/** 普通鱼缸的宽、高（大鱼缸宽 BOWL_BIG），木架的厚度、缸底压进木架上沿多少。
 * 上面这一段（鱼缸、木架、目标卡、暂存槽）收得紧一点，地方留给气泡场：鱼和气泡不能小（用户 2026-11-17） */
const BOWL_W = 136;
const BOWL_BIG = 154;
const BOWL_H = 126;
const SHELF_H = 38;
const BOWL_SINK = 5;

/** 背景冒泡循环的 tween 标签（换关时只停这个，不碰别的） */
const AMBIENT_TAG = 9201;
/** 夸奖字出现时让连击计让开的 tween 标签 */
const PRAISE_TAG = 9202;
/** 技能键（半透明格子）多大、两个键之间隔多少：6 个键一行（6 × 104 + 5 × 16 = 704） */
const SKILL_S = 104;
const SKILL_GAP = 16;
/** 开局占格的那几条鱼所在的暂存格：底色压深一点（「这是关卡给的」） */
const PREFILL_SLOT = new Color(55, 85, 160, 255);
/** 「接下来」预告：小牌多大、两个之间隔多少 */
const NEXT_S = 46;
const NEXT_STEP = 50;
/** 技能数量角标的最小宽、高 */
const BADGE_W = 42;
const BADGE_H = 36;
/** 鱼缸的目标卡（钉在木架下面）多大；顶上的图钉往上压进木架多少 */
const GOAL_W = 140;
const GOAL_H = 122;
const GOAL_PIN = 18;
/** 暂存格的高；它和目标卡、和气泡场之间留多少 */
const SLOT_H = 86;
const SLOT_GAP = 8;
/** 鱼缸的上沿离屏幕顶多远（上面是顶栏那一行） */
const BOWL_TOP = 92;

/** 秒数写成 m:ss */
function mmss(sec: number): string {
  const t = Math.max(0, Math.ceil(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

export class GamePage extends Page {
  // 一局的状态
  lv!: LevelData;
  s!: GameState;
  arg!: GameArg;
  species: string[] = [];
  combo = new Combo();
  /** 局内时钟（秒），连击窗口用 */
  clock = 0;
  moved = false;
  /** 这一局的每日任务进度记过了没有（Flow.endRun） */
  tallied = false;
  ended = false;
  paused = false;
  used: Record<string, number> = {};
  /** 强制教学用掉的那几次（不算进星级的道具数，docs/01 9.5） */
  freebies = 0;
  /** 技能以外算「用了道具」的：加开鱼缸、复活，各算一次 */
  extras = 0;
  /** 这一关的关卡文件号 */
  private file = 0;
  /** 撤销：上一步点之前的局面（null = 没得撤销：还没点，或上一步是用道具） */
  private undoSnap: UndoSnap | null = null;
  /** 每次整个重画加一：重画之前还在路上的鱼到了以后不再结算 */
  private epoch = 0;
  /** 开局占格的鱼还有几条在暂存槽里（它们总在最前面几格） */
  private prefillLeft = 0;
  /** 「接下来」预告：底板、每张订单的小牌（键 = 订单号） */
  private nextRow: Node | null = null;
  private nextChips = new Map<number, Node>();
  /** 幸运泡（docs/01 9.3）：这一局抽到的、奖励拿了没有 */
  private lucky: { plan: Lucky.LuckyPlan; done: boolean } | null = null;
  /** 掉落关「下一个落下」预告 */
  private dropNext: Node | null = null;
  private dropShown = -2;

  /** 星级按它算：这一关用了几样道具（技能 + 加开鱼缸 + 复活，强制教学那几次不算） */
  get items(): number {
    return Math.max(0, this.usedAll - this.freebies) + this.extras;
  }

  get canUndo(): boolean {
    return this.undoSnap !== null;
  }

  /** 本关各种技能合计已用几次 */
  get usedAll(): number {
    return Object.values(this.used).reduce((a, b) => a + b, 0);
  }

  /** 这一关的关卡号，每日挑战是 0（「前几关第一次用技能免费」不算每日挑战，见 Skills.levelFree） */
  get freeLevelId(): number {
    return this.arg.daily ? 0 : this.arg.level;
  }

  /** 这个技能现在点了是不是免费：本关第一次（前几关）或今天的免费次 */
  skillFree(id: string): boolean {
    const eco = App.config.eco;
    return Skills.levelFree(eco, this.freeLevelId, this.usedAll) || Skills.freeAvailable(App.save.data, id, eco);
  }
  netMode = false;
  // 画面
  private bg!: Node;
  /** 场景和玩法之间的一层：连击时的放射光、往上冒的光点 */
  private under!: Node;
  private stage!: Node;
  private fly!: Node;
  private field!: Field;
  private progress!: Capsule;
  /** 限时关的倒计时条（顶栏正中）；不限时的关没有 */
  private clockCap: Capsule | null = null;
  private clockWarn = false;
  private comboRow!: Node;
  private comboBadge!: Node;
  private comboNum!: Node;
  private comboWord!: Node;
  private comboWordW = 78;
  /** 连击计的位置：屏幕正中、鱼缸那一排 */
  private comboX = 0;
  private comboY = 0;
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
  /** 木架上沿的 y：鱼缸底落在这条线上 */
  private shelfTop = 0;
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
  /** 这关宝箱开局定好的结果（docs/01 3.4）；开出卡时那只生物困在 guest.bubble 号气泡里当稀客，过关时按它入账 */
  chestPlan: LevelChest.ChestPlan | null = null;
  private guest: { bubble: number; id: string; node: Node; saved: boolean } | null = null;
  /** 收尾自动入缸：算好的点击顺序（null = 不是收尾，玩家自己点） */
  private autoTaps: AutoFinish.AutoTap[] | null = null;
  /** 演示要点的走法（GameArg.demo），点到第几步、这一步等了多久 */
  private demoTaps: Tap[] = [];
  demoStep = 0;
  private demoT = 0;
  private demoArmed = false;
  /** 正常打法演示：第几步（下标）点完就不用道具过不去了，-1 = 没有 */
  demoFatal = -1;
  /** 连击目标（docs/01 9.4）：N（0 = 这一关没有）、达到了没有、木架下面最右边的常驻小标、连击计后面的「/N」 */
  comboGoal = 0;
  goalReached = false;
  private goalPill: Capsule | null = null;
  private goalTail: Label | null = null;
  /** 顶栏的难关小牌子、开局横幅（docs/ux/level-types.md） */
  private kindTagNode: Node | null = null;
  private kindBannerNode: Node | null = null;
  private autoT = 0;
  private rng = new Rng(Date.now() >>> 0);
  private warned = new Set<Node>();
  private nudged = new Set<string>();
  /** 小手现在放在哪个节点上（某个道具键，或加鱼缸的「＋」） */
  private pointedNode: Node | null = null;
  private fieldTop = 0;
  private fieldBottom = 0;
  private total = 0;

  /** 这一局已经救了几只 */
  get rescued(): number {
    return this.s ? this.total - this.s.fishLeft() : 0;
  }

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
    const ease = this.arg.daily || this.arg.demo ? 0 : Meta.easeFor(save.data, eco, id);
    // 关卡文件和这关的鱼：微信版放在网上，用到时才下（docs/04 第 8 节）。下不下来就提示、回主页（不扣命）
    let species: string[];
    try {
      this.lv = await config.loadLevel(file, ease, !!this.arg.daily);
      const pools = Seas.speciesPools(eco, Seas.forLevel(eco, file));
      species = pickSpecies(config.species, this.lv.levelSeed + (this.arg.daily ? today() : 0), this.lv.palette, LevelCurve.colorGap(config.curve, file), pools);
      await loadFrames(species.map((sp) => `fish/${sp}`));
    } catch (e) {
      console.warn('关卡读不出来', e);
      ui.toast(tr('BOOT_FAIL'));
      ui.go('home');
      return;
    } finally {
      ui.busy(false);
    }
    this.s = GameState.fromLevel(this.lv);
    // 测试包的整体难度档（设置 → 难度调试，docs/01 9.7）：暂存槽多一格 / 少一格
    // 演示按关卡原样打（暂存槽、缸位都照关卡文件），参考解才对得上
    if (lab.enabled && !this.arg.demo) this.s.bufferCap = labBuffer(this.s.bufferCap);
    // 限时关（docs/01 第 4 节）：整关倒计时，走第一步才开始走（规则在 tick 里倒数）；每日挑战不限时
    this.s.clock = this.arg.daily || this.arg.demo ? NO_TIMER : LevelCurve.clockFor(config.curve, file, this.lv);
    // 连输 4 次送第 3 缸位（docs/01 5.7）；调试页换了档的关不送：试的就是这一档原样的难度
    if (!this.arg.daily && !this.arg.demo && !lab.picks.has(file)) this.s.openSlots = Meta.openSlotsFor(save.data, eco, id, this.lv.bowlSlots);
    // 加开的缸只装一缸就收走（docs/01 2.4）
    this.s.bowlOnce = eco.bowlSlotOnce === true;
    // 这一关的几种生物：颜色至少差 colorGap（前面的关卡差得很开，越往后越接近，docs/02 第 2.1 节）
    // 先挑这片海域的，凑不够再从前面的海域借（docs/01 5.0）
    this.species = species;
    // 连击目标：每日挑战、演示、重打（第一次通关才给）都没有
    const replay = this.arg.level < save.data.level;
    this.comboGoal = this.arg.daily || this.arg.demo || replay ? 0 : ComboGoal.goalFor(this.lv, eco, this.arg.level);
    this.goalReached = false;
    this.combo = new Combo();
    this.comboTier = -1;
    this.comboBreaking = false;
    this.clock = 0;
    this.moved = false;
    this.autoTaps = null;
    this.demoTaps = this.arg.demo === 'route' ? this.lv.ref.slice() : this.arg.demo === 'casual' ? Players.play(this.lv, 'casual', Math.floor(Math.random() * 1e9), { preview: config.curve.route?.preview ?? 0 }).taps : [];
    this.demoStep = 0;
    this.demoT = 0;
    this.demoArmed = false;
    // 正常打法演示：先算出它在哪一步走错（点完那一步就过不去了），演到那一步时用红圈标出来（第 6 关约 5 毫秒）
    this.demoFatal = this.arg.demo === 'casual' ? Route.firstDead(this.lv, this.demoTaps) : -1;
    this.tallied = false;
    this.ended = false;
    this.paused = false;
    this.netMode = false;
    this.used = {};
    this.freebies = 0;
    this.extras = 0;
    this.undoSnap = null;
    this.lucky = null;
    this.file = file;
    this.prefillLeft = this.s.buffer.length;
    this.idle = 0;
    this.total = this.s.fishLeft();
    this.layout(file);
    this.planChest();
    this.planLucky();
    const ev = Rules.start(this.s);
    this.play(ev, true);
    Flow.onLevelStart(this);
  }

  // ---------------------------------------------------------------- 版式

  /** snap = 撤销：按存下来的局面整个重画，不播开局的进场 */
  private layout(file: number, snap: UndoSnap | null = null): void {
    this.epoch++;
    this.nextRow = null;
    this.nextChips.clear();
    this.dropNext = null;
    this.dropShown = -2;
    this.kindBannerNode = null;
    this.praiseNode = null;
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
    this.pointedNode = null;
    this.plusNodes = [];
    this.skillNodes.clear();
    this.hintNode = null;
    this.tutorNode = null;
    const eco = App.config.eco;
    const sea = eco.seas?.[Seas.forLevel(eco, file)]?.id ?? 'shore';
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(this.bg, `bg/sea_${sea}`, (bgH * 1024) / 1536, bgH);
    // 换关重建版式时先停掉上一关的冒泡循环，不然一关一关叠上去
    Tween.stopAllByTag(AMBIENT_TAG, this.under);
    this.ambientBubbles();

    // 顶栏：左进度、中倒计时（限时关）、右关卡号 + 设置。
    // 微信小游戏（有胶囊按钮）：顶栏挪到胶囊那一行（用户 2026-11-18：上面太空），设置键放最左、进度紧跟着（样式不变），
    // 关卡号去掉底板、居中；限时关中间放倒计时，关卡号不显示（暂停弹窗里有）。下面的鱼缸、气泡跟着整体上移
    // App（没有胶囊）：整行都在系统安全区里，不伸进刘海那一截（用户 2026-11-19：按安全区来，不破坏安全区）。
    // 有刘海时安全区本身已经离屏幕边有一截，顶栏上沿贴着安全区只留 8；没有刘海时离顶 19（中线 = 顶 − 52）
    const hudY = Screen.cap ? Screen.headY : Screen.top - (Screen.notchTop > 0 ? 33 + 8 : 52);
    const top = hudY + 52;
    // 左上的进度：已经送进鱼缸的鱼 / 这一关一共几条。图标是通用的小鱼（白色平面图标），不用某一种鱼（用户 2026-11-17：放螃蟹像是要救 33 只螃蟹）。
    // 顶上两块信息条都是半透明深蓝 + 白字，和技能格子一样，不用白色卡片（用户 2026-11-17：白卡片显得廉价）
    const levelName = this.arg.daily ? tr('UI_TAB_DAILY') : tr('UI_LEVEL', this.arg.level);
    let progressRight = -Screen.W / 2;
    // 右边界：微信停在胶囊左边的圆按钮前，App 停在右上的设置键前
    const rightEdge = Screen.cap ? Screen.headRight : Screen.W / 2 - 24 - 74 - 12;
    const midX = (w: number): number => Math.min(rightEdge - w / 2, Math.max(0, progressRight + 12 + w / 2));
    const timed = this.s.clock !== NO_TIMER;
    if (Screen.cap) {
      const h = Screen.headH;
      // 设置键和子页面的返回键一样大（用户 2026-11-18：太小）
      const gearW = 76;
      const pw = Math.round((196 * h) / 66);
      const x0 = -Screen.W / 2 + 24;
      at(iconButton(this.stage, 'kit/round_blue', 'kit/ic_gear', gearW, () => Flow.pause(this)), x0 + gearW / 2, hudY);
      // 宽度贴着内容：按这一关最长的写法（「39/39」）定，整关不变（用户 2026-11-18：右边空太大）
      this.progress = capsule(this.stage, pw, h, 'kit/ic_fish', '', Math.round((34 * h) / 66), 'skin/f_hud', `${this.total}/${this.total}`);
      const realW = (this.progress.node.getComponent(UITransform) as UITransform).width;
      at(this.progress.node, x0 + gearW + 10 + realW / 2, hudY);
      // 中间那块（关卡号 / 倒计时）尽量居中；鱼多的关鱼数条长，碰到它就往右让，但不过胶囊左边的圆按钮
      progressRight = x0 + gearW + 10 + realW;
      // 固定 30 号（和旁边鱼数的字差不多大）：按全部 360 关量过，鱼最多的关（114 条）关卡号也放得下，不用缩字
      this.levelTitle(levelName, hudY, midX, timed);
    } else {
      // 和微信一样：关卡号去掉底板、居中（在刘海下面），限时关中间放倒计时、关卡号不显示；进度在左、设置在右（用户 2026-11-18）
      this.progress = capsule(this.stage, 196, 66, 'kit/ic_fish', '', 34, 'skin/f_hud', `${this.total}/${this.total}`);
      const realW = (this.progress.node.getComponent(UITransform) as UITransform).width;
      at(this.progress.node, -Screen.W / 2 + 24 + realW / 2, hudY);
      progressRight = -Screen.W / 2 + 24 + realW;
      this.levelTitle(levelName, hudY, midX, timed);
    }
    // 限时关：顶栏正中一块倒计时，和两边的信息条同一种深蓝小条；只写时间，不放时钟图标（用户 2026-11-17）
    this.clockCap = null;
    this.clockWarn = false;
    if (timed) {
      const ch = Screen.cap ? Screen.headH : 66;
      this.clockCap = capsule(this.stage, Math.round((120 * ch) / 66), ch, null, mmss(this.s.clock), Math.round((34 * ch) / 66), 'skin/f_hud');
      const cw = (this.clockCap.node.getComponent(UITransform) as UITransform).width;
      at(this.clockCap.node, midX(cw), hudY);
    }
    if (!Screen.cap) {
      const gear = iconButton(this.stage, 'kit/round_blue', 'kit/ic_gear', 74, () => Flow.pause(this));
      at(gear, Screen.W / 2 - 24 - 37, hudY);
    }
    // 连击计（docs/01 3.2，用户 2026-11-16 定）：不带底板的大号「连击 ×N」，下面一条倒计时细条。
    // 放在暂存槽那一排（和下面的 bufferY 同一行）：不盖鱼缸，看得见缸里还差什么（用户 2026-11-16：放在鱼缸那一排把缸盖住了）。
    // 升档的夸奖字也在这一排，出夸奖字时连击计先让开（见 praise）。放在最上面的特效层里，不挡点击
    this.comboY = top - BOWL_TOP - BOWL_H + BOWL_SINK - SHELF_H + GOAL_PIN - GOAL_H - SLOT_GAP - SLOT_H / 2;
    this.comboRow = box('combo', this.fly, 420, 120);
    at(this.comboRow, this.comboX, this.comboY);
    this.comboBadge = box('badge', this.comboRow, 420, 120);
    // 「连击」和数字都是 Codex 画的艺术字（中文用图，其它语言用字）；合成一组居中，每次命中按数字宽度重新摆（见 hitCombo）
    if (language() === 'zh_CN') {
      this.comboWord = img(this.comboBadge, 'skin/j_combo_word', 110, 90, 'word');
      (this.comboWord.getComponent(UITransform) as UITransform).setAnchorPoint(0, 0.5);
      this.comboWordW = 110;
    } else {
      const word = text(this.comboBadge, tr('UI_COMBO_WORD'), 44, { align: 'left' });
      word.updateRenderData(true);
      this.comboWord = word.node;
      this.comboWordW = (word.node.getComponent(UITransform) as UITransform).width;
    }
    this.comboNum = box('num', this.comboBadge);
    this.comboRow.active = false;
    // 连击光框：四边各一条柔光，6 连以上常亮、随档位换色，每次命中闪一下，断连熄灭。盖在玩法上面、不挡点击
    this.frame = box('frame', this.under, Screen.W, Screen.H);
    for (const sx of [-1, 1]) at(img(this.frame, 'kit/fx_glow', 300, Screen.H * 1.2, 'side'), (sx * Screen.W) / 2, 0);
    for (const sy of [-1, 1]) at(img(this.frame, 'kit/fx_glow', Screen.W * 1.2, 280, 'cap'), 0, (sy * Screen.H) / 2);
    opacity(this.frame).opacity = 0;
    // 连击放射光：垫在玩法后面，整屏大，慢慢转
    const raysS = Math.hypot(Screen.W, Screen.H) * 1.15;
    this.feverRays = img(this.under, 'kit/fx_rays', raysS, raysS, 'rays');
    opacity(this.feverRays).opacity = 0;

    // 木架与鱼缸
    // 鱼缸坐在木架上：缸底压进木架上沿几个像素（用户 2026-11-16：原来缸底悬在木架前面，没放在底座上）；
    // 数量牌贴在木架正面
    this.bowlY = top - BOWL_TOP - BOWL_H / 2;
    this.shelfTop = this.bowlY - BOWL_H / 2 + BOWL_SINK;
    const shelfW = Screen.W - 40;
    this.shelf = slice(this.stage, 'kit/shelf', shelfW, SHELF_H, 'shelf');
    at(this.shelf, 0, this.shelfTop - SHELF_H / 2);
    const bw = (shelfW - 30) / MAX_SLOTS;
    this.bowlX = Array.from({ length: MAX_SLOTS }, (_, i) => -shelfW / 2 + 15 + bw * (i + 0.5));
    for (let i = 0; i < MAX_SLOTS; i++) {
      const plus = img(this.stage, 'skin/j_bowl', BOWL_W, BOWL_H, `plus${i}`);
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
    // 连击目标的常驻小标：最右边那个缸位下面的目标卡位置（平时只开 2 个缸，这里空着；开到第 4 个缸就收起来）
    this.goalPill = null;
    if (this.comboGoal > 0) {
      const pill = capsule(this.stage, 150, 56, this.goalIcon(), '', 26, 'skin/f_hud', `${this.comboGoal}/${this.comboGoal}`);
      at(pill.node, this.bowlX[MAX_SLOTS - 1], this.shelfTop - SHELF_H + GOAL_PIN - GOAL_H / 2);
      const cap = text(pill.node, tr('UI_COMBO_WORD'), 20, { color: COLOR.yellow });
      at(cap.node, 0, 44);
      pill.set(`${Math.min(this.combo.best, this.comboGoal)}/${this.comboGoal}`);
      if (this.goalReached) pill.label.color = COLOR.yellow;
      pill.node.active = this.s.openSlots < MAX_SLOTS;
      this.goalPill = pill;
    }

    // 暂存槽
    // 暂存槽在目标卡下面
    this.bufferY = this.shelfTop - SHELF_H + GOAL_PIN - GOAL_H - SLOT_GAP - SLOT_H / 2;
    const cap = this.s.bufferCap;
    const sw = Math.min(124, (Screen.W - 60) / cap - 10);
    for (let i = 0; i < cap; i++) {
      const sl = slice(this.stage, 'kit/slot', sw, SLOT_H, `slot${i}`);
      at(sl, this.slotX(i), this.bufferY);
      this.bufferSlots.push(sl);
    }

    // 技能栏
    // 离底：在安全区里。有手势条时安全区本身已经让出了手势条那一截，只再留 10；没有时离底 26（用户 2026-11-19：按安全区来）
    const skillY = Screen.bottom + (Screen.safeBottom > 0 ? 10 : 26) + SKILL_S / 2;
    SKILLS.forEach((id, i) => this.buildSkill(id, (i - (SKILLS.length - 1) / 2) * (SKILL_S + SKILL_GAP), skillY));

    // 场地：暂存槽和技能栏之间全部高度（用户 2026-11-16：场地尽量大）
    this.fieldTop = this.bufferY - SLOT_H / 2 - SLOT_GAP;
    this.fieldBottom = skillY + SKILL_S / 2 + 18;
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
    this.field.build(this.s, snap ? snap.pos : null);
    // 进场：没遮挡的关卡气泡从上面一个接一个落下来（Field.build 里）；有遮挡的关卡先依次弹出，再由重力压实
    if (!snap && this.field.isLayered) this.field.views.forEach((v, i) => v.node.active && fx.popIn(v.node, 0.15 + Math.floor(i / 4) * 0.12, 0.3));
    // 暂存槽里已经有的鱼：开局占格的那几条从屏幕左边滑进来（docs/ux/route-2026-11-19.md 第 5 节）；撤销重画时直接摆好
    this.bufferNodes = this.s.buffer.map((sp, i) => {
      const f = img(this.fly, this.field.spriteFor(sp), 64, 64, 'fish');
      at(f, this.slotX(i), this.bufferY);
      if (!snap) {
        at(f, -Screen.W / 2 - 60 - i * 40, this.bufferY);
        tween(f)
          .delay(App.config.ui.intro.startDelay + 0.25 + i * 0.14)
          .to(0.38, { position: new Vec3(this.slotX(i), this.bufferY, 0) }, { easing: 'backOut' })
          .call(() => sfx('buffer'))
          .start();
      }
      return f;
    });
    this.buildNext();
    this.syncDrop(false);
    if (snap) this.restoreShelf();
    this.refreshHud();
    this.refreshSkills();
  }

  private slotX(i: number): number {
    const cap = this.s.bufferCap;
    const step = Math.min(134, (Screen.W - 40) / cap);
    return -((cap - 1) * step) / 2 + i * step;
  }

  /**
   * 技能键：四个一样大的半透明深蓝格子里放插画图标（四个图标是 Codex 一张图里画的一套，大小、风格一致；用户 2026-11-17），下面一行小字是名字；右上角红色小标签是数量（免费时写 FREE），
   * 没有了换绿色加号。用户 2026-11-16：原来是四块大蓝按钮，压在场地下面太重；角标也要和整体风格一致
   */
  private buildSkill(id: SkillId, x: number, y: number): void {
    const S = SKILL_S;
    const node = img(this.stage, 'skin/f_skill', S, S, id);
    at(node, x, y);
    const icon = img(node, `icon/skill_${id}`, 76, 76, 'icon');
    at(icon, 0, 11);
    const name = text(node, tr(`H_SKILL_${id === 'current' ? 'FLOW' : id.toUpperCase()}`), 22);
    at(name.node, 0, -37);
    fit(name, S - 8, 22, 15);
    const badge = slice(node, 'kit/tag_red', BADGE_W, BADGE_H, 'badge');
    at(badge, S / 2 - BADGE_W / 2 + 8, S / 2 - 10);
    const count = text(badge, '', 24);
    at(count.node, 0, 2);
    const plus = keyButton(node, 'green', 'kit/ic_plus', 42, null, 0.56);
    at(plus, S / 2 - 12, S / 2 - 10);
    const lock = box('lock', node, S, S);
    const lockIcon = img(lock, 'kit/ic_lock', 38, 38, 'icon');
    at(lockIcon, 0, 12);
    const lockLabel = text(lock, '', 20);
    at(lockLabel.node, 0, -37);
    // 技能格子窄，「第 N 关解锁」放不下；和主页入口一样写「等级 N」，字号不缩（用户 2026-11-18：放不下就精简文字）
    lockLabel.string = tr('H_ENTRY_LOCKED', Skills.unlockLevel(App.config.eco, id));
    fit(lockLabel, S - 8, 22, 14);
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
      const free = this.skillFree(id);
      v.badge.active = unlocked && (n > 0 || free);
      v.plus.active = unlocked && n <= 0 && !free;
      v.count.string = free ? tr('UI_SKILL_FREE') : String(Math.min(n, App.config.ui.badgeCap));
      // 标签跟着字宽走：FREE 比数字宽
      // 6 个键挨得近：「免费」在有的语言里很长（GRATUIT），角标不宽过键本身，字跟着收一点
      fit(v.count, SKILL_S - 26, 24, 16);
      const bw = Math.max(BADGE_W, Math.round(textWidth(v.count) + 20));
      resizeSlice(v.badge, bw, BADGE_H);
      at(v.badge, SKILL_S / 2 - bw / 2 + 8, SKILL_S / 2 - 10);
    }
    this.dimUndo();
  }

  /** 撤销键：没得撤销（还没点、上一步是用道具）或本关的次数用完了就变灰 */
  private dimUndo(): void {
    const v = this.skillNodes.get('undo');
    if (!v || v.lock.active) return;
    const eco = App.config.eco;
    const off = !this.undoSnap || (this.used.undo ?? 0) >= Skills.maxPerLevel(eco, this.freeLevelId, 'undo');
    (v.icon.getComponent(Sprite) as Sprite).grayscale = off;
    opacity(v.icon).opacity = off ? 120 : 255;
  }

  private setUndo(snap: UndoSnap | null): void {
    if (this.undoSnap === snap) return;
    this.undoSnap = snap;
    this.dimUndo();
  }

  private snapshot(): UndoSnap {
    return { s: this.s.clone(), pos: this.field.positions(), prefill: this.prefillLeft };
  }

  /**
   * 撤销（docs/ux/route-2026-11-19.md 第 4 节）：退回上一步点之前的局面，整个版面按它重画。
   * 连击不恢复（当场断掉）；倒计时不往回走（整关的、限时缸的都照现在的）
   */
  undo(): boolean {
    const snap = this.undoSnap;
    if (!snap) return false;
    snap.s.clock = this.s.clock;
    for (let i = 0; i < MAX_SLOTS; i++) {
      const was = snap.s.slots[i];
      const now = this.s.slots[i];
      if (was && now && was.order === now.order && was.timer !== NO_TIMER) was.timer = Math.min(was.timer, now.timer);
    }
    this.s = snap.s;
    this.undoSnap = null;
    this.prefillLeft = snap.prefill;
    this.autoTaps = null;
    this.netMode = false;
    this.combo.miss();
    this.comboTier = -1;
    this.comboBreaking = false;
    this.frameHi = 0;
    this.layout(this.file, snap);
    // 稀客、幸运泡还没拿走的，挂回原来的气泡上
    const g = this.guest;
    if (g && !g.saved) {
      const rar = App.config.speciesById.get(g.id)?.rarity ?? 'common';
      g.node = this.field.addGuest(g.bubble, g.id, rar, RARITY_GLOW[rar] ?? COLOR.white);
    }
    if (this.lucky && !this.lucky.done) this.field.addLucky(this.lucky.plan.bubble, this.lucky.plan.fish);
    this.layoutReturn(0);
    this.syncClock();
    fx.flash(this.fly, Screen.W, Screen.H, 60);
    return true;
  }

  /** 撤销重画：架上的缸按局面摆好（不播落下来），缸里已经进了几条照样画出来 */
  private restoreShelf(): void {
    for (let i = 0; i < MAX_SLOTS; i++) {
      const b = this.s.slots[i];
      const plus = this.plusNodes[i];
      if (!b) {
        if (plus) plus.active = this.s.nextOrder < this.s.orders.length;
        continue;
      }
      this.bowlIn(i, b.species, b.cap, b.timer, 0, true);
      const view = this.bowls[i];
      if (!view) continue;
      view.got = b.count;
      view.tagLabel.string = `${b.count}/${b.cap}`;
      fit(view.tagLabel, GOAL_W * 0.56, 38, 26);
      for (let k = 0; k < b.count; k++) {
        view.shown = k + 1;
        this.settleInside(view);
      }
    }
  }

  /**
   * 「接下来」预告（docs/ux/route-2026-11-19.md 第 1 节）：第 3 个缸位下面的目标卡位置（平时只开 2 个缸，这里空着），
   * 上面一行小字「接下来」，下面一块半透明深蓝小条里排后面几缸要的鱼；大缸右下角写要几条。
   * 开到第 3 个缸、或后面没有了就收起来。前几关（game_ui.json 的 nextBowls.from 之前）不出：新手先学会点鱼
   */
  private buildNext(): void {
    const n = App.config.curve.route?.preview ?? 0;
    const from = App.config.ui.nextBowls?.from ?? 1;
    if (n <= 0 || (!this.arg.daily && this.arg.level < from)) return;
    const row = plate(this.stage, 'skin/f_hud', NEXT_STEP * n + 14, 56, 'next');
    at(row, this.bowlX[2], this.shelfTop - SHELF_H + GOAL_PIN - GOAL_H / 2);
    const cap = text(row, tr('UI_NEXT_TANKS'), 20, { color: COLOR.yellow });
    at(cap.node, 0, 44);
    fit(cap, NEXT_STEP * n + 20, 20, 14);
    this.nextRow = row;
    this.syncNext(false);
  }

  /** 预告跟着订单走：送走一缸，小牌往左挪一格、最右边进一个新的 */
  private syncNext(animate: boolean): void {
    const row = this.nextRow;
    if (!row || !row.isValid) return;
    const n = App.config.curve.route?.preview ?? 0;
    const from = this.s.nextOrder;
    const to = Math.min(this.s.orders.length, from + n);
    row.active = this.s.openSlots < 3 && to > from;
    for (const [oi, chip] of this.nextChips) {
      if (oi >= from && oi < to) continue;
      this.nextChips.delete(oi);
      Tween.stopAllByTarget(chip);
      if (animate) tween(chip).to(0.15, { scale: new Vec3(0.2, 0.2, 1) }).call(() => chip.destroy()).start();
      else chip.destroy();
    }
    for (let oi = from; oi < to; oi++) {
      const x = (oi - from - (n - 1) / 2) * NEXT_STEP;
      const old = this.nextChips.get(oi);
      if (old) {
        if (animate) tween(old).to(0.22, { position: new Vec3(x, 0, 0) }, { easing: 'quadOut' }).start();
        else at(old, x, 0);
        continue;
      }
      const o = this.s.orders[oi];
      const chip = img(row, this.field.spriteFor(o.s), NEXT_S, NEXT_S, `next${oi}`);
      at(chip, x, 0);
      if (o.cap > 3) at(text(chip, `×${o.cap}`, 18, { outline: COLOR.navy, outlineWidth: 4 }).node, NEXT_S * 0.3, -NEXT_S * 0.32);
      if (animate) fx.popIn(chip, 0.12, 0.22);
      this.nextChips.set(oi, chip);
    }
  }

  refreshHud(): void {
    const rescued = this.total - this.s.fishLeft();
    this.progress.set(`${rescued}/${this.total}`);
    if (this.s.nextOrder >= this.s.orders.length) {
      for (const plus of this.plusNodes) plus.active = false;
    }
    const free = this.s.bufferCap - this.bufferNodes.length;
    const warn = free <= App.config.ui.buffer.warnFree && this.s.status === Status.PLAYING;
    // 开局占格的鱼还在的那几格：底色压深
    this.bufferSlots.forEach((sl, i) => {
      const sp = sl.getChildByName('skin')?.getComponent(Sprite);
      if (sp) sp.color = i < this.prefillLeft ? PREFILL_SLOT : COLOR.white;
    });
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
    // 暂存槽只剩 2 格、或者场上没有一条鱼能直接进缸（再点只能进暂存槽）时，能救场的技能键发光跳动，
    // 其中最对症的那个再放一只小手指着（docs/01 5.2，用户 2026-11-17：让玩家养成用道具的习惯）
    const cfg = App.config.ui.buffer;
    const playing = this.s.status === Status.PLAYING && !this.finishing && this.moved;
    const tight = free <= cfg.skillNudgeFree && this.s.status === Status.PLAYING;
    const stuck = playing && cfg.nudgeWhenStuck === true && Rules.noTarget(this.s);
    const nudge = tight || stuck;
    this.pointSkill(nudge && playing ? this.handSkill(tight ? cfg.nudgeHand?.full : cfg.nudgeHand?.stuck) : null);
    for (const [id, v] of this.skillNodes) {
      const can = !v.lock.active && cfg.rescueSkills.includes(id);
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

  /**
   * 小手该指哪个：按顺序挑第一个**现在用得上**的——解锁了、本关次数没用完、点了有效果（库存是 0 也指：点了去买或看广告）。
   * 'bowl' 是加鱼缸的「＋」：还有空着的加开位才指。
   * 用户 2026-11-18：洗牌本关的次数用完了，小手还指着它；应该指能用的技能或者鱼缸
   */
  private handSkill(order: string[] | undefined): string | null {
    if (!order) return null;
    const s = App.save.data;
    for (const id of order) {
      if (id === 'bowl') {
        if (this.plusNodes.some((p) => p.active)) return id;
        continue;
      }
      const v = this.skillNodes.get(id as SkillId);
      if (!v || v.lock.active) continue;
      const why = Skills.canUse(s, App.config.eco, id, this.used[id] ?? 0, this.freeLevelId, this.usedAll);
      if ((why === '' || why === 'empty') && Flow.hasEffect(this, id) === null) return id;
    }
    return null;
  }

  /** 把小手放到 id 这个道具键（或加鱼缸的「＋」）上，null = 收起来 */
  private pointSkill(id: string | null): void {
    const node = id === null ? null : id === 'bowl' ? (this.plusNodes.find((p) => p.active) ?? null) : (this.skillNodes.get(id as SkillId)?.node ?? null);
    if (this.pointedNode === node) return;
    if (this.pointedNode && this.pointedNode.isValid) this.pointedNode.getChildByName('finger')?.destroy();
    this.pointedNode = node;
    if (node) addFinger(node);
  }

  // ---------------------------------------------------------------- 输入

  /** 收尾自动入缸中：玩家的点击、道具都不响应 */
  get finishing(): boolean {
    return this.autoTaps !== null;
  }

  private tapFish(b: number, k: number): void {
    if (this.arg.demo) return;
    if (this.kindBannerNode) this.dismissKindBanner();
    if (this.ended || this.paused || this.s.status !== Status.PLAYING || this.finishing || this.field.spinning) return;
    if (this.netMode) {
      ui.toast(tr('UI_NET_HINT'));
      return;
    }
    if (!Rules.isOpen(this.s, b)) {
      this.blocked(b);
      return;
    }
    // 点下去的位置：一圈水波 + 短促的「啵」（同 Godot 版）
    const [fx0, fy0] = this.field.fishPos(b, k);
    const holder = this.field.node.parent as Node;
    const snap = this.snapshot();
    if (!this.act(() => Rules.tap(this.s, b, k)).length) return;
    if (this.s.status === Status.PLAYING) this.setUndo(snap);
    this.field.wobble(b);
    const px = fx0 + holder.position.x;
    const py = fy0 + holder.position.y;
    fx.ripple(this.fly, px, py, 120, [1, 1], 0.3, 0, 220);
    fx.ripple(this.fly, px, py, 120, [1.25, 1.25], 0.3, 0.07, 150);
    sfx('bo');
  }

  tapReturn(k: number): void {
    if (this.ended || this.paused || this.s.status !== Status.PLAYING || this.finishing) return;
    const snap = this.snapshot();
    if (!this.act(() => Rules.tap(this.s, RETURN_BUBBLE, k)).length) return;
    if (this.s.status === Status.PLAYING) this.setUndo(snap);
    sfx('bo');
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
    // 这一步之后「上一步」就不是原来那一步了：点鱼的由 tapFish 接着存新的，用道具、开缸的没得撤销
    this.setUndo(null);
    this.play(ev, false);
    return ev;
  }

  tapBowl(slot: number): void {
    if (!this.netMode) return;
    this.exitNetMode();
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

  /**
   * 选好缸（或不选了）：缸停下呼吸、缩放复原。原来选完缸没停，缸一直在跳，装满了也跳（用户 2026-11-17 报的 bug）。
   * 只停正坐在架上、没在落下或飘走的缸，别的缸的动画不打断
   */
  private exitNetMode(): void {
    this.netMode = false;
    this.shelf.getChildByName('netHint')?.destroy();
    for (const v of this.bowls) {
      if (!v || v.leaving || !v.node.isValid) continue;
      Tween.stopAllByTarget(v.node);
      v.node.setScale(1, 1, 1);
      v.node.setPosition(v.node.position.x, v.restY, 0);
    }
  }

  // ---------------------------------------------------------------- 事件表现

  /** 把一批事件变成动画。镜像（bufferNodes、returnNodes、bowls）立即跟着状态改，动画按时间表追 */
  play(events: GameEvent[], intro: boolean): void {
    const cfg = App.config.ui;
    let t = intro ? cfg.intro.startDelay : 0;
    let flyIdx = 0;
    let lastPop = -1;
    /** 这一批里刚开的缸位（新缸直接落下，不等满缸演出） */
    const opened = new Set<number>();
    const hitAt: [number, number][] = [];
    for (const e of events) {
      switch (e.t) {
        case 'fish_to_bowl':
        case 'net_fish': {
          const sp = e.species as number;
          this.luckyTaken(e.b as number, e.k as number);
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
          this.luckyTaken(e.b as number, e.k as number);
          const src = this.takeSource(e.b as number, e.k as number, sp);
          const idx = this.bufferNodes.length;
          this.bufferNodes.push(src);
          this.flyTo(src, this.slotX(Math.min(idx, this.s.bufferCap - 1)), this.bufferY, t + flyIdx * cfg.fly.stagger, () => sfx('buffer'), 0.7, true);
          flyIdx++;
          this.missCombo();
          break;
        }
        case 'buffer_to_bowl': {
          const idx = e.index as number;
          if (idx < this.prefillLeft) this.prefillLeft--;
          const n = this.bufferNodes.splice(idx, 1)[0];
          const view = this.bowls[e.slot as number];
          const delay = t + flyIdx * cfg.fly.stagger + 0.25;
          flyIdx++;
          if (view) view.incoming++;
          if (n) this.flyTo(n, this.bowlX[e.slot as number], this.bowlY + 6, delay, () => this.arrive(view, e.species as number), 0.85);
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
          // 新开的缸位不用等满缸送走的演出，直接落下（用户 2026-11-17：开缸位太慢，时间减半）
          const wait = intro ? (e.slot as number) * 0.1 : opened.has(e.slot as number) ? cfg.bowlDone.unlockDropAt : cfg.bowlDone.dropAt;
          this.bowlIn(e.slot as number, e.species as number, e.cap as number, e.timer as number, t + wait);
          break;
        }
        case 'slot_open': {
          opened.add(e.slot as number);
          const plus = this.plusNodes[e.slot as number];
          if (plus) plus.active = false;
          if (this.goalPill && (e.slot as number) === MAX_SLOTS - 1) this.goalPill.node.active = false;
          break;
        }
        case 'slot_close': {
          const slot = e.slot as number;
          const plus = this.plusNodes[slot];
          fx.delay(this.fly, t + cfg.bowlDone.dropAt, () => {
            plus.active = this.s.nextOrder < this.s.orders.length && this.s.slots[slot] === null;
          });
          break;
        }
        case 'bubble_pop': {
          lastPop = e.b as number;
          const b = e.b as number;
          fx.delay(this.fly, t + 0.18, () => {
            if (this.guest && this.guest.bubble === b) this.releaseGuest();
            this.field.pop(b);
          });
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
        case 'fog_tick':
        case 'fog_clear':
          // 这几样的画面跟着状态走（Field.sync）
          break;
        case 'ice_crack':
          // 厚冰裂一层：连着的气泡破了一个、还差几个（连线跟着状态少一根，这里冰面顿一下、掉几粒冰碴）
          this.field.crackIce(e.b as number, t, e.left ?? 0);
          break;
        case 'blow': {
          this.prefillLeft = 0;
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
    for (const [d, x] of hitAt) fx.delay(this.fly, d + cfg.fly.tapPop + cfg.fly.seconds, () => this.hitCombo(x));
    this.field.sync(this.s);
    this.layoutReturn(t + 0.2);
    this.syncNext(true);
    this.syncDrop(true);
    if (!App.flags.autoplay && this.moved && !this.finishing && this.s.status === Status.PLAYING) {
      this.autoTaps = AutoFinish.plan(this.s, cfg.autoFinish.maxLeft);
      if (this.autoTaps) {
        this.autoT = -cfg.autoFinish.delay;
        this.clearHint();
      }
    }
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

  /**
   * 鱼游过去（同 Godot 版 GameFx.fly）：原地一弹（点击的反馈）→ 沿一条往上拱的弧线游向目的地，头朝游的方向、身体拉长、
   * 中途仰一下头，快到时缩小钻进去；身后拖一条蓝白的光带，隔一段冒一颗星光。到了调 done。
   * keep = true 时鱼留在终点（进暂存槽），否则收掉（进缸）
   */
  private flyTo(n: Node, x: number, y: number, delay: number, done: () => void, scale = 0.6, keep = false): void {
    const cfg = App.config.ui.fly;
    Tween.stopAllByTarget(n);
    n.angle = 0;
    const s0 = Math.abs(n.scale.x) || 1;
    const p = { t: 0 };
    let last = 0;
    const epoch = this.epoch;
    tween(n)
      .delay(delay)
      .call(() => {
        // 鱼的原画朝左，往右游时翻过来
        const from = n.position.clone();
        const face = x > from.x + 20 ? -1 : 1;
        const lift = Math.min(130, Math.max(40, Math.hypot(x - from.x, y - from.y) * 0.3));
        const cx = (from.x + x) / 2;
        const cy = (from.y + y) / 2 + lift;
        tween(n)
          .to(cfg.tapPop * 0.45, { scale: new Vec3(face * s0 * 1.35, s0 * 1.35, 1) }, { easing: 'quadOut' })
          .to(cfg.tapPop * 0.55, { scale: new Vec3(face * s0 * 1.15, s0 * 0.9, 1) })
          .call(() => {
            tween(p)
              .to(cfg.seconds, { t: 1 }, {
                easing: 'sineInOut',
                onUpdate: () => {
                  if (!n.isValid) return;
                  const t = p.t;
                  const u = 1 - t;
                  const px = u * u * from.x + 2 * u * t * cx + t * t * x;
                  const py = u * u * from.y + 2 * u * t * cy + t * t * y;
                  n.setPosition(px, py, 0);
                  const k = t * t;
                  n.setScale(face * s0 * (1.25 + (scale - 1.25) * k), s0 * (0.92 + (scale - 0.92) * k), 1);
                  n.angle = Math.sin(t * Math.PI) * 22 * (face < 0 ? 1 : -1);
                  this.trail(px, py);
                  if (t - last > 0.1) {
                    last = t;
                    this.trailSpark(px, py);
                  }
                },
              })
              .call(() => {
                if (n.isValid) {
                  n.angle = 0;
                  if (keep) n.setScale(s0 * scale, s0 * scale, 1);
                  else n.destroy();
                }
                // 路上整个版面重画过了（撤销、换关）：这条鱼要进的缸已经不在了，不结算
                if (epoch !== this.epoch) return;
                done();
              })
              .start();
          })
          .start();
      })
      .start();
  }

  /** 光带的一节：一团蓝白柔光，原地缩小淡出（每帧放一节，连起来就是拖尾） */
  private trail(x: number, y: number): void {
    const g = img(this.fly, 'kit/fx_glow', 44, 44, 'trail');
    (g.getComponent(Sprite) as Sprite).color = TRAIL;
    at(g, x, y);
    g.setSiblingIndex(0);
    const op = opacity(g);
    op.opacity = 150;
    tween(g).to(0.24, { scale: new Vec3(0.25, 0.25, 1) }).call(() => g.destroy()).start();
    tween(op).to(0.24, { opacity: 0 }).start();
  }

  private trailSpark(x: number, y: number): void {
    const s0 = 26 + Math.random() * 20;
    const b = img(this.fly, 'kit/fx_spark', s0, s0, 'trailSpark');
    if (Math.random() < 0.5) (b.getComponent(Sprite) as Sprite).color = TRAIL;
    at(b, x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 20);
    tween(b).to(0.36, { scale: new Vec3(0.2, 0.2, 1), angle: -50 }).call(() => b.destroy()).start();
    tween(opacity(b)).to(0.36, { opacity: 0 }, { easing: 'quadIn' }).start();
  }

  /** 鱼进缸（同 Godot 版 GameFx.splash）：缸口溅起一把小气泡、一圈扁的涟漪，缸被压一下，「叮」一声加水花声 */
  private arrive(view: BowlView | null, _sp: number): void {
    if (!view) return;
    view.incoming--;
    view.shown++;
    if (!view.done) this.bumpTag(view);
    this.settleInside(view);
    // 满缸正在飘走的不再压（它的缩放归飘走动画管）
    if (!view.leaving) fx.squash(view.node, 0.88);
    const x = view.node.position.x;
    const mouth = view.restY + view.h * 0.3;
    fx.fountain(this.fly, x, mouth, 7, 'kit/bubble_small', 240, 900, 10, 20, 0.45);
    fx.ripple(this.fly, x, mouth, 90, [1.3, 0.5], 0.25, 0, 180);
    sfx('bowl');
    sfx('splash');
    if (view.done && view.incoming <= 0) this.bowlLeave(view);
  }

  private bowlIn(slot: number, sp: number, cap: number, timer: number, delay: number, instant = false): void {
    const big = cap > 3;
    const s = big ? BOWL_BIG : BOWL_W;
    const h = s * 0.925;
    const restY = this.shelfTop - BOWL_SINK + h / 2;
    const node = img(this.stage, 'skin/j_bowl', s, h, `bowl${slot}`);
    at(node, this.bowlX[slot], restY);
    // 空缸里什么都不放（用户 2026-11-16：缸里画着目标鱼，会让人以为已经有一条了）。
    // 要什么、进了几条，看木架下面钉着的目标卡（用户 2026-11-16 定的样子）：一叠白边相片，上面是要的那种鱼（画得大，看得清），
    // 右下角「0/3」；进一条数字加一、卡弹一下。卡的底图是 Codex 画的（art/briefs/redesign/goal_card.txt）
    const inside = box('inside', node, s, h);
    const tag = img(this.stage, 'skin/j_goal', GOAL_W, GOAL_H, 'tag');
    // 卡顶上的图钉压在木架正面
    at(tag, this.bowlX[slot], this.shelfTop - SHELF_H + GOAL_PIN - GOAL_H / 2);
    const tagFish = img(tag, this.field.spriteFor(sp), GOAL_H * 0.68, GOAL_H * 0.68, 'fish');
    at(tagFish, -GOAL_W * 0.13, -GOAL_H * 0.02);
    Alive.blink(tagFish, this.field.idFor(sp), GOAL_H * 0.68);
    Alive.idle(tagFish, Alive.shapeOf(this.field.idFor(sp)), slot);
    // 数字：游戏字体、白字深蓝描边，压在相片的右下角（不出相片的白边）
    const tagLabel = text(tag, `0/${cap}`, 38, { outline: COLOR.navy, outlineWidth: 5 });
    at(tagLabel.node, GOAL_W * 0.17, -GOAL_H * 0.2);
    fit(tagLabel, GOAL_W * 0.56, 38, 26);
    let timerNode: Node | null = null;
    let timerLabel: Label | null = null;
    if (timer !== NO_TIMER) {
      timerNode = img(node, 'kit/round_red', 60, 60, 'timer');
      at(timerNode, s / 2 - 16, s / 2 - 22);
      timerLabel = text(timerNode, String(Math.ceil(timer)), 28);
    }
    this.bowlBubbles(node, s, h);
    const view: BowlView = { node, inside, tag, tagLabel, got: 0, sp, timer: timerNode, timerLabel, shown: 0, cap, incoming: 0, done: false, restY, h, leaving: false };
    this.bowls[slot] = view;
    onTap(tag, () => this.tapBowl(slot), { press: 0 });
    onTap(node, () => {
      if (this.bowls[slot] === view) this.tapBowl(slot);
    }, { press: 0 });
    // 新缸从上方落下（撤销重画时直接坐在架上）
    if (!instant) {
      node.setPosition(this.bowlX[slot], restY + 260, 0);
      opacity(node).opacity = 0;
      tween(node)
        .delay(delay)
        .call(() => (opacity(node).opacity = 255))
        .to(App.config.ui.bowlDone.dropSeconds, { position: new Vec3(this.bowlX[slot], restY, 0) }, { easing: 'bounceOut' })
        .call(() => sfx('land'))
        .start();
    }
    const plus = this.plusNodes[slot];
    if (plus) plus.active = false;
  }

  /** 进了一条：目标牌上的数字加一，牌弹一下 */
  private bumpTag(view: BowlView): void {
    view.got = Math.min(view.cap, view.got + 1);
    view.tagLabel.string = `${view.got}/${view.cap}`;
    fit(view.tagLabel, GOAL_W * 0.56, 38, 26);
    fx.punch(view.tag, 1.18, 0.22);
  }

  /** 缸里进来的鱼：按进来的先后摆在水里（3 条摆成三角、6 条摆两排），各自轻轻游 */
  private settleInside(view: BowlView): void {
    const n = view.shown;
    const s = (view.node.getComponent(UITransform) as UITransform).width;
    const size = s * (view.cap > 3 ? 0.26 : 0.32);
    const spots: [number, number][] =
      view.cap > 3
        ? [[-0.22, 0.02], [0, 0.02], [0.22, 0.02], [-0.11, 0.2], [0.11, 0.2], [0, -0.14]]
        : [[-0.17, 0.0], [0.17, 0.0], [0, 0.17]];
    const k = n - 1;
    if (k >= spots.length) return;
    const f = img(view.inside, this.field.spriteFor(view.sp), size, size, `in${k}`);
    Alive.blink(f, this.field.idFor(view.sp), size);
    at(f, spots[k][0] * s, spots[k][1] * view.h);
    f.setScale(k % 2 === 0 ? 0.3 : -0.3, 0.3, 1);
    const sx = k % 2 === 0 ? 1 : -1;
    tween(f)
      .to(0.22, { scale: new Vec3(sx * 1.15, 1.15, 1) }, { easing: 'quadOut' })
      .to(0.16, { scale: new Vec3(sx, 1, 1) }, { easing: 'backOut' })
      .call(() => {
        fx.bob(f, 4, 1.6 + k * 0.2, k * 0.15);
        Alive.idle(f, Alive.shapeOf(this.field.idFor(view.sp)), k);
      })
      .start();
  }

  /** 满缸：晃一下、发光、爆光、往上飘走（docs/01 3.1） */
  private bowlDone(view: BowlView, _slot: number): void {
    view.done = true;
    view.tag.active = false;
    view.tag.destroy();
    if (view.incoming <= 0) this.bowlLeave(view);
  }

  private bowlLeave(view: BowlView): void {
    if (view.leaving) return;
    view.leaving = true;
    const n = view.node;
    // 落下、跳动还没播完的先收掉，从架子上的位置开始飘
    Tween.stopAllByTarget(n);
    n.setPosition(n.position.x, view.restY, 0);
    n.setScale(1, 1, 1);
    opacity(n).opacity = 255;
    const cfg = App.config.ui.bowlDone;
    const timed = view.timer !== null;
    const glow = img(this.fly, 'kit/bowl_glow', 220, 220, 'glow');
    at(glow, n.position.x, n.position.y);
    if (timed) {
      (glow.getComponent(Sprite) as Sprite).color = COLOR.yellow;
      this.timedSaved(view);
    }
    tween(opacity(glow)).to(cfg.swell, { opacity: 255 }).to(0.3, { opacity: 0 }).call(() => glow.destroy()).start();
    tween(n)
      .to(0.06, { angle: 6 })
      .to(0.08, { angle: -6 })
      .to(0.06, { angle: 0 })
      .to(cfg.swell, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'quadOut' })
      .call(() => {
        fx.sparkle(this.fly, n.position.x, n.position.y, timed ? 22 : 14, timed ? 170 : 140, COLOR.yellow);
        fx.ring(this.fly, n.position.x, n.position.y, 100, 300, timed ? COLOR.yellow : undefined);
        sfx('bowlDone');
      })
      .to(0.3, { position: new Vec3(n.position.x, n.position.y + 180, 0), scale: new Vec3(0.6, 0.6, 1) }, { easing: 'quadIn' })
      .call(() => n.destroy())
      .start();
    tween(opacity(n)).delay(cfg.swell + 0.25).to(0.25, { opacity: 0 }).start();
  }

  /**
   * 限时缸在倒计时归零前装满：和普通缸不一样的提示（用户 2026-11-17）——红色倒计时牌变成绿色对勾、弹一下，
   * 缸上方升起金色的「赶上了！」，光和光环换成金色，多一声升档音
   */
  private timedSaved(view: BowlView): void {
    const t = view.timer;
    if (t && t.isValid) {
      Tween.stopAllByTarget(t);
      setImg(t, 'kit/round_green', 60, 60);
      if (view.timerLabel) view.timerLabel.string = '';
      const ok = img(t, 'kit/ic_check', 40, 40, 'ok');
      fx.popIn(ok, 0, 0.2);
      fx.punch(t, 1.35, 0.25);
    }
    const n = view.node;
    const word = text(this.fly, tr('TIMED_SAVED'), 44, { color: COLOR.yellow, outline: COLOR.navy, outlineWidth: 5 });
    // 字压在缸身上往上飘一点（缸就在顶栏下面，往上升太多会压到顶栏）
    const y0 = n.position.y - 6;
    at(word.node, n.position.x, y0);
    word.node.setScale(0.4, 0.4, 1);
    tween(word.node)
      .to(0.18, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'backOut' })
      .to(0.1, { scale: new Vec3(1, 1, 1) })
      .to(0.7, { position: new Vec3(n.position.x, y0 + 40, 0) }, { easing: 'quadOut' })
      .call(() => word.node.destroy())
      .start();
    tween(opacity(word.node)).delay(0.6).to(0.38, { opacity: 0 }).start();
    sfx('tier');
    buzz('medium');
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
    // 连击送卡的掷骰子只留给每日挑战；主线关卡换成开局就告诉你的连击目标（docs/01 9.4）
    const cardsOpen = this.arg.daily === true && Features.isUnlocked(eco, 'album', App.save.data.level);
    const r = this.combo.hit(this.clock, eco.combo, this.rng, cardsOpen);
    this.goalProgress();
    // 声音：每一击升一个音；震动：每一击轻震一下（docs/01 3.2：画面、声音、震动一起升级）
    // 进缸本身的声音在 arrive 里（每条鱼都有）；连击起算后每一击再叠一声逐级升调的「叮」，震动每一击轻震一下
    if (r.tier >= 0) sfx('hit', r.count - eco.combo.startAt);
    if (r.count >= 2) buzz('light');
    if (r.tier < 0) {
      this.showCombo(false);
      // 蓄势（还没到起算数）：鱼缸上方冒个小数字，一次比一次大
      if (r.count >= 2) this.hitPop(`×${r.count}`, 30 + r.count * 4);
      return;
    }
    this.comboClock(r.tier);
    const col = COMBO_COLORS[r.tier] ?? COLOR.white;
    const was = this.comboRow.active && !this.comboBreaking;
    this.comboBreaking = false;
    this.showCombo(true);
    const dw = artNumber(this.comboNum, `×${r.count}`, 88, 'left');
    // 连击目标还没到：数字后面跟一个小一号的「/N」
    const tail = this.comboTailLabel();
    tail.string = this.comboGoal > 0 && !this.goalReached ? `/${this.comboGoal}` : '';
    const tw = tail.string ? textWidth(tail) + 6 : 0;
    const groupW = this.comboWordW + 16 + dw + tw;
    at(this.comboWord, -groupW / 2, 0);
    at(this.comboNum, -groupW / 2 + this.comboWordW + 16, 0);
    at(tail.node, -groupW / 2 + this.comboWordW + 16 + dw + 6, -14);
    // 连击金币：每次涨了从连击计右边飘一个「金币 +N」
    if (r.coins > 0) {
      const cl = text(null, `+${r.coins}`, 28, { color: COLOR.yellow });
      at(img(cl.node, 'icon/coin', 28, 28, 'coin'), -34, 0);
      fx.floatUp(this.fly, cl.node, this.comboX + groupW / 2 + 50, this.comboY - 10, 26, 0.6);
    }
    if (!was) {
      Tween.stopAllByTarget(this.comboRow);
      Tween.stopAllByTarget(opacity(this.comboRow));
      at(this.comboRow, this.comboX, this.comboY);
      opacity(this.comboRow).opacity = 255;
      fx.popIn(this.comboRow, 0, 0.25);
    }
    // 数字砸下来：放大 2 倍、略歪，回弹到正（纯数字允许 ±4° 倾斜，docs/03）
    const ln = this.comboNum;
    Tween.stopAllByTarget(ln);
    ln.setScale(2, 2, 1);
    ln.angle = (Math.random() - 0.5) * 8;
    tween(ln).to(0.26, { scale: new Vec3(1, 1, 1), angle: 0 }, { easing: 'backOut' }).start();
    // 整块顿一下
    const bd = this.comboBadge;
    Tween.stopAllByTarget(bd);
    bd.setScale(1.14, 1.14, 1);
    tween(bd).to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
    const cx = this.comboX;
    const cy = this.comboY;
    fx.sparkle(this.fly, cx, cy, 6 + Math.min(r.count, 10), 110, col, 28);
    // 满屏跟着这一击动：鱼缸背后炸一圈档位色的光和火花（垫在缸后面，不盖缸和订单卡），整个场面顿一下，四边光框闪一下
    fx.glowPop(this.under, bowlX, this.bowlY, 300 + r.tier * 40, col, 0.3, 240);
    fx.ring(this.under, bowlX, this.bowlY, 80, 280 + r.tier * 40, col);
    fx.sparkle(this.under, bowlX, this.bowlY, 8 + r.tier * 2, 150 + r.tier * 15, col, 30);
    fx.punch(this.stage, 1.008 + r.tier * 0.004);
    this.setFever(r.tier, col);
    this.pulseFrame();
    if (r.tier_up) this.praise(tr(eco.combo.tiers[r.tier].key), r.tier, col);
    if (r.card) Flow.comboCard(this);
  }

  private showCombo(on: boolean): void {
    this.comboRow.active = on;
  }

  /** 蓄势时在连击计的位置冒一个数字：略歪着弹出来，往上飘一点、淡出（用户 2026-11-16：不盖鱼缸和订单卡） */
  private hitPop(s: string, size0: number): void {
    const n = box('pop', null);
    artNumber(n, s, size0);
    n.angle = (Math.random() - 0.5) * 14;
    fx.floatUp(this.fly, n, this.comboX, this.comboY - 6, 24, 0.5);
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
  /**
   * 常驻的小气泡（用户 2026-11-16）：背景里从下往上冒（在气泡场后面），每个鱼缸里从缸底往水面冒。
   * 用的是同一张小气泡图，大小、速度、左右摆动都随机；节点自己销毁，页面没了就停
   */
  private ambientBubbles(): void {
    const loop = () => {
      if (!this.under.isValid) return;
      const size = 8 + Math.random() * 16;
      // 外层往上走，里层左右摆：两个动画各管一个节点，不互相覆盖
      const holder = box('ambient', this.under, size, size);
      const n = img(holder, 'kit/bubble_small', size, size, 'bubble');
      const x = (Math.random() - 0.5) * (Screen.W - 40);
      const y0 = Screen.bottom + 40 + Math.random() * 200;
      const y1 = Screen.top - 120 - Math.random() * 220;
      const dur = (y1 - y0) / (70 + Math.random() * 60);
      at(holder, x, y0);
      const op = opacity(holder);
      op.opacity = 0;
      tween(op).to(0.4, { opacity: 120 + Math.random() * 80 }).delay(Math.max(0, dur - 1.4)).to(1, { opacity: 0 }).start();
      tween(holder).to(dur, { position: new Vec3(x, y1, 0) }).call(() => holder.destroy()).start();
      const sway = 10 + Math.random() * 16;
      const half = 0.9 + Math.random() * 0.8;
      tween(n)
        .repeatForever(tween(n).by(half, { position: new Vec3(sway, 0, 0) }, { easing: 'sineInOut' }).by(half, { position: new Vec3(-sway, 0, 0) }, { easing: 'sineInOut' }))
        .start();
      tween(this.under).tag(AMBIENT_TAG).delay(0.22 + Math.random() * 0.4).call(loop).start();
    };
    loop();
  }

  /** 鱼缸里的小气泡：从缸底附近冒出来，升到水面附近淡掉 */
  private bowlBubbles(node: Node, s: number, h: number): void {
    const loop = () => {
      if (!node.isValid) return;
      const size = 6 + Math.random() * 8;
      const b = img(node, 'kit/bubble_small', size, size, 'fizz');
      b.setSiblingIndex(0);
      const x = (Math.random() - 0.5) * s * 0.5;
      const y0 = -h * 0.32;
      const y1 = h * 0.12 + Math.random() * h * 0.06;
      const dur = 0.9 + Math.random() * 0.7;
      at(b, x, y0);
      const op = opacity(b);
      op.opacity = 0;
      tween(op).to(0.15, { opacity: 200 }).delay(dur - 0.4).to(0.25, { opacity: 0 }).start();
      tween(b)
        .to(dur, { position: new Vec3(x + (Math.random() - 0.5) * 14, y1, 0) }, { easing: 'sineOut' })
        .call(() => b.destroy())
        .start();
      tween(node).delay(0.35 + Math.random() * 0.6).call(loop).start();
    };
    tween(node).delay(Math.random() * 0.5).call(loop).start();
  }

  private spawnRise(): void {
    const tier = Math.max(0, this.comboTier);
    const bubble = Math.random() < 0.3;
    const s0 = 22 + Math.random() * 30;
    const n = img(this.under, bubble ? 'kit/bubble_small' : 'kit/fx_spark', s0, s0, 'rise');
    if (!bubble) (n.getComponent(Sprite) as Sprite).color = this.comboColor;
    const x = (Math.random() - 0.5) * Screen.W;
    const y0 = Screen.bottom - 30;
    const y1 = Screen.bottom + Screen.H * (0.55 + Math.random() * 0.5);
    const dur = (1.5 + Math.random() * 0.9) * (1 - tier * 0.1);
    at(n, x, y0);
    const op = opacity(n);
    op.opacity = 235;
    tween(n)
      .to(dur, { position: new Vec3(x + (Math.random() - 0.5) * 90, y1, 0), angle: bubble ? 0 : 200 }, { easing: 'quadOut' })
      .call(() => n.destroy())
      .start();
    tween(op).delay(dur * 0.55).to(dur * 0.45, { opacity: 0 }).start();
  }

  /** 一发烟花：柔光一闪、两圈光环、一大一小两圈火花 */
  private boom(x: number, y: number, col: Color, loud = true, layer: Node = this.fly): void {
    fx.glowPop(layer, x, y, 380, col, 0.3);
    fx.ring(layer, x, y, 60, 420, col);
    fx.ring(layer, x, y, 30, 240, COLOR.white);
    fx.sparkle(layer, x, y, 26, 280, col, 52);
    fx.sparkle(layer, x, y, 12, 140, COLOR.white, 30);
    if (loud) sfx('firework');
  }

  /**
   * 连击升档（docs/01 3.2）：整屏一起动——
   * 夸奖词从大砸下来（背后档位色柔光 + 爆炸星，不用飘带，用户 2026-11-16）；同一刻全屏闪档位色、放射光炸开到整屏、两圈冲击波、
   * 屏幕震、全场气泡跟着波纹鼓一下、鱼缸依次跳一下、两个下角喷彩纸；红档以上再炸几发烟花。
   * 升档音按档位换（越高越长越亮），震动中 / 重。停一下后夸奖词缩小飞进顶上的连击计
   */
  private praise(word: string, tier: number, col: Color): void {
    // 小一点、放在暂存槽那一排，不伸到上面的鱼缸、订单卡和下面的气泡上（用户 2026-11-16）
    const y = this.bufferY - 6;
    if (this.praiseNode?.isValid) this.praiseNode.destroy();
    // 夸奖字和连击计在同一排：夸奖字在的时候连击计淡出，播完再回来
    const meter = opacity(this.comboBadge);
    Tween.stopAllByTag(PRAISE_TAG, meter);
    tween(meter).tag(PRAISE_TAG).to(0.08, { opacity: 0 }).delay(1.05).to(0.2, { opacity: 255 }).start();
    const holder = box('praise', this.fly, 420, 200);
    this.praiseNode = holder;
    at(holder, 0, y);
    // 背后：档位色柔光 + Codex 画的爆炸星（慢慢转）；字：中文用 Codex 艺术字，其它语言用字
    const glow = img(holder, 'kit/fx_glow', 380, 200, 'glow');
    (glow.getComponent(Sprite) as Sprite).color = col;
    glow.setScale(0.3, 0.3, 1);
    tween(glow).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    const star = img(holder, 'skin/j_burst', 190, 204, 'burst');
    star.setScale(0.2, 0.2, 1);
    tween(star).to(0.2, { scale: new Vec3(1.1, 1.1, 1) }, { easing: 'quadOut' }).to(0.12, { scale: new Vec3(1, 1, 1) }).start();
    tween(star).by(1.4, { angle: -50 }).start();
    const ww = 290;
    const l = {
      node:
        language() === 'zh_CN'
          ? img(holder, `skin/j_praise_${tier + 1}`, ww, (ww * (tier === 2 ? 341 : 381)) / 660, 'word')
          : text(holder, word, 68, { color: PRAISE_FILL[tier] ?? COLOR.white, outline: COLOR.navy, outlineWidth: 6 }).node,
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
    const cx = this.comboX;
    const cy = this.comboY;
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

  /** 夸奖词落地的那一下：整屏的冲击都在这一帧。闪光、放射光、冲击波、彩纸、烟花全垫在玩法后面：气泡、鱼缸、订单卡都画在它上面，不被挡（用户 2026-11-16） */
  private praiseImpact(y: number, tier: number, col: Color): void {
    const half = Screen.W / 2;
    const reach = Math.hypot(Screen.W, Screen.H);
    buzz(tier >= 2 ? 'heavy' : 'medium');
    fx.trauma(this.stage, 0.5 + tier * 0.12, 20);
    fx.flash(this.under, Screen.W, Screen.H, 90 + tier * 25, col);
    fx.rayBurst(this.under, 0, y, reach * 1.2, col, 0.6, 190);
    fx.ring(this.under, 0, y, 140, reach * 1.1, col, 0.55);
    fx.ring(this.under, 0, y, 100, 620, COLOR.white, 0.4);
    fx.sparkle(this.under, 0, y, 18 + tier * 4, 340, col, 44);
    fx.sparkle(this.fly, 0, y, 10 + tier * 2, 110, COLOR.white, 28);
    // 两个下角往中间喷彩纸
    const n = 16 + tier * 10;
    fx.cannon(this.under, -half - 10, this.fieldBottom - 20, 66, n, 900 + tier * 110);
    fx.cannon(this.under, half + 10, this.fieldBottom - 20, 114, n, 900 + tier * 110);
    // 全场气泡从夸奖词往外鼓一圈；鱼缸依次跳一下
    const holder = this.field.node.parent as Node;
    this.field.ripple(-holder.position.x, y - holder.position.y, 0.1 + tier * 0.02);
    this.bowls.forEach((v, i) => {
      if (!v || v.done || Math.abs(v.node.position.y - v.restY) > 1) return;
      Tween.stopAllByTag(HOP_TAG, v.node);
      const x = this.bowlX[i];
      tween(v.node)
        .tag(HOP_TAG)
        .delay(0.05 + i * 0.05)
        .to(0.1, { position: new Vec3(x, v.restY + 18, 0) }, { easing: 'quadOut' })
        .to(0.16, { position: new Vec3(x, v.restY, 0) }, { easing: 'bounceOut' })
        .start();
    });
    // 红档、紫档：场地里再炸几发烟花
    const mid = (this.fieldTop + this.fieldBottom) / 2;
    const span = (this.fieldTop - this.fieldBottom) / 2;
    for (let i = 0; i < (tier >= 3 ? 5 : tier >= 2 ? 3 : 0); i++) {
      fx.delay(this.under, 0.12 + i * 0.14, () => {
        this.boom((Math.random() - 0.5) * (Screen.W - 160), mid + (Math.random() - 0.5) * span * 1.4, COMBO_COLORS[(tier + i) % COMBO_COLORS.length], i % 2 === 0, this.under);
        if (i === 0) buzz('medium');
      });
    }
  }

  /** 过关庆祝（局内）：闪白、放射光、屏幕震、两个下角喷彩纸、四发烟花；连击计和连击的满屏效果收掉 */
  private celebrate(): void {
    this.showCombo(false);
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
    // 断连：数字变灰，整块抖一下往下掉、淡出。不出声（用户 2026-11-18：断连那一声「叮咚」不好听，不要了）
    this.comboBreaking = true;
    for (const g of this.comboNum.children) {
      const sp = g.getComponent(Sprite);
      if (sp) sp.grayscale = true;
    }
    const row = this.comboRow;
    Tween.stopAllByTarget(row);
    const x = this.comboX;
    const y = this.comboY;
    tween(row)
      .to(0.05, { position: new Vec3(x - 6, y, 0) })
      .to(0.05, { position: new Vec3(x + 6, y, 0) })
      .to(0.05, { position: new Vec3(x, y, 0) })
      .to(0.25, { position: new Vec3(x, y - 24, 0) }, { easing: 'quadIn' })
      .call(() => {
        this.comboBreaking = false;
        this.showCombo(false);
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
    // 连击的时限（用户 2026-11-16：不要倒计时条）：到点就断
    if (this.comboRow.active && !this.comboBreaking) {
      const left = Math.max(0, 1 - (this.clock - this.lastHit()) / App.config.eco.combo.windowSeconds);
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
    // 限时缸、限时关
    if (this.s.status === Status.PLAYING && this.moved && !this.finishing) {
      const ev = Rules.tick(this.s, dt);
      if (ev.length) this.play(ev, false);
      this.syncClock();
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
    if (!this.arg.demo && !this.hintNode && !this.tutorNode && !this.finishing && this.idle > wait && this.s.status === Status.PLAYING) this.showHint();
    if (this.arg.demo) this.demoTick(dt);
    if (this.tutor && !this.tutorNode) Flow.checkTutorial(this);
    this.autoFinish(dt);
    if (this.guest && !this.guest.saved && this.guest.node.isValid) this.field.guestFollow(this.guest.node, this.guest.bubble);
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

  /**
   * 收尾自动入缸（docs/01 第 2 节）：只剩「无脑点」的最后几个气泡时，自己一条条送进缸，玩家不用再点。
   * 局面一变就重算一次（AutoFinish.plan，纯规则）；算出来以后等一小会儿（让上一步的动画走完）再按顺序点，每条之间隔一点
   */
  /**
   * 顶栏的关卡号：难关、超难关描边换色，右边挂同色小牌子（火苗「困难」/ 鲨鱼鳍「超难」，docs/ux/level-types.md）。
   * 关卡号和小牌子当一组居中，碰到左边的鱼数条一起往右让
   */
  private levelTitle(levelName: string, hudY: number, midX: (w: number) => number, timed: boolean): void {
    const kind = this.arg.daily ? 'normal' : levelKind(this.arg.level);
    const lv = text(this.stage, levelName, 30, kind === 'normal' ? {} : { outline: KIND_STYLE[kind].outline });
    const tw = textWidth(lv);
    this.kindTagNode = null;
    if (kind === 'normal') {
      at(lv.node, midX(tw), hudY);
      lv.node.active = !timed;
      return;
    }
    const tag = kindTag(this.stage, kind, 40);
    const tagW = (tag.getComponent(UITransform) as UITransform).width;
    const total = tw + 8 + tagW;
    const x0 = midX(total) - total / 2;
    at(lv.node, x0 + tw / 2, hudY);
    at(tag, x0 + tw + 8 + tagW / 2, hudY);
    lv.node.active = !timed;
    tag.active = !timed;
    this.kindTagNode = tag;
  }

  /** 连击目标的奖励图标：收藏开放后给卡（卡背），之前给金币 */
  private goalIcon(): string {
    return Features.isUnlocked(App.config.eco, 'album', App.save.data.level) ? 'icon/card_back' : 'icon/coin';
  }

  private comboTailLabel(): Label {
    if (!this.goalTail || !this.goalTail.node.isValid) {
      this.goalTail = text(this.comboBadge, '', 40, { align: 'left', color: COLOR.yellow });
    }
    return this.goalTail;
  }

  /** 每次命中：常驻小标写到目前为止最高连到几；第一次够到目标时小标变金、闪一下，夸一句 */
  private goalProgress(): void {
    const n = this.comboGoal;
    if (n <= 0 || this.goalReached || !this.goalPill) return;
    const best = Math.min(this.combo.best, n);
    this.goalPill.set(`${best}/${n}`);
    if (best < n) return;
    this.goalReached = true;
    const pill = this.goalPill;
    pill.label.color = COLOR.yellow;
    fx.squash(pill.node, 1.25);
    fx.sparkle(this.fly, pill.node.position.x, pill.node.position.y, 14, 120, COLOR.yellow, 30);
    sfx('star');
    this.praise(tr('UI_COMBO_GOAL_DONE'), App.config.eco.combo.tiers.length - 1, COLOR.yellow);
  }

  /** 进关说明之后：难关、超难关先出横幅，接着出连击目标的开局小卡 */
  showIntro(): void {
    const kind = this.arg.daily || this.arg.demo ? 'normal' : levelKind(this.arg.level);
    if (kind === 'normal') {
      this.showGoalCard();
      return;
    }
    this.showKindBanner();
    const b = App.config.ui.kindBanner;
    fx.delay(this.fly, b.slideIn + b.hold + b.fly, () => this.showGoalCard());
  }

  /**
   * 开局小卡（docs/ux/route-2026-11-19.md 第 2 节）：屏幕中间一张半透明深蓝小卡「连击 ×N → 奖励图标」，
   * 下面一行「第一次过关时达到就送」；停一会儿缩小飞到木架下面的常驻小标上。不挡点击，点鱼照常算
   */
  private showGoalCard(): void {
    const pill = this.goalPill;
    if (this.ended || this.arg.daily || this.arg.demo) return;
    const goal = this.comboGoal > 0 && pill !== null;
    // 没有连击目标的关（重打的、参考解太短的）只剩星级那一行；前几关（教学关）不出卡
    const replay = this.arg.level < App.save.data.level;
    if (!goal && !replay && this.arg.level < (App.config.eco.comboGoal?.from ?? 1)) return;
    const h = goal ? 206 : 84;
    const card = plate(this.fly, 'skin/f_hud', 520, h, 'goalCard');
    if (goal) {
      const title = text(card, tr('UI_COMBO_GOAL', this.comboGoal), 44, { align: 'left' });
      const tw = textWidth(title);
      const row = tw + 24 + 30 + 24 + 72;
      at(title.node, -row / 2, 50);
      const arrow = text(card, '→', 40);
      at(arrow.node, -row / 2 + tw + 24 + 15, 50);
      at(img(card, this.goalIcon(), 72, 72, 'reward'), row / 2 - 36, 50);
      const hint = text(card, tr('UI_COMBO_GOAL_HINT'), 24, { color: COLOR.yellow });
      at(hint.node, 0, -8);
      fit(hint, 480, 24, 18);
    }
    // 星级（docs/01 9.5）：三颗星 +「不用道具」；这一关已经拿过三星的写「已三星」
    const done = Stars.best(App.save.data, this.arg.level) >= 3;
    const line = text(card, tr(done ? 'UI_STARS_DONE' : 'UI_STARS_NOITEM'), 28, { align: 'left' });
    fit(line, 330, 28, 20);
    const lw = textWidth(line);
    const sw = 3 * 34 + 12 + lw;
    const sy = goal ? -64 : 0;
    for (let i = 0; i < 3; i++) at(img(card, 'icon/star', 32, 32, `star${i}`), -sw / 2 + 16 + i * 34, sy);
    at(line.node, -sw / 2 + 3 * 34 + 12, sy);
    at(card, 0, Screen.H * 0.1);
    fx.popIn(card, 0, 0.25);
    const g = App.config.ui.goalCard;
    const to = pill && pill.node.active ? pill.node.position.clone() : new Vec3(0, Screen.top + 80, 0);
    tween(card)
      .delay(g.hold)
      .to(g.fly, { position: to, scale: new Vec3(0.25, 0.25, 1) }, { easing: 'quadIn' })
      .call(() => {
        card.destroy();
        if (pill && pill.node.isValid) fx.squash(pill.node, 1.2);
      })
      .start();
  }

  /** 难关、超难关的开局横幅：从左滑进来、停一下、缩成顶上的小牌子飞过去；点鱼会让它马上收起（不挡点击） */
  showKindBanner(): void {
    const kind = this.arg.daily || this.arg.demo ? 'normal' : levelKind(this.arg.level);
    if (kind === 'normal' || this.ended) return;
    const b = kindBanner(this.stage, kind);
    this.kindBannerNode = b;
    const y = Screen.H * 0.12;
    at(b, -Screen.W, y);
    sfx('warn');
    const cfg = App.config.ui.kindBanner;
    tween(b)
      .to(cfg.slideIn, { position: new Vec3(0, y, 0) }, { easing: 'backOut' })
      .delay(cfg.hold)
      .call(() => this.dismissKindBanner())
      .start();
  }

  private dismissKindBanner(): void {
    const b = this.kindBannerNode;
    if (!b || !b.isValid) return;
    this.kindBannerNode = null;
    Tween.stopAllByTarget(b);
    const tag = this.kindTagNode;
    const to = tag && tag.isValid && tag.active ? tag.position.clone() : new Vec3(Screen.W, b.position.y, 0);
    tween(b)
      .to(App.config.ui.kindBanner.fly, { position: to, scale: new Vec3(0.2, 0.2, 1) }, { easing: 'quadIn' })
      .call(() => {
        b.destroy();
        if (tag && tag.isValid) fx.squash(tag, 1.2);
      })
      .start();
  }

  /** 演示：先圈出下一步要点的鱼，停一下再点（game_ui.json 的 demo.ring / demo.gap） */
  private demoTick(dt: number): void {
    if (this.ended || this.paused || this.s.status !== Status.PLAYING || this.field.spinning || popupCount() > 0) return;
    if (this.demoStep >= this.demoTaps.length) return;
    const cfg = App.config.ui.demo;
    const t = this.demoTaps[this.demoStep];
    this.demoT += dt;
    if (!this.demoArmed) {
      if (this.demoT < cfg.gap) return;
      this.clearHint();
      this.hintNode = this.field.hint(t[0], t[1]);
      if (this.demoStep === this.demoFatal) {
        const sp = this.hintNode?.getComponent(Sprite);
        if (sp) sp.color = new Color(255, 80, 80, 255);
        ui.toast('红圈这一步走错了：点完以后不用道具就过不去了');
      }
      this.demoArmed = true;
      this.demoT = 0;
      return;
    }
    if (this.demoT < (this.demoStep === this.demoFatal ? cfg.fatal : cfg.ring)) return;
    this.clearHint();
    this.demoArmed = false;
    this.demoT = 0;
    this.demoStep++;
    // 对不上（不该发生：演示按关卡原样打）就停下，交给 Flow 报出来
    if (this.act(() => Rules.tap(this.s, t[0], t[1])).length === 0) Flow.demoStuck(this);
  }

  private autoFinish(dt: number): void {
    if (App.flags.autoplay || this.arg.demo || this.s.status !== Status.PLAYING || !this.moved) return;
    if (this.autoTaps === null) return;
    this.autoT += dt;
    if (this.autoT < App.config.ui.autoFinish.interval) return;
    this.autoT = 0;
    const t = this.autoTaps.shift();
    if (!t) {
      this.autoTaps = null;
      return;
    }
    const isReturn = t.b === RETURN_BUBBLE;
    const pos = isReturn ? null : this.field.fishPos(t.b, t.k);
    const ev = this.act(() => Rules.tap(this.s, t.b, t.k));
    // 万一和算的不一样（不该发生），停下来让玩家自己点
    if (ev.length === 0) {
      this.autoTaps = null;
      return;
    }
    if (this.autoTaps.length === 0) this.autoTaps = null;
    sfx('bo');
    if (!isReturn && pos) {
      this.field.wobble(t.b);
      const holder = this.field.node.parent as Node;
      fx.ripple(this.fly, pos[0] + holder.position.x, pos[1] + holder.position.y, 120, [1, 1], 0.3, 0, 220);
    }
  }

  /**
   * 稀客（docs/01 3.4，用户 2026-11-17：收藏卡要在关卡里出现）：开局就定好这关宝箱开出什么；开出卡的话，
   * 把这只生物困在一个一开始点不到的气泡里（被压着的或还在候场的，没有就随便一个）。
   * 种子由关卡、保底计数、已有卡数（重玩时再加日期）定，重开这一关还是同一只，刷不出更好的卡。
   * 每日挑战、今天重玩奖励领完的关没有宝箱，也就没有稀客
   */
  private planChest(): void {
    this.chestPlan = null;
    this.guest = null;
    if (this.arg.daily) return;
    const s = App.save.data;
    const eco = App.config.eco;
    Daily.roll(s, today());
    const replay = this.arg.level < s.level;
    if (replay && s.daily.replay >= eco.replay.rewardedPerDay) return;
    const seed = (this.lv.levelSeed * 31 + s.chest.dry * 7919 + Object.keys(s.cards).length * 104729 + (replay ? today() : 0)) >>> 0;
    const rng = new Rng(seed);
    this.chestPlan = LevelChest.plan(s, eco, App.config.species, this.lv.challenge, rng);
    if (this.chestPlan.kind !== 'card') return;
    const open = new Set(Rules.openBubbles(this.s));
    const all = this.s.bubbles.map((_, i) => i).filter((i) => this.s.bubbles[i].count() > 0);
    const hidden = all.filter((i) => !open.has(i));
    const pool = hidden.length > 0 ? hidden : all;
    if (pool.length === 0) return;
    const b = pool[rng.rangeI(0, pool.length - 1)];
    const id = this.chestPlan.cardId;
    const rar = App.config.speciesById.get(id)?.rarity ?? 'common';
    this.guest = { bubble: b, id, saved: false, node: this.field.addGuest(b, id, rar, RARITY_GLOW[rar] ?? COLOR.white) };
  }

  /** 关着稀客的气泡破了：它游出来、放大亮个相、往上飞走（进收藏），提示一句；过关后在结算里翻卡 */
  private releaseGuest(): void {
    const g = this.guest;
    if (!g || g.saved || !g.node.isValid) return;
    g.saved = true;
    const tf = this.fly.getComponent(UITransform) as UITransform;
    const p = tf.convertToNodeSpaceAR(g.node.worldPosition.clone());
    const rar = App.config.speciesById.get(g.id)?.rarity ?? 'common';
    const col = RARITY_GLOW[rar] ?? COLOR.white;
    g.node.destroy();
    const n = box('guestFree', this.fly, 160, 160 * CARD_ASPECT);
    at(n, p.x, p.y);
    n.setScale(0.5, 0.5, 1);
    const ray = fx.rays(n, 360);
    (ray.getComponent(Sprite) as Sprite).color = col;
    opacity(ray).opacity = 150;
    const glow = img(n, 'kit/fx_glow', 300, 300, 'glow');
    (glow.getComponent(Sprite) as Sprite).color = col;
    at(miniCard(n, g.id, rar, 160), 0, -80 * CARD_ASPECT);
    sfx('card');
    buzz('light');
    fx.sparkle(this.fly, p.x, p.y, 10, 120);
    const up = new Vec3(p.x * 0.5, p.y + 140, 0);
    tween(n)
      .to(0.32, { position: up, scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .delay(0.75)
      .to(0.35, { position: new Vec3(0, Screen.top + 80, 0), scale: new Vec3(0.3, 0.3, 1) }, { easing: 'quadIn' })
      .call(() => n.destroy())
      .start();
    ui.toast(tr('GUEST_SAVED', speciesName(g.id)));
  }

  /** 限时关里连击加时间（docs/01 第 4 节）：倒计时条弹一下，下面飘一个绿色的「+N」 */
  private comboClock(tier: number): void {
    const cap = this.clockCap;
    if (!cap || this.s.clock === NO_TIMER || this.s.status !== Status.PLAYING) return;
    const add = LevelCurve.comboSeconds(App.config.curve, tier);
    if (add <= 0) return;
    this.s.clock += add;
    this.syncClock();
    const l = text(null, `+${add}`, 34, { color: CLOCK_PLUS, outline: COLOR.navy, outlineWidth: 4 });
    fx.floatUp(this.fly, l.node, cap.node.position.x, cap.node.position.y - 44, 30, 0.7);
    if (!this.clockWarn) fx.punch(cap.node, 1.12, 0.18);
  }

  /** 限时关的倒计时：剩 clockWarn 秒以内变红、一跳一跳的（时间在 game_ui.json 的 clock.warn） */
  private syncClock(): void {
    const cap = this.clockCap;
    if (!cap || this.s.clock === NO_TIMER) return;
    cap.set(mmss(this.s.clock));
    const warn = this.s.clock <= App.config.ui.clock.warn;
    if (warn !== this.clockWarn) {
      this.clockWarn = warn;
      cap.label.color = warn ? COLOR.yellow : COLOR.white;
      Tween.stopAllByTarget(cap.node);
      cap.node.setScale(1, 1, 1);
      if (warn) {
        fx.breathe(cap.node, 0.08, 0.5);
        sfx('tick');
      }
    }
  }

  private lastHit(): number {
    return (this.combo as unknown as { last: number }).last;
  }

  /** 给一步套光圈（回流位上的鱼套在小气泡上） */
  private ringAt(t: Tap): void {
    if (t[0] === RETURN_BUBBLE) {
      const b = this.returnNodes[t[1]];
      if (b) {
        this.hintNode = img(b, 'kit/hint_ring', 120, 120, 'hint');
        fx.breathe(this.hintNode, 0.12, 0.9);
      }
    } else this.hintNode = this.field.hint(t[0], t[1]);
  }

  /** 提示技能要亮的那一步：想清楚的玩家会点哪条（只看屏幕上看得到的：架上的缸、预告的后面几缸、场上的鱼）；null = 没得提示 */
  skillHintTap(): Tap | null {
    return Players.hint(this.s, App.config.curve.route?.preview ?? 0, (this.rng.nextU32() % 1e6) + 1);
  }

  /** 提示技能：那条鱼套金圈，被点（任何一步）或过 game_ui.json 的 hint.skillSeconds 秒后消失 */
  showSkillHint(t: Tap): void {
    this.clearHint();
    this.ringAt(t);
    const ring = this.hintNode;
    if (!ring) return;
    const [x, y] = t[0] === RETURN_BUBBLE ? [this.returnNodes[t[1]]?.position.x ?? 0, this.returnY] : this.fieldToFly(this.field.fishPos(t[0], t[1]));
    fx.ring(this.fly, x, y, 60, 240, COLOR.yellow);
    fx.sparkle(this.fly, x, y, 8, 90, COLOR.yellow, 30);
    fx.delay(ring, App.config.ui.hint.skillSeconds ?? 5, () => {
      if (this.hintNode === ring) this.clearHint();
    });
  }

  /** 场地里的坐标换成特效层的坐标 */
  private fieldToFly(p: [number, number]): [number, number] {
    const holder = this.field.node.parent as Node;
    return [p[0] + holder.position.x, p[1] + holder.position.y];
  }

  // ---------------------------------------------------------------- 幸运泡、掉落预告

  /**
   * 幸运泡（docs/01 9.3）：每次进关重新抽（界面层的随机数，不进规则）；抽到的话那个气泡套金圈、带奖励的那条鱼头上一个小礼物。
   * 每日挑战、演示没有
   */
  private planLucky(): void {
    this.lucky = null;
    if (this.arg.daily || this.arg.demo) return;
    const eco = App.config.eco;
    const plan = Lucky.plan(this.s, eco, this.arg.level, this.rng, Features.isUnlocked(eco, 'album', App.save.data.level));
    // 不和稀客挤在同一个气泡上
    if (!plan || (this.guest && this.guest.bubble === plan.bubble)) return;
    this.lucky = { plan, done: false };
    this.field.addLucky(plan.bubble, plan.fish);
  }

  /** 带奖励的那条鱼被取走了（点的、渔网捞的、洋流带的都算）：当场入账，奖励从礼物那里飞出去——技能飞到技能键上，金币、卡往顶上飞 */
  private luckyTaken(b: number, k: number): void {
    const l = this.lucky;
    if (!l || l.done || l.plan.bubble !== b || l.plan.fish !== k) return;
    l.done = true;
    const gain = Flow.luckyGain(l.plan);
    const [x, y] = this.fieldToFly(this.field.unlucky(b));
    const card = gain.card !== null;
    const n = img(this.fly, card ? 'icon/card_back' : gain.skill ? `icon/skill_${gain.skill}` : 'icon/coin', card ? 54 : 68, card ? 72 : 68, 'luckyPrize');
    at(n, x, y);
    fx.sparkle(this.fly, x, y, 12, 110, COLOR.yellow, 32);
    fx.ring(this.fly, x, y, 50, 220, COLOR.yellow);
    sfx(card ? 'card' : gain.skill ? 'unlock' : 'coin');
    buzz('light');
    if (gain.coins > 0) {
      const l2 = text(null, `+${gain.coins}`, 34, { color: COLOR.yellow, outline: COLOR.navy, outlineWidth: 4 });
      fx.floatUp(this.fly, l2.node, x + 56, y + 6, 50, 0.9);
    }
    const key = gain.skill ? this.skillNodes.get(gain.skill as SkillId) : undefined;
    const tx = key ? key.node.position.x : 0;
    const ty = key ? key.node.position.y : Screen.top + 60;
    n.setScale(0.4, 0.4, 1);
    tween(n)
      .to(0.2, { scale: new Vec3(1.25, 1.25, 1) }, { easing: 'backOut' })
      .delay(0.35)
      .call(() =>
        fx.flyArc(n, tx, ty, 0.5, 120, 'quadIn', () => {
          n.destroy();
          if (key && key.node.isValid) {
            fx.squash(key.node, 1.2);
            this.refreshSkills();
          }
        }, 0.6),
      )
      .start();
  }

  /**
   * 掉落关「下一个落下」预告（docs/01 9.3「看得到才公平」）：暂存槽右边（4 格时）一个小气泡，里面是候场队头那个气泡装的鱼
   * （迷雾泡画问号），上面一行小字「接下来」。队头换了就换一个；候场的落完了收起来
   */
  private syncDrop(animate: boolean): void {
    const s = this.s;
    const idx = s.nextDrop < s.bubbles.length && s.bubbles[s.nextDrop].count() > 0 && !s.bubbles[s.nextDrop].onField ? s.nextDrop : -1;
    if (idx === this.dropShown) return;
    this.dropShown = idx;
    if (this.dropNext && this.dropNext.isValid) {
      const old = this.dropNext;
      Tween.stopAllByTarget(old);
      if (animate) tween(old).to(0.2, { position: new Vec3(old.position.x, old.position.y - 60, 0), scale: new Vec3(0.5, 0.5, 1) }).call(() => old.destroy()).start();
      else old.destroy();
    }
    this.dropNext = null;
    if (idx < 0) return;
    // 掉落关暂存槽是 4 格，槽右边空着一块：放在那里，不压气泡场（短屏上气泡堆到场地顶，放场地角上会盖住气泡）。
    // 暂存槽 5 格时（调试页的简单档）那里放不下，退到场地右上角
    const beside = this.s.bufferCap <= 4;
    const S = beside ? 88 : 104;
    const node = img(this.stage, 'kit/bubble_small', S, S, 'dropNext');
    if (beside) at(node, Screen.W / 2 - 14 - S / 2, this.bufferY - 8);
    else at(node, Screen.W / 2 - 24 - S / 2, this.fieldTop - S / 2 - 26);
    const cap = text(node, tr('UI_NEXT_TANKS'), 20, { color: COLOR.yellow, outline: COLOR.navy, outlineWidth: 4 });
    at(cap.node, 0, S / 2 + 10);
    fit(cap, S + 30, 20, 14);
    const b = s.bubbles[idx];
    const fish = b.fish.filter((f) => f >= 0);
    const fs = (fish.length <= 1 ? 0.6 : fish.length <= 3 ? 0.4 : 0.35) * S;
    const d = fish.length <= 1 ? 0 : S * 0.21;
    fish.forEach((sp, k) => {
      const a = (Math.PI * 2 * k) / fish.length + Math.PI / 2;
      const f = img(node, b.fog > 0 ? 'skin/j_mystery' : this.field.spriteFor(sp), fs, fs, `f${k}`);
      // 两条左右并排，三条以上围一圈
      if (fish.length === 2) at(f, (k === 0 ? -1 : 1) * d, 0);
      else at(f, Math.cos(a) * d, Math.sin(a) * d);
    });
    opacity(node).opacity = 235;
    if (animate) fx.popIn(node, 0.25, 0.25);
    fx.bob(node, 3, 2.2, 0);
    this.dropNext = node;
  }

  private showHint(): void {
    this.idle = 0;
    const t = Bots.hintTap(this.s, this.rng);
    if (!t) return;
    this.ringAt(t);
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
    this.setUndo(null);
    this.prefillLeft = Math.min(this.prefillLeft, this.s.buffer.length);
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
