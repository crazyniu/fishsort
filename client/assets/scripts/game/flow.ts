// 局内流程：开局提示、第一步、技能、开缸位、暂停 / 离开、复活 / 失败、过关结算（docs/01 第 2–5 节）。
// 界面只调这里，这里调 core；存档在关键节点立即写（docs/04 第 6 节）。
import { Mask, Node, UITransform, Vec3, tween } from 'cc';
import * as LevelCurve from '../core/gen/levelCurve';
import * as Album from '../core/meta/album';
import * as Cards from '../core/meta/cards';
import * as DailyChallenge from '../core/meta/dailyChallenge';
import * as Dex from '../core/meta/dex';
import * as LevelChest from '../core/meta/levelChest';
import * as Lucky from '../core/meta/lucky';
import * as Stars from '../core/meta/stars';
import * as Seas from '../core/meta/seas';
import * as Lives from '../core/meta/lives';
import * as Meta from '../core/meta/meta';
import * as PlayerData from '../core/meta/playerData';
import type { CardResult } from '../core/meta/save';
import * as Settle from '../core/meta/settle';
import * as Skills from '../core/meta/skills';
import * as Tasks from '../core/meta/tasks';
import { LoseReason, Status } from '../core/model/gameState';
import { Rng } from '../core/rng/rng';
import * as Rules from '../core/rules/rules';
import { App } from '../services/app';
import { playMusic, sfx } from '../services/audio';
import { mono, now, today } from '../services/clock';
import * as fx from '../ui/fx';
import { tipArt } from './tipArt';
import { tr } from '../ui/i18n';
import { COLOR, at, box, button, fit, fmt, img, lazyImg, slice, text } from '../ui/kit';
import * as Alive from '../ui/alive';
import { closeAllPopups, openPopup, popupCount } from '../ui/popup';
import { confirmLeave, giftPopup, livesPopup, revealCards, settingsPopup, skillName, spend, watchAd } from '../ui/popups';
import { ui } from '../ui/shell';
import type { GamePage } from './gameView';
import * as ComboGoal from '../core/meta/comboGoal';
import { levelKind } from './levelKind';
import * as Features from '../core/meta/features';

const rng = new Rng(Date.now() >>> 0);

/** 局内送出的卡（连击）：当场提示，结算时翻 */
const pendingCards: CardResult[] = [];

// ---------------------------------------------------------------- 开始

/** 从主页 / 选关开始一关：生命不够弹生命弹窗（docs/01 5.1） */
export function startLevel(level: number): void {
  const s = App.save.data;
  if (!Lives.canStart(s, App.config.eco, level, now())) {
    livesPopup();
    return;
  }
  pendingCards.length = 0;
  ui.go('game', { level });
}

/**
 * 难度调试页：电脑替玩家打一遍（docs/01 9.7）。route = 按关卡里的参考解，能打完就证明这一档一定过得去；
 * casual = 按「正常打法」现场打一局。不记成绩、不扣命、不算连输，打完回调试页。调试用，字直接写
 */
export function startDemo(level: number, kind: 'route' | 'casual'): void {
  pendingCards.length = 0;
  ui.go('game', { level, demo: kind });
}

/** 演示打完（或对不上停下）：报一句结果，回调试页 */
function demoDone(g: GamePage, msg: string): void {
  g.ended = true;
  pendingCards.length = 0;
  closeAllPopups();
  ui.toast(msg);
  ui.go('lab');
}

export function demoStuck(g: GamePage): void {
  demoDone(g, `演示第 ${g.demoStep} 步点不下去（路线和局面对不上），截图告诉开发`);
}

export function startDaily(): void {
  pendingCards.length = 0;
  const s = App.save.data;
  const eco = App.config.eco;
  const level = DailyChallenge.levelFor(today(), s.level, eco.dailyChallenge.levelStep, App.config.levelCount);
  ui.go('game', { level, daily: true });
}

export function onLevelStart(g: GamePage): void {
  playMusic();
  const s = App.save.data;
  if (g.arg.demo) {
    ui.toast(g.arg.demo === 'route' ? '电脑按关卡里存的路线打，不用道具；金圈是下一步要点的鱼' : '电脑按「正常打法」打一局，每次走法都不一样');
    return;
  }
  if (App.flags.autoplay && !g.arg.daily) {
    g.showIntro();
    return;
  }
  if (g.arg.daily) return; // 每日挑战不出新机制说明、提示和技能教学（docs/01 5.11）
  const lvl = g.arg.level;
  const tips: string[] = [];
  // 到了一片新海域的第一关：先介绍这片海域（背景、名字、这里新出的鱼），第一片海域不弹（docs/01 5.0）
  const seas = Seas.list(App.config.eco);
  const seaIdx = seas.findIndex((x, i) => i > 0 && x.levelFrom === lvl);
  if (seaIdx > 0) tips.push(`sea_${seas[seaIdx].id}`);
  // 机制说明跟着难度曲线的解锁关走（level_curve.json），不另写死关号
  const mech = App.config.eco.mechanicIntro[LevelCurve.unlockedAt(App.config.curve, lvl)];
  if (mech) tips.push(mech);
  // 一关可以挂几条，逗号隔开（第 6 关：排队泡首发 + 生命开始要算）
  const extra = App.config.ui.tips[String(lvl)];
  if (extra) for (const key of extra.split(',')) tips.push(key);
  // 解锁关的新技能：不弹窗，等第一次能用上时压暗全屏强制教（checkTutorial）
  g.tutor = '';
  for (const id of Skills.ids(App.config.eco)) {
    if (Skills.unlockLevel(App.config.eco, id) === lvl && !PlayerData.tipSeen(s, `skill_${id}`)) g.tutor = id;
  }
  const show = (i: number) => {
    const key = tips[i];
    // 说明都看完了：难关、超难关出开局横幅
    if (key === undefined) return g.showIntro();
    if (PlayerData.tipSeen(s, key)) return show(i + 1);
    PlayerData.markTip(s, key);
    App.save.write();
    g.paused = true;
    const popup = key.startsWith('sea_') ? seaPopup : tipPopup;
    popup(key, () => {
      g.paused = false;
      show(i + 1);
    });
  };
  fx.delay(g.node, App.config.ui.tutorial.delay, () => show(0));
}

/** 新海域：这片海域的画面 + 名字，下面一排这里新出的鱼（会眨眼、会动），「出发」关掉 */
function seaPopup(key: string, done: () => void): void {
  const eco = App.config.eco;
  const seas = Seas.list(eco);
  const idx = seas.findIndex((x) => `sea_${x.id}` === key);
  if (idx < 0) return done();
  const sea = seas[idx];
  const p = openPopup({ w: 620, h: 660, title: tr('SEA_NEW'), onClose: done });
  const pw = 540;
  const ph = 280;
  const pic = box('pic', p.body, pw, ph);
  at(pic, 0, 150);
  pic.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
  at(lazyImg(pic, `bg/sea_${sea.id}`, pw, pw * 1.5), 0, pw * 0.45);
  const plate = slice(pic, 'kit/title_plate', 300, 70, 'name');
  at(plate, 0, -ph / 2 + 46);
  fit(text(plate, tr(`ALBUM_BOOK_${idx + 1}`), 38), 270, 38, 24);
  // 这片海域在局内出场的鱼（只列这片海域自己的）
  const own = Seas.speciesPools(eco, idx)[0].filter((id) => App.config.speciesById.get(id)?.inLevel);
  const line = text(p.body, tr('SEA_NEW_LINE', own.length), 32);
  at(line.node, 0, -30);
  const n = Math.min(own.length, 8);
  const cell = Math.min(70, 560 / Math.max(1, n));
  own.slice(0, n).forEach((id, i) => {
    const f = img(p.body, `fish/${id}`, cell, cell, `f${i}`);
    at(f, (i - (n - 1) / 2) * cell, -100);
    Alive.idle(f, Alive.shapeOf(id), i);
    Alive.blink(f, id, cell);
    fx.popIn(f, 0.15 + i * 0.05, 0.25);
  });
  const ok = button(p.body, { color: 'green', w: 340, h: 96, label: tr('SEA_GO'), onTap: () => p.close() });
  at(ok.node, 0, -220);
}

function tipPopup(key: string, done: () => void): void {
  const isSkill = key.startsWith('skill_');
  const id = key.slice(6);
  const p = openPopup({ w: 600, h: 580, title: tr('MECH_TITLE'), onClose: done });
  // 上面一张图：技能是技能图标，机制是用局内的图摆的小场景（tipArt）
  if (isSkill) {
    const icon = img(p.body, `icon/skill_${id}`, 190, 190, 'icon');
    at(icon, 0, 110);
    fx.breathe(icon, 0.06, 1.2);
  } else {
    at(tipArt(p.body, key), 0, 110);
  }
  const msg = isSkill ? tr('UI_SKILL_TRY', skillName(id)) : tr(key);
  const l = text(p.body, msg, 32, { width: 520 });
  at(l.node, 0, -72);
  const ok = button(p.body, { color: 'green', w: 340, h: 96, label: tr('GOT_IT'), onTap: () => p.close() });
  at(ok.node, 0, -202);
}

/** 新技能的强制教学：这一关第一次能用上它（有效果）时才开始；网兜要先有缸 */
export function checkTutorial(g: GamePage): void {
  const id = g.tutor;
  if (!id || g.ended || g.paused || g.finishing || g.s.status !== Status.PLAYING || popupCount() > 0 || App.flags.autoplay || g.arg.demo) return;
  if ((g.used[id] ?? 0) > 0) {
    g.tutor = '';
    return;
  }
  if (id === 'blow' && g.s.buffer.length < App.config.ui.tutorial.blowMinBuffer) return;
  if (hasEffect(g, id)) return;
  const s = App.save.data;
  PlayerData.markTip(s, `skill_${id}`);
  App.save.write();
  g.startTutorial(id, () => {
    // 强制教学这一次不算进星级的道具数（docs/01 9.5）
    const before = g.usedAll;
    useSkill(g, id);
    if (g.usedAll > before) g.freebies++;
  });
}

/** 第一步有效操作：每日挑战的免费次这时才记（docs/01 5.11） */
export function onFirstMove(g: GamePage): void {
  if (!g.arg.daily) return;
  const s = App.save.data;
  if (DailyChallenge.isFree(s, today())) {
    DailyChallenge.enter(s, App.config.eco, today(), 'free');
    App.save.write();
  }
}

// ---------------------------------------------------------------- 技能

/** 当前没有效果的技能不扣数量，局内给一句提示（docs/01 5.2） */
export function hasEffect(g: GamePage, id: string): string | null {
  const s = g.s;
  // 撤销：还没点过，或上一步是用道具、开缸（那些退不回去）。提示在 useSkill 里现算（算一次要想几百个局面，这里每帧都可能被问）
  if (id === 'undo') return g.canUndo ? null : 'UI_UNDO_EMPTY';
  if (id === 'hint') return null;
  if (id === 'blow' && s.buffer.length === 0) return 'UI_BLOW_EMPTY';
  if (id === 'shuffle' && Rules.useShuffle(s.clone(), 1).length === 0) return 'UI_SHUFFLE_EMPTY';
  if (id === 'net' && !s.slots.some((b, i) => b !== null && i < s.openSlots)) return 'UI_CURRENT_EMPTY';
  return null;
}

export function useSkill(g: GamePage, id: string): void {
  if (g.ended || g.paused || g.s.status !== Status.PLAYING || g.finishing) return;
  // 渔网正等着选缸：这时再按别的技能（尤其撤销，会把版面整个重画、渔网白扣一个）不响应，提示先选缸
  if (g.netMode) {
    ui.toast(tr('UI_NET_HINT'));
    return;
  }
  const s = App.save.data;
  const eco = App.config.eco;
  const lvl = g.arg.daily ? s.level : Math.max(s.level, g.arg.level);
  if (!Skills.isUnlocked(eco, id, lvl)) {
    // 未解锁：按钮晃一下并响错误音，不弹提示（docs/01 5.2）
    sfx('error');
    return;
  }
  const none = hasEffect(g, id);
  if (none) {
    ui.toast(tr(none));
    return;
  }
  // 提示：先算出要亮哪一步，算不出来（没有能点的）不扣
  const hintTap = id === 'hint' ? g.skillHintTap() : null;
  if (id === 'hint' && !hintTap) {
    // 点哪条都会把暂存槽塞满：提示帮不了，让玩家先用吹泡、洗牌（不扣提示）
    ui.toast(tr(g.skillHintBlocked() ? 'UI_HINT_STUCK' : 'UI_HINT_EMPTY'));
    return;
  }
  const used = g.used[id] ?? 0;
  const r = Skills.tryUse(s, eco, id, used, today(), g.freeLevelId, g.usedAll);
  if (!r.ok) {
    if (r.reason === 'limit') ui.toast(tr('UI_TOOL_LIMIT'));
    else if (r.reason === 'empty') buySkill(g, id);
    return;
  }
  g.used[id] = used + 1;
  App.save.write();
  g.refreshSkills();
  // 撤销、提示有自己的音效（tools/audio/synth.py：两声往下滑的短音、两个往上的轻铃音）
  sfx(id);
  if (id === 'undo') {
    g.undo();
    g.refreshSkills();
  } else if (id === 'hint' && hintTap) g.showSkillHint(hintTap);
  else if (id === 'shuffle') g.act(() => Rules.useShuffle(g.s, rng.nextU32()));
  else if (id === 'blow') g.act(() => Rules.useBlow(g.s));
  else if (id === 'net') g.enterNetMode();
}

export function finishNet(g: GamePage, slot: number): void {
  g.act(() => Rules.useNet(g.s, slot));
}

/** 数量为 0：金币买，金币不够则看广告得 1 个（docs/01 5.2）；这一版没有广告时只有金币买，弹窗矮一截 */
function buySkill(g: GamePage, id: string): void {
  const eco = App.config.eco;
  // 看广告的那一行：这一版有广告、而且现在拉到了才有；拉不到整行不出现、弹窗矮一截（用户 2026-11-20）
  const hasAds = App.platform.hasCapability('ads') && App.platform.adsAvailable();
  const dy = hasAds ? 0 : -55;
  const name = skillName(id);
  const p = openPopup({ w: 600, h: hasAds ? 560 : 450, title: tr('SKILL_BUY_TITLE', name), mascot: null });
  const icon = img(p.body, `icon/skill_${id}`, 180, 180, 'icon');
  at(icon, 0, 100 + dy);
  const price = Skills.price(eco, id);
  const buy = button(p.body, {
    color: 'green',
    w: 420,
    h: 100,
    icon: 'icon/coin',
    label: String(price),
    onTap: () => {
      if (!spend(price)) return;
      Skills.buy(App.save.data, eco, id);
      App.save.write();
      sfx('coin');
      p.close();
      g.refreshSkills();
    },
  });
  at(buy.node, 0, -60 + dy);
  if (!hasAds) return;
  const ad = button(p.body, {
    color: 'yellow',
    w: 420,
    h: 92,
    icon: 'kit/ic_video',
    label: tr('SKILL_AD'),
    onTap: async () => {
      if (!(await watchAd('rv_tool'))) return;
      Skills.add(App.save.data, id);
      App.save.write();
      p.close();
      g.refreshSkills();
    },
  });
  at(ad.node, 0, -170);
}

// ---------------------------------------------------------------- 开缸位（定版图 18 左）

export function unlockSlot(g: GamePage): void {
  if (g.finishing || Rules.nextBowlSlot(g.s) < 0) return;
  const eco = App.config.eco;
  // 这一版没有广告时只有金币开，弹窗矮一截
  // 看广告的那一行：这一版有广告、而且现在拉到了才有；拉不到整行不出现、弹窗矮一截（用户 2026-11-20）
  const hasAds = App.platform.hasCapability('ads') && App.platform.adsAvailable();
  const dy = hasAds ? 0 : -55;
  const p = openPopup({ w: 600, h: hasAds ? 620 : 510, title: tr('H_SLOT_TITLE'), mascot: null });
  const bowl = img(p.body, 'skin/j_bowl', 220, 203, 'bowl');
  at(bowl, 0, 130 + dy);
  const plus = img(bowl, 'kit/round_green', 80, 80, 'plus');
  img(plus, 'kit/ic_plus', 50, 50, 'glyph');
  const l = text(p.body, tr('SLOT_LINE'), 34);
  at(l.node, 0, -10 + dy);
  const done = () => {
    p.close();
    // 加开鱼缸算用了一样道具（星级，docs/01 9.5）
    g.extras++;
    g.act(() => Rules.unlockBowl(g.s));
    sfx('unlock');
  };
  const coins = button(p.body, {
    color: 'green',
    w: 420,
    h: 100,
    icon: 'icon/coin',
    label: fmt(eco.bowlSlotCoinPrice),
    onTap: () => {
      if (Rules.nextBowlSlot(g.s) < 0 || !spend(eco.bowlSlotCoinPrice)) return;
      App.save.data.coins -= eco.bowlSlotCoinPrice;
      App.save.write();
      done();
    },
  });
  at(coins.node, 0, -120 + dy);
  if (!hasAds) return;
  const ad = button(p.body, {
    color: 'yellow',
    w: 420,
    h: 92,
    icon: 'kit/ic_video',
    label: tr('H_WATCH_AD'),
    onTap: async () => {
      if (Rules.nextBowlSlot(g.s) >= 0 && await watchAd('rv_bowl_slot')) done();
    },
  });
  at(ad.node, 0, -230);
}

// ---------------------------------------------------------------- 暂停、离开

export function pause(g: GamePage): void {
  if (g.ended || g.finishing) return;
  g.paused = true;
  // 暂停弹窗底部放 Banner（docs/01 7.1 bn_result：结算、暂停弹窗底部）
  App.platform.showBanner('bn_result');
  settingsPopup('pause', {
    onClose: () => {
      g.paused = false;
      App.platform.hideBanner();
    },
    onHome: () => leave(g, () => ui.go(g.arg.daily ? 'daily' : g.arg.demo ? 'lab' : 'home')),
    onRetry: () => leave(g, () => restart(g)),
  });
}

/** 走过步时离开 / 重试要扣命，先确认（docs/01 5.1） */
function leave(g: GamePage, then: () => void): void {
  if (g.arg.demo) {
    then();
    return;
  }
  const s = App.save.data;
  const eco = App.config.eco;
  const costs = !g.arg.daily && g.moved && g.arg.level > eco.lives.freeUntilLevel && !Lives.isUnlimited(s, now());
  const go = () => {
    endRun(g);
    if (!g.arg.daily && g.moved) {
      Lives.lose(s, eco, g.arg.level, true, now());
      Meta.failLevel(s, eco, g.arg.level);
    }
    App.save.write();
    then();
  };
  if (costs) confirmLeave(go);
  else go();
}

function restart(g: GamePage): void {
  if (g.arg.demo) {
    startDemo(g.arg.level, g.arg.demo);
    return;
  }
  if (g.arg.daily) {
    ui.go('daily');
    return;
  }
  if (!Lives.canStart(App.save.data, App.config.eco, g.arg.level, now())) {
    ui.go('home');
    livesPopup();
    return;
  }
  ui.go('game', { level: g.arg.level });
}

/** 一局结束（过关、失败、离开）都要做的：最高连击记进存档 */
function endRun(g: GamePage): void {
  const s = App.save.data;
  s.bestCombo = Math.max(s.bestCombo, g.combo.best);
  // 每日任务：救了几只、最高连击，输了、中途离开也算（docs/01 5.9）；一局只记一次
  if (g.tallied) return;
  g.tallied = true;
  const eco = App.config.eco;
  Tasks.add(s, eco, today(), 'rescue', g.rescued);
  Tasks.add(s, eco, today(), 'combo', g.combo.best);
  Tasks.add(s, eco, today(), 'bowls', g.s.bowlsDone);
  Tasks.add(s, eco, today(), 'play');
}

// ---------------------------------------------------------------- 连击送卡

export function comboCard(g: GamePage): void {
  if (g.arg.demo) return;
  const s = App.save.data;
  const eco = App.config.eco;
  const rarity = Cards.rollRarity(eco, eco.chest.cardRates, rng);
  const card = Cards.give(s, eco, Cards.pick(s, Album.pool(eco, App.config.species, s.level), rarity, rng));
  pendingCards.push(card);
  App.save.write();
  // 提示放在屏幕中间偏下、晚半拍出来：不和上面的升档夸奖词叠在一起
  fx.delay(g.fxLayer(), 0.45, () => {
    const tip = text(null, tr('UI_COMBO_CARD'), 44, { color: COLOR.yellow });
    tip.updateRenderData(true);
    const card = img(tip.node, 'icon/card_back', 54, 72, 'card');
    at(card, -(tip.node.getComponent(UITransform)?.width ?? 300) / 2 - 44, 0);
    card.angle = 10;
    fx.floatUp(g.fxLayer(), tip.node, 22, -60, 90, 1.3);
    sfx('card');
  });
}

// ---------------------------------------------------------------- 幸运泡

/** 幸运泡里带奖励的那条鱼被取走：当场入账（卡留到结算页翻），返回给了什么，界面拿去飞图标 */
export function luckyGain(plan: Lucky.LuckyPlan): Lucky.LuckyGain {
  const s = App.save.data;
  const eco = App.config.eco;
  const gain = Lucky.grant(s, eco, plan, Album.pool(eco, App.config.species, s.level), rng);
  if (gain.card) pendingCards.push(gain.card);
  App.save.write();
  return gain;
}

// ---------------------------------------------------------------- 失败、复活

const LOSE_KEY: Record<number, string> = {
  [LoseReason.BUFFER_FULL]: 'UI_LOSE_BUFFER',
  [LoseReason.TIMEOUT]: 'UI_LOSE_TIMEOUT',
  [LoseReason.CLOCK]: 'UI_LOSE_TIMEOUT',
  [LoseReason.STUCK]: 'UI_LOSE_STUCK',
};
const REVIVE_KEY: Record<number, string> = {
  [LoseReason.BUFFER_FULL]: 'REVIVE_BUFFER',
  [LoseReason.TIMEOUT]: 'REVIVE_TIMEOUT',
  [LoseReason.CLOCK]: 'REVIVE_CLOCK',
  [LoseReason.STUCK]: 'REVIVE_STUCK',
};

export function lose(g: GamePage): void {
  if (g.s.status !== Status.LOST) return;
  if (g.arg.demo) {
    const why = g.s.loseReason === LoseReason.BUFFER_FULL ? '暂存槽满了' : '没有能点的鱼了';
    const wrong = g.demoFatal >= 0 ? `（第 ${g.demoFatal + 1} 步就走错了）` : '';
    demoDone(g, g.arg.demo === 'route' ? `电脑按路线没过（第 ${g.demoStep} 步${why}，不该发生），截图告诉开发` : `正常打法这局输了：第 ${g.demoStep} 步${why}${wrong}`);
    return;
  }
  sfx('lose');
  if (App.flags.autoplay && !g.arg.daily) {
    autoRetry(g);
    return;
  }
  // 暂存槽满了、手里还有能用的吹泡：先让用道具接着玩，不直接进复活 / 失败（docs/01 5.2）
  if (g.s.loseReason === LoseReason.BUFFER_FULL && !g.arg.daily && canRescue(g)) rescuePopup(g);
  else afterRescue(g);
}

function afterRescue(g: GamePage): void {
  if (!g.s.revived && App.platform.adsAvailable()) revivePopup(g);
  else failPopup(g);
}

/** 救场用哪个道具（暂存槽满 → 吹泡） */
const RESCUE_SKILL = 'blow';

function canRescue(g: GamePage): boolean {
  return Skills.canUse(App.save.data, App.config.eco, RESCUE_SKILL, g.used[RESCUE_SKILL] ?? 0, g.freeLevelId, g.usedAll) === '';
}

/**
 * 「暂存槽满了」：大大的吹泡图标 + 还有几个（今天的免费次写「免费」），主按钮「用吹泡」——扣一个、清空暂存槽、接着玩；
 * 「不用」走原来的复活 / 失败。不看广告、不占每关一次的复活，算本关用了一次吹泡
 */
function rescuePopup(g: GamePage): void {
  g.paused = true;
  const s = App.save.data;
  const eco = App.config.eco;
  const p = openPopup({ w: 640, h: 760, title: tr('RESCUE_TITLE'), noClose: true, mascot: null });
  const icon = img(p.body, `icon/skill_${RESCUE_SKILL}`, 240, 240, 'skill');
  at(icon, 0, 140);
  fx.breathe(icon, 0.06, 0.8);
  const free = g.skillFree(RESCUE_SKILL);
  const tag = slice(icon, 'kit/tag_red', free ? 120 : 96, 56, 'count');
  at(tag, 100, 90);
  at(text(tag, free ? tr('UI_SKILL_FREE') : `×${Skills.count(s, RESCUE_SKILL)}`, 30).node, 0, 2);
  const line = text(p.body, tr('RESCUE_LINE'), 34, { width: 540 });
  at(line.node, 0, -60);
  const use = button(p.body, {
    color: 'green',
    w: 500,
    h: 110,
    label: tr('RESCUE_USE'),
    onTap: () => {
      const r = Skills.tryUse(s, eco, RESCUE_SKILL, g.used[RESCUE_SKILL] ?? 0, today(), g.freeLevelId, g.usedAll);
      if (!r.ok) return;
      g.used[RESCUE_SKILL] = (g.used[RESCUE_SKILL] ?? 0) + 1;
      App.save.write();
      p.close();
      g.paused = false;
      sfx(RESCUE_SKILL);
      const ev = Rules.rescueBlow(g.s);
      g.resync();
      g.play(ev, false);
      g.refreshSkills();
    },
  });
  at(use.node, 0, -190);
  const skip = button(p.body, {
    color: 'blue',
    w: 460,
    h: 92,
    label: tr('RESCUE_SKIP'),
    onTap: () => {
      p.close();
      afterRescue(g);
    },
  });
  at(skip.node, 0, -300);
}

/** 复活（定版图 14）：按失败原因写效果，每关一次，看广告 */
function revivePopup(g: GamePage): void {
  g.paused = true;
  const reason = g.s.loseReason;
  const p = openPopup({ w: 640, h: 760, title: tr('REVIVE_TITLE'), noClose: true, mascot: null });
  const bubble = img(p.body, 'kit/bubble', 300, 300, 'bubble');
  at(bubble, 0, 130);
  const fish = img(bubble, 'fish/c01', 200, 200, 'fish');
  fx.bob(fish, 8, 1.6);
  const line = text(p.body, tr(REVIVE_KEY[reason] ?? 'H_REVIVE_LINE'), 34, { width: 540 });
  at(line.node, 0, -70);
  const ad = button(p.body, {
    color: 'yellow',
    w: 500,
    h: 110,
    icon: 'kit/ic_video',
    label: tr('H_REVIVE_AD'),
    onTap: async () => {
      if (!(await watchAd('rv_revive'))) return;
      p.close();
      g.paused = false;
      g.extras++;
      const ev = Rules.revive(g.s);
      g.resync();
      g.play(ev, false);
    },
  });
  at(ad.node, 0, -190);
  const give = button(p.body, {
    color: 'blue',
    w: 460,
    h: 92,
    label: tr('H_GIVE_UP'),
    onTap: () => {
      p.close();
      failPopup(g);
    },
  });
  at(give.node, 0, -300);
}

/** 失败（定版图 15）：原因、扣命时「生命 −1」、重试 / 回主页；每日挑战回每日挑战页走再试流程 */
function failPopup(g: GamePage): void {
  g.ended = true;
  g.paused = true;
  endRun(g);
  const s = App.save.data;
  const eco = App.config.eco;
  let lost = false;
  if (!g.arg.daily) {
    lost = Lives.lose(s, eco, g.arg.level, g.moved, now());
    Meta.failLevel(s, eco, g.arg.level);
  }
  App.save.write();
  const p = openPopup({ w: 640, h: 700, title: tr('UI_LOSE'), noClose: true });
  const fish = img(p.body, 'fish/c02', 220, 220, 'fish');
  at(fish, 0, 200);
  fish.angle = -8;
  fx.bob(fish, 6, 2);
  const why = text(p.body, tr(LOSE_KEY[g.s.loseReason] ?? 'UI_LOSE'), 40);
  at(why.node, 0, 50);
  if (lost) {
    const h = img(p.body, 'icon/heart', 56, 56, 'heart');
    at(h, -70, -24);
    const t = text(p.body, tr('LIFE_MINUS'), 32, { color: COLOR.yellow });
    at(t.node, 30, -24);
  }
  const retry = button(p.body, {
    color: 'green',
    w: 480,
    h: 112,
    fontSize: 44,
    label: tr(g.arg.daily ? 'DAILY_RETRY' : 'H_RETRY'),
    onTap: () => {
      p.close();
      restart(g);
    },
  });
  at(retry.node, 0, -148);
  const home = button(p.body, {
    color: 'blue',
    w: 440,
    h: 92,
    fontSize: 36,
    label: tr('H_TO_HOME'),
    onTap: () => {
      p.close();
      ui.go(g.arg.daily ? 'daily' : 'home');
    },
  });
  at(home.node, 0, -262);
}

// ---------------------------------------------------------------- 过关

export interface WinData {
  level: number;
  result: Settle.WinResult;
  chest: LevelChest.ChestResult | null;
  cards: CardResult[];
  combo: number;
  best: number;
  challenge: boolean;
  /** 这次拿了几颗星、是不是第一次三星（奖励已经入账，docs/01 9.5） */
  stars: Stars.StarResult;
}

export function win(g: GamePage): void {
  if (g.arg.demo) {
    demoDone(g, g.arg.demo === 'route' ? `电脑按路线过了：${g.demoStep} 步，没用道具` : `正常打法这局过了（${g.demoStep} 步）`);
    return;
  }
  endRun(g);
  const s = App.save.data;
  const eco = App.config.eco;
  // 救援记录：按鱼缸里装的数量累计，只算首次通关和每日挑战（docs/01 5.4）
  const counts: Record<string, number> = {};
  for (const o of g.lv.orders) {
    const id = g.species[o.s];
    if (id) counts[id] = (counts[id] ?? 0) + o.cap;
  }
  if (g.arg.daily) {
    Dex.record(s, counts);
    const r = DailyChallenge.win(s, eco, App.config.species, today(), now(), rng, g.combo.coins);
    App.save.write();
    sfx('win');
    ui.go('daily', { won: r });
    return;
  }
  if (Dex.countsWin(s, g.arg.level, false)) Dex.record(s, counts);
  const result = Settle.win(s, eco, {
    level: g.arg.level,
    challenge: g.lv.challenge,
    boss: LevelCurve.isBoss(App.config.curve, g.lv.id),
    day: today(),
    now: now(),
    combo_coins: g.combo.coins,
    best_combo: g.combo.best,
  });
  // 连击目标（docs/01 9.4）：第一次通关、这一关里连到过 N，给这一种关的奖励（卡进结算页的开卡，金币算进过关金币）
  if (g.comboGoal > 0 && g.combo.best >= g.comboGoal && !result.replay) {
    const albumOpen = Features.isUnlocked(eco, 'album', s.level);
    const rw = ComboGoal.grant(s, eco, levelKind(g.arg.level), Album.pool(eco, App.config.species, s.level), rng, albumOpen);
    if (rw.card) pendingCards.push(rw.card);
    else result.coins += rw.coins;
  }
  // 星级（docs/01 9.5）：按这一关用了几样道具记星；第一次三星多送一份（金币当场入账、卡进结算页的开卡）
  const stars = Stars.record(s, eco, g.arg.level, levelKind(g.arg.level), g.items, Album.pool(eco, App.config.species, s.level), rng, Features.isUnlocked(eco, 'album', s.level));
  if (stars.first3?.card) pendingCards.push(stars.first3.card);
  // 宝箱按开局定好的结果入账（开出卡的话就是关卡里救下的那只稀客，docs/01 3.4）
  const chest = result.chest_ok
    ? g.chestPlan
      ? LevelChest.openPlanned(s, eco, App.config.species, g.arg.level, g.chestPlan)
      : LevelChest.open(s, eco, App.config.species, g.arg.level, g.lv.challenge, rng)
    : null;
  App.save.write();
  const cards = [...pendingCards];
  pendingCards.length = 0;
  if (chest?.card) cards.push(chest.card);
  closeAllPopups();
  ui.go('result', {
    level: g.arg.level,
    result,
    chest,
    cards,
    combo: g.combo.coins,
    best: g.combo.best,
    challenge: g.lv.challenge,
    stars,
  } satisfies WinData);
}

/**
 * 结算页关掉时：开放了新功能先回主页看解锁动画；否则按插屏频控弹插屏（docs/01 7.1）。
 * 「下一关」接着刚打的那一关往后走（重玩旧关时不跳回最高进度，docs/01 5.7）。
 */
/**
 * 过关新开放、还没在主页播过解锁动画的功能。点「下一关」直接进下一关（用户 2026-11-18：开了新功能的那几关点「下一关」回了主页，
 * 看着像 bug），解锁动画留到下次回主页时播
 */
const pendingUnlocks: string[] = [];

/** 主页取走待播的解锁动画（取完清空） */
export function takeUnlocks(): string[] {
  return pendingUnlocks.splice(0);
}

export async function afterResult(d: WinData, next: boolean): Promise<void> {
  const s = App.save.data;
  // 道具礼包（第一次过了礼包关）：先弹出来说清楚，关掉再往下走（docs/01 9.6）
  const gift = d.result.gift;
  if (gift && gift.length > 0) {
    d.result.gift = undefined;
    giftPopup(gift, App.config.eco.skills.gift?.count ?? 1, () => void afterResult(d, next));
    return;
  }
  if (Meta.shouldShowInterstitial(s, App.config.ads, d.level, mono())) {
    Meta.markInterstitial(s, d.level, mono());
    App.save.write();
    await App.platform.showInterstitial('int_level_end');
  }
  for (const f of d.result.new_features) if (!pendingUnlocks.includes(f)) pendingUnlocks.push(f);
  if (next) startLevel(Math.min(d.level + 1, Math.max(s.level, App.flags.boost ? App.config.levelCount : 0)));
  else ui.go('home');
}

export function revealPending(cards: CardResult[], done: () => void): void {
  revealCards(cards, done);
}

// ---------------------------------------------------------------- 机器人代打（调试，./run.sh auto）

/** 代打打到第几关为止 */
function autoLast(): number {
  const to = App.flags.autoTo;
  return to > 0 ? Math.min(to, App.config.levelCount) : App.config.levelCount;
}

/** 代打进第 level 关：跳过生命检查（输了重打不扣命），换关的间隙不弹东西 */
function autoStart(level: number): void {
  pendingCards.length = 0;
  closeAllPopups();
  ui.go('game', { level });
}

/** 代打：结算页的卡翻完后停一会儿，自己点「下一关」；打完最后一关回主页 */
export function autoNext(d: WinData): void {
  if (!App.flags.autoplay) return;
  fx.delay(ui.fx, 1.6, () => {
    // 等的时候有人点了「下一关」或回主页，就不再替他点
    if (ui.pageName !== 'result') return;
    if (d.level >= autoLast()) {
      App.flags.autoplay = false;
      ui.go('home');
      return;
    }
    autoStart(d.level + 1);
  });
}

/** 代打输了：不弹复活和失败窗，记一次失败（连输两次会换成更易的变体，和真人一样）后重打这一关 */
function autoRetry(g: GamePage): void {
  g.ended = true;
  g.paused = true;
  endRun(g);
  Meta.failLevel(App.save.data, App.config.eco, g.arg.level);
  App.save.write();
  const level = g.arg.level;
  fx.delay(g.node, 1.2, () => autoStart(level));
}

export function nudge(n: Node): void {
  tween(n).to(0.1, { scale: new Vec3(1.1, 1.1, 1) }).to(0.1, { scale: new Vec3(1, 1, 1) }).start();
}
