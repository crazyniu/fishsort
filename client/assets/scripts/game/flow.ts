// 局内流程：开局提示、第一步、技能、开缸位、暂停 / 离开、复活 / 失败、过关结算（docs/01 第 2–5 节）。
// 界面只调这里，这里调 core；存档在关键节点立即写（docs/04 第 6 节）。
import { Node, Vec3, tween } from 'cc';
import * as Album from '../core/meta/album';
import * as Cards from '../core/meta/cards';
import * as DailyChallenge from '../core/meta/dailyChallenge';
import * as Dex from '../core/meta/dex';
import * as LevelChest from '../core/meta/levelChest';
import * as Lives from '../core/meta/lives';
import * as Meta from '../core/meta/meta';
import * as PlayerData from '../core/meta/playerData';
import type { CardResult } from '../core/meta/save';
import * as Settle from '../core/meta/settle';
import * as Skills from '../core/meta/skills';
import { LoseReason, Status } from '../core/model/gameState';
import { Rng } from '../core/rng/rng';
import * as Rules from '../core/rules/rules';
import { App } from '../services/app';
import { playMusic, sfx } from '../services/audio';
import { mono, now, today } from '../services/clock';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { COLOR, at, button, img, text } from '../ui/kit';
import { closeAllPopups, openPopup } from '../ui/popup';
import { confirmLeave, livesPopup, revealCards, settingsPopup, spend, watchAd } from '../ui/popups';
import { ui } from '../ui/shell';
import type { GamePage } from './gameView';

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
  if (g.arg.daily) return; // 每日挑战不出新机制说明、提示和技能教学（docs/01 5.11）
  const lvl = g.arg.level;
  const tips: string[] = [];
  const mech = App.config.eco.mechanicIntro[String(lvl)];
  if (mech) tips.push(mech);
  const extra = App.config.ui.tips[String(lvl)];
  if (extra) tips.push(extra);
  for (const id of Skills.ids(App.config.eco)) {
    if (Skills.unlockLevel(App.config.eco, id) === lvl) tips.push(`skill_${id}`);
  }
  const show = (i: number) => {
    const key = tips[i];
    if (key === undefined) return;
    if (PlayerData.tipSeen(s, key)) return show(i + 1);
    PlayerData.markTip(s, key);
    App.save.write();
    tipPopup(key, () => show(i + 1));
  };
  fx.delay(g.node, App.config.ui.tutorial.delay, () => show(0));
}

function tipPopup(key: string, done: () => void): void {
  const isSkill = key.startsWith('skill_');
  const id = key.slice(6);
  const p = openPopup({ w: 600, h: 520, title: tr('MECH_TITLE'), mascot: 'c01', onClose: done });
  if (isSkill) {
    const icon = img(p.body, `icon/skill_${id}`, 170, 170, 'icon');
    at(icon, 0, 90);
    fx.breathe(icon, 0.06, 1.2);
  }
  const msg = isSkill ? tr('UI_SKILL_TRY', tr(`H_SKILL_${id === 'current' ? 'FLOW' : id.toUpperCase()}`)) : tr(key);
  const l = text(p.body, msg, 36, { width: 500, color: COLOR.ink, outline: null });
  at(l.node, 0, isSkill ? -40 : 40);
  const ok = button(p.body, { color: 'green', w: 340, h: 96, label: tr('GOT_IT'), onTap: () => p.close() });
  at(ok.node, 0, -170);
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
function hasEffect(g: GamePage, id: string): string | null {
  const s = g.s;
  if (id === 'blow' && s.buffer.length === 0) return 'UI_BLOW_EMPTY';
  if (id === 'current' && Rules.useCurrent(s.clone()).length === 0) return 'UI_CURRENT_EMPTY';
  if (id === 'shuffle' && Rules.useShuffle(s.clone(), 1).length === 0) return 'UI_SHUFFLE_EMPTY';
  if (id === 'net' && !s.slots.some((b, i) => b !== null && i < s.openSlots)) return 'UI_CURRENT_EMPTY';
  return null;
}

export function useSkill(g: GamePage, id: string): void {
  if (g.ended || g.paused || g.s.status !== Status.PLAYING) return;
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
  const used = g.used[id] ?? 0;
  const r = Skills.tryUse(s, eco, id, used, today());
  if (!r.ok) {
    if (r.reason === 'limit') ui.toast(tr('UI_TOOL_LIMIT'));
    else if (r.reason === 'empty') buySkill(g, id);
    return;
  }
  g.used[id] = used + 1;
  App.save.write();
  g.refreshSkills();
  sfx(id === 'current' ? 'current' : id === 'net' ? 'net' : id);
  if (id === 'shuffle') g.act(() => Rules.useShuffle(g.s, rng.nextU32()));
  else if (id === 'blow') g.act(() => Rules.useBlow(g.s));
  else if (id === 'current') g.act(() => Rules.useCurrent(g.s));
  else if (id === 'net') g.enterNetMode();
}

export function finishNet(g: GamePage, slot: number): void {
  g.act(() => Rules.useNet(g.s, slot));
}

/** 数量为 0：金币买，金币不够则看广告得 1 个（docs/01 5.2） */
function buySkill(g: GamePage, id: string): void {
  const eco = App.config.eco;
  const name = tr(`H_SKILL_${id === 'current' ? 'FLOW' : id.toUpperCase()}`);
  const p = openPopup({ w: 600, h: 560, title: tr('SKILL_BUY_TITLE', name), mascot: null });
  const icon = img(p.body, `icon/skill_${id}`, 180, 180, 'icon');
  at(icon, 0, 100);
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
  at(buy.node, 0, -60);
  const ad = button(p.body, {
    color: 'blue',
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
  if (g.ended || g.s.status !== Status.PLAYING) return;
  const eco = App.config.eco;
  const p = openPopup({ w: 600, h: 620, title: tr('H_SLOT_TITLE'), mascot: null });
  const bowl = img(p.body, 'kit/bowl', 220, 220, 'bowl');
  at(bowl, 0, 130);
  const plus = img(bowl, 'kit/round_green', 80, 80, 'plus');
  img(plus, 'kit/ic_plus', 50, 50, 'glyph');
  const l = text(p.body, tr('SLOT_LINE'), 32, { color: COLOR.ink, outline: null });
  at(l.node, 0, -10);
  const done = () => {
    p.close();
    g.act(() => Rules.unlockBowl(g.s));
    sfx('unlock');
  };
  const coins = button(p.body, {
    color: 'green',
    w: 420,
    h: 100,
    icon: 'icon/coin',
    label: String(eco.bowlSlotCoinPrice),
    onTap: () => {
      if (!spend(eco.bowlSlotCoinPrice)) return;
      App.save.data.coins -= eco.bowlSlotCoinPrice;
      App.save.write();
      done();
    },
  });
  at(coins.node, 0, -120);
  const ad = button(p.body, {
    color: 'blue',
    w: 420,
    h: 92,
    icon: 'kit/ic_video',
    label: tr('H_WATCH_AD'),
    onTap: async () => {
      if (await watchAd('rv_bowl_slot')) done();
    },
  });
  at(ad.node, 0, -230);
}

// ---------------------------------------------------------------- 暂停、离开

export function pause(g: GamePage): void {
  if (g.ended) return;
  g.paused = true;
  settingsPopup('pause', {
    onClose: () => (g.paused = false),
    onHome: () => leave(g, () => ui.go(g.arg.daily ? 'daily' : 'home')),
    onRetry: () => leave(g, () => restart(g)),
  });
}

/** 走过步时离开 / 重试要扣命，先确认（docs/01 5.1） */
function leave(g: GamePage, then: () => void): void {
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
}

// ---------------------------------------------------------------- 连击送卡

export function comboCard(g: GamePage): void {
  const s = App.save.data;
  const eco = App.config.eco;
  const rarity = Cards.rollRarity(eco, eco.chest.cardRates, rng);
  const card = Cards.give(s, eco, Cards.pick(s, Album.pool(eco, App.config.species, s.level), rarity, rng));
  pendingCards.push(card);
  App.save.write();
  const tip = text(null, tr('UI_COMBO_CARD'), 44, { color: COLOR.yellow });
  fx.floatUp(g.fxLayer(), tip.node, 0, 120, 120, 1.2);
  sfx('card');
}

// ---------------------------------------------------------------- 失败、复活

const LOSE_KEY: Record<number, string> = {
  [LoseReason.BUFFER_FULL]: 'UI_LOSE_BUFFER',
  [LoseReason.TIMEOUT]: 'UI_LOSE_TIMEOUT',
  [LoseReason.STUCK]: 'UI_LOSE_STUCK',
};
const REVIVE_KEY: Record<number, string> = {
  [LoseReason.BUFFER_FULL]: 'REVIVE_BUFFER',
  [LoseReason.TIMEOUT]: 'REVIVE_TIMEOUT',
  [LoseReason.STUCK]: 'REVIVE_STUCK',
};

export function lose(g: GamePage): void {
  if (g.s.status !== Status.LOST) return;
  sfx('lose');
  if (!g.s.revived && App.platform.adsAvailable()) revivePopup(g);
  else failPopup(g);
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
    color: 'green',
    w: 500,
    h: 110,
    icon: 'kit/ic_video',
    label: tr('H_REVIVE_AD'),
    onTap: async () => {
      if (!(await watchAd('rv_revive'))) return;
      p.close();
      g.paused = false;
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
  const p = openPopup({ w: 640, h: 820, blue: true, noClose: true, mascot: null });
  const title = text(p.body, tr('UI_LOSE'), 76);
  at(title.node, 0, 320);
  const fish = img(p.body, 'fish/c02', 220, 220, 'fish');
  at(fish, 0, 140);
  fish.angle = -8;
  fx.bob(fish, 6, 2);
  const why = text(p.body, tr(LOSE_KEY[g.s.loseReason] ?? 'UI_LOSE'), 44);
  at(why.node, 0, -10);
  if (lost) {
    const h = img(p.body, 'icon/heart', 60, 60, 'heart');
    at(h, -70, -80);
    const t = text(p.body, tr('LIFE_MINUS'), 34, { color: COLOR.yellow });
    at(t.node, 30, -80);
  }
  const retry = button(p.body, {
    color: 'green',
    w: 480,
    h: 110,
    label: tr(g.arg.daily ? 'DAILY_RETRY' : 'H_RETRY'),
    onTap: () => {
      p.close();
      restart(g);
    },
  });
  at(retry.node, 0, -200);
  const home = button(p.body, {
    color: 'blue',
    w: 440,
    h: 96,
    label: tr('H_TO_HOME'),
    onTap: () => {
      p.close();
      ui.go(g.arg.daily ? 'daily' : 'home');
    },
  });
  at(home.node, 0, -320);
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
}

export function win(g: GamePage): void {
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
    day: today(),
    now: now(),
    combo_coins: g.combo.coins,
    best_combo: g.combo.best,
  });
  const chest = result.chest_ok ? LevelChest.open(s, eco, App.config.species, g.arg.level, g.lv.challenge, rng) : null;
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
  } satisfies WinData);
}

/** 结算页关掉时：开放了新功能先回主页看解锁动画；否则按插屏频控弹插屏（docs/01 7.1） */
export async function afterResult(d: WinData, next: boolean): Promise<void> {
  const s = App.save.data;
  if (Meta.shouldShowInterstitial(s, App.config.ads, d.level, mono())) {
    Meta.markInterstitial(s, d.level, mono());
    App.save.write();
    await App.platform.showInterstitial('int_level_end');
  }
  if (next && d.result.new_features.length === 0) startLevel(s.level);
  else ui.go('home', { unlocked: d.result.new_features });
}

export function revealPending(cards: CardResult[], done: () => void): void {
  revealCards(cards, done);
}

export function nudge(n: Node): void {
  tween(n).to(0.1, { scale: new Vec3(1.1, 1.1, 1) }).to(0.1, { scale: new Vec3(1, 1, 1) }).start();
}
