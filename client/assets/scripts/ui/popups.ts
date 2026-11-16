// 各页共用的弹窗：恭喜获得 / 十连、金币不足、离开确认、生命、设置 / 暂停、新收藏卡翻面、看广告。
// 版式照定版图 16、18、19、08 右（docs/09 第 3、4 节）。
import { Color, Label, Node, Sprite, Vec3, tween } from 'cc';
import type { CardResult, Prize } from '../core/meta/save';
import * as Cards from '../core/meta/cards';
import * as Lives from '../core/meta/lives';
import * as Meta from '../core/meta/meta';
import * as Share from '../core/meta/share';
import { Rng } from '../core/rng/rng';
import { App } from '../services/app';
import { buzz, applySettings, sfx } from '../services/audio';
import { mono, now, today } from '../services/clock';
import * as fx from './fx';
import { language, setLanguage, tr } from './i18n';
import { COLOR, DARK_INK, at, box, button, fmt, hex, img, onTap, opacity, setImg, setInk, slice, text, twoLines } from './kit';

/** 语言选择里没选中那一段的字色 */
const SEG_DIM = hex('#A9C8F0');
import { openPopup, Popup } from './popup';
import { Screen } from './screen';
import { ui } from './shell';

// ---------------------------------------------------------------- 看广告

/** 看激励视频。看完返回 true；没看完、不可用返回 false（不可用时提示，docs/01 7.1） */
export async function watchAd(placement: string): Promise<boolean> {
  if (!App.platform.adsAvailable()) {
    ui.toast(tr('UI_AD_UNAVAILABLE'));
    return false;
  }
  ui.busy(true);
  const r = await App.platform.showRewarded(placement);
  ui.busy(false);
  if (r === 'done') {
    Meta.markRewarded(App.save.data, mono());
    App.platform.track('ad_rewarded', { placement });
    return true;
  }
  if (r === 'unavailable') ui.toast(tr('UI_AD_UNAVAILABLE'));
  return false;
}

// ---------------------------------------------------------------- 奖品

export interface PrizeItem {
  icon: string;
  amount: string;
  /** 单个开奖时写在数量前面（金币 ×100） */
  name?: string;
  /** 收藏卡：稀有度框 */
  rarity?: string;
}

/** 生物名走多语言（species.json 里的 name 只是中文备注） */
export function speciesName(id: string): string {
  return tr(`SPECIES_${id.toUpperCase()}`);
}

export function skillName(id: string): string {
  return tr(`H_SKILL_${id === 'current' ? 'FLOW' : id.toUpperCase()}`);
}

export function skillIcon(id: string): string {
  return `icon/skill_${id}`;
}

export function prizeItems(prizes: Prize[]): PrizeItem[] {
  const out: PrizeItem[] = [];
  for (const p of prizes) {
    if (p.kind === 'coin') out.push({ icon: 'icon/coin', amount: String(p.amount), name: tr('PRIZE_COINS') });
    else if (p.kind === 'skill') out.push({ icon: skillIcon(p.skill ?? 'shuffle'), amount: `×${p.amount ?? 1}`, name: skillName(p.skill ?? 'shuffle') });
    else if (p.kind === 'inf_life') out.push({ icon: 'icon/heart_inf', amount: tr('UI_MINUTES', p.amount ?? 0) });
    else if (p.kind === 'frame') out.push({ icon: 'kit/fx_ring', amount: tr('H_PRIZE_FRAME') });
    else if (p.kind === 'card' && p.card_id) out.push({ icon: `fish/${p.card_id}`, amount: tr(`UI_RARITY_${(p.rarity ?? 'common').toUpperCase()}`), rarity: p.rarity });
  }
  return out;
}

export function cardItem(c: CardResult): PrizeItem {
  return { icon: `fish/${c.id}`, amount: tr(`UI_RARITY_${c.rarity.toUpperCase()}`), rarity: c.rarity };
}

/** 一个奖品格：图标（收藏卡带稀有度框）+ 数量 */
export function prizeCell(parent: Node, it: PrizeItem, s = 110): Node {
  const n = box('prize', parent, s, s + 40);
  if (it.rarity) {
    const f = img(n, `skin/j_card_${it.rarity}`, s * 0.82, s * 1.1, 'frame');
    at(f, 0, 14);
    const icon = img(n, it.icon, s * 0.64, s * 0.64, 'icon');
    at(icon, 0, 26);
  } else {
    const icon = img(n, it.icon, s * 0.86, s * 0.86, 'icon');
    at(icon, 0, 16);
  }
  const l = text(n, it.amount, Math.max(28, Math.round(s * 0.28)));
  at(l.node, 0, -s / 2 - 8);
  return n;
}

/** 恭喜获得（一个奖品大图）或一组奖品（十连、宝箱）。extra：签到等场景多一个看广告翻倍按钮 */
export function rewardPopup(
  items: PrizeItem[],
  o: { title?: string; onClose?: () => void; double?: { label: string; onTap: () => void } } = {},
): Popup {
  const many = items.length > 1;
  const cols = items.length <= 4 ? items.length : 5;
  const rows = Math.ceil(items.length / cols);
  // 标题放在弹窗统一的标题栏里；内容区自上而下：奖品 → 名称数量 → 按钮
  const dbl = o.double ? 115 : 0;
  const h = many ? 64 + rows * 196 + 32 + 110 + 32 + dbl : 480 + dbl;
  const p = openPopup({ w: 640, h, title: o.title ?? tr('H_CONGRATS'), noClose: true, onClose: o.onClose });
  if (!many && items[0]) {
    const iy = h / 2 - 32 - 110;
    const glow = fx.rays(p.body, 360);
    at(glow, 0, iy);
    const it = items[0];
    const icon = it.rarity ? prizeCell(p.body, it, 220) : img(p.body, it.icon, 220, 220, 'icon');
    at(icon, 0, iy);
    fx.popIn(icon, 0.15, 0.35);
    fx.sparkle(p.body, 0, iy, 10, 160, COLOR.yellow);
    if (!it.rarity) {
      const l = text(p.body, it.name ? `${it.name} ${it.amount.startsWith('×') ? it.amount : `×${it.amount}`}` : it.amount, 44);
      at(l.node, 0, iy - 146);
    }
  } else {
    const cw = cols >= 5 ? 116 : 150;
    items.forEach((it, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const inRow = Math.min(cols, items.length - r * cols);
      const cell = prizeCell(p.body, it, cols >= 5 ? 104 : 128);
      at(cell, (c - (inRow - 1) / 2) * cw, h / 2 - 32 - 88 - r * 196);
      fx.popIn(cell, 0.1 + i * 0.07, 0.25);
    });
  }
  let y = -h / 2 + 32 + 55;
  const take = button(p.body, { color: 'green', w: 420, h: 110, label: tr('UI_CLAIM'), fontSize: 48, onTap: () => p.close() });
  at(take.node, 0, y);
  if (o.double) {
    y += 115;
    const d = o.double;
    const db = button(p.body, { color: 'yellow', w: 400, h: 96, label: d.label, icon: 'kit/ic_video', onTap: () => (p.close(), d.onTap()) });
    at(db.node, 0, y);
  }
  sfx('chest');
  return p;
}

// ---------------------------------------------------------------- 金币不足

/** 还差多少金币；主按钮「看广告领 N 金币」，次数用完或广告不可用时只给一行提示（docs/01 7.1） */
export function needCoins(short: number, after?: () => void): void {
  const eco = App.config.eco;
  const p = openPopup({ w: 600, h: 520, title: tr('H_NEED_COINS'), mascot: null });
  const coins = img(p.body, 'icon/coin', 180, 180, 'coins');
  at(coins, 0, 90);
  fx.rays(p.body, 300).setSiblingIndex(0);
  const l = text(p.body, tr('H_NEED_COINS_LINE', short), 40);
  at(l.node, 0, -40);
  const left = Meta.freeCoinLeft(App.save.data, eco, today());
  if (left > 0 && App.platform.adsAvailable()) {
    const b = button(p.body, {
      color: 'yellow',
      w: 480,
      h: 100,
      icon: 'kit/ic_video',
      label: tr('H_WATCH_COINS', eco.freeCoin.amount),
      fontSize: 36,
      onTap: async () => {
        if (!(await watchAd('rv_free_coin'))) return;
        Meta.takeFreeCoin(App.save.data, eco, today());
        App.save.write();
        p.close();
        sfx('coins');
        ui.refresh();
        after?.();
      },
    });
    at(b.node, 0, -160);
  } else {
    const t = text(p.body, tr('UI_NO_COINS'), 32);
    at(t.node, 0, -160);
  }
}

/** 花金币：够就扣并返回 true；不够弹「金币不足」 */
export function spend(cost: number): boolean {
  const s = App.save.data;
  if (s.coins >= cost) return true;
  needCoins(cost - s.coins);
  return false;
}

// ---------------------------------------------------------------- 离开确认

export function confirmLeave(onLeave: () => void): void {
  const p = openPopup({ w: 600, h: 528, title: tr('H_LEAVE_TITLE') });
  const heart = img(p.body, 'icon/heart', 140, 140, 'heart');
  at(heart, -50, 120);
  const minus = text(p.body, '-1', 80, { color: hex('#E8473A') });
  at(minus.node, 80, 120);
  const line = text(p.body, tr('H_LEAVE_LINE'), 32);
  at(line.node, 0, 10);
  const keep = button(p.body, { color: 'green', w: 440, h: 100, label: tr('H_KEEP_PLAYING'), fontSize: 40, onTap: () => p.close() });
  at(keep.node, 0, -84);
  const leave = button(p.body, { color: 'blue', w: 440, h: 88, label: tr('H_LEAVE'), fontSize: 34, onTap: () => (p.close(), onLeave()) });
  at(leave.node, 0, -190);
}

// ---------------------------------------------------------------- 生命

const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

/** 生命弹窗（定版图 16 右）：五颗心、恢复倒计时、看广告得 1 条（主按钮）、分享、金币买 */
export function livesPopup(onChange?: () => void): void {
  const eco = App.config.eco;
  const s = App.save.data;
  const p = openPopup({ w: 640, h: 760, title: tr('H_LIVES_TITLE'), mascot: 'c01' });
  const hearts: Node[] = [];
  for (let i = 0; i < eco.lives.max; i++) {
    const h = img(p.body, 'icon/heart', 96, 96, 'heart');
    at(h, (i - (eco.lives.max - 1) / 2) * 104, 240);
    hearts.push(h);
  }
  const lbl = text(p.body, '', 34);
  at(lbl.node, 0, 150);
  const timerPill = slice(p.body, 'kit/capsule', 300, 76, 'timer');
  at(timerPill, 0, 80);
  const tIcon = img(timerPill, 'kit/ic_timer', 50, 50, 'icon');
  at(tIcon, -100, 0);
  const tLabel = text(timerPill, '', 40);
  at(tLabel.node, 20, 0);
  const refresh = () => {
    const t = now();
    const n = Lives.count(s, eco, t);
    hearts.forEach((h, i) => ((h.getComponent(Sprite) as Sprite).grayscale = i >= n));
    const inf = Lives.isUnlimited(s, t);
    timerPill.active = inf || n < eco.lives.max;
    lbl.string = inf ? tr('H_INF_LEFT', '') : n >= eco.lives.max ? tr('H_LIVES_FULL') : tr('H_NEXT_LIFE', '');
    tLabel.string = inf ? mmss(Lives.unlimitedLeft(s, t)) : mmss(Lives.secondsToNext(s, eco, t));
  };
  refresh();
  tween(p.body)
    .repeatForever(tween(p.body).delay(1).call(refresh))
    .start();
  const changed = () => {
    App.save.write();
    sfx('coin');
    refresh();
    ui.refresh();
    onChange?.();
  };
  const day = today();
  const adLeft = Lives.adLeft(s, eco, day);
  let y = -20;
  if (adLeft > 0 && App.platform.adsAvailable()) {
    const ad = button(p.body, {
      color: 'yellow',
      w: 520,
      h: 100,
      icon: 'kit/ic_video',
      label: `${tr('H_WATCH_AD')} +1 · ${tr('ADS_LEFT', adLeft)}`,
      fontSize: 32,
      onTap: async () => {
        if (Lives.count(s, eco, now()) >= eco.lives.max) return ui.toast(tr('H_LIVES_FULL'));
        if (!(await watchAd('rv_life'))) return;
        Lives.claimAd(s, eco, today(), now());
        changed();
      },
    });
    at(ad.node, 0, y);
    y -= 110;
  }
  const shareLeft = Share.remaining(s, eco, 'life', day);
  const share = button(p.body, {
    color: 'blue',
    w: 520,
    h: 90,
    icon: 'kit/ic_share',
    label: `${tr('H_SHARE_LIFE')} (${shareLeft})`,
    fontSize: 32,
    onTap: async () => {
      if (Share.remaining(s, eco, 'life', today()) <= 0 || Lives.count(s, eco, now()) >= eco.lives.max) return;
      if (!(await App.platform.share({ kind: 'life' }))) return;
      Share.claim(s, eco, 'life', today(), now(), new Rng(Date.now() >>> 0));
      changed();
    },
  });
  share.setEnabled(shareLeft > 0);
  at(share.node, 0, y);
  y -= 115;
  const one = button(p.body, {
    color: 'blue',
    w: 250,
    h: 96,
    onTap: () => {
      if (Lives.count(s, eco, now()) >= eco.lives.max) return ui.toast(tr('H_LIVES_FULL'));
      if (!spend(eco.lives.buyOneCoins)) return;
      Lives.buyOne(s, eco, now());
      changed();
    },
  });
  at(one.node, -135, y);
  const fill = button(p.body, {
    color: 'green',
    w: 250,
    h: 96,
    onTap: () => {
      if (Lives.count(s, eco, now()) >= eco.lives.max) return ui.toast(tr('H_LIVES_FULL'));
      if (!spend(eco.lives.refillCoins)) return;
      Lives.buyRefill(s, eco, now());
      changed();
    },
  });
  at(fill.node, 135, y);
  // 说明字放进按钮里：上「买 1 条 / 补满」，下金币价
  twoLines(one, tr('H_BUY_ONE'), fmt(eco.lives.buyOneCoins), 'icon/coin');
  twoLines(fill, tr('H_REFILL'), fmt(eco.lives.refillCoins), 'icon/coin');
}

// ---------------------------------------------------------------- 设置 / 暂停

/** 主页打开 = 设置：三个开关 + 语言；局内打开 = 暂停：三个开关 +「回主页」「重试」（docs/09 第 4 节） */
export function settingsPopup(mode: 'home' | 'pause', o: { onHome?: () => void; onRetry?: () => void; onClose?: () => void } = {}): void {
  const s = App.save.data;
  const h = mode === 'pause' ? 528 : 512 + (App.platform.hasCapability('ad_test') ? 112 : 0);
  const p = openPopup({ w: 620, h, title: tr(mode === 'pause' ? 'PAUSE_TITLE' : 'UI_SETTINGS'), onClose: o.onClose });
  const rows: [string, string, keyof typeof s.settings][] = [
    ['kit/ic_music', 'H_MUSIC', 'music'],
    ['kit/ic_sound', 'H_SOUND', 'sound'],
    ['kit/ic_vibrate', 'H_VIBRATION', 'vibrate'],
  ];
  let y = h / 2 - 32 - 48;
  for (const [icon, key, field] of rows) {
    const row = slice(p.body, 'kit/row', 556, 96, 'row');
    at(row, 0, y);
    const ic = img(row, icon, 48, 48, 'icon');
    at(ic, -556 / 2 + 24 + 24, 0);
    const l = text(row, tr(key), 32, { align: 'left' });
    at(l.node, -556 / 2 + 96, 0);
    const tg = img(row, s.settings[field] ? 'skin/j_toggle_on' : 'skin/j_toggle_off', 116, 55, 'toggle');
    at(tg, 196, 0);
    onTap(row, () => {
      (s.settings as unknown as Record<string, boolean>)[field] = !s.settings[field];
      setImg(tg, s.settings[field] ? 'skin/j_toggle_on' : 'skin/j_toggle_off', 116, 55);
      App.save.write();
      applySettings();
    });
    y -= 96 + 16;
  }
  if (mode === 'home') {
    const row = slice(p.body, 'kit/row', 556, 96, 'lang');
    at(row, 0, y);
    const ic = img(row, 'kit/ic_globe', 48, 48, 'icon');
    at(ic, -556 / 2 + 48, 0);
    const l = text(row, tr('H_LANGUAGE'), 32, { align: 'left' });
    at(l.node, -556 / 2 + 96, 0);
    const seg = slice(row, 'kit/seg_bg', 256, 64, 'seg');
    at(seg, 556 / 2 - 16 - 128, 0);
    const on = slice(seg, 'kit/seg_on', 128, 64, 'on');
    const zh = text(seg, '中文', 28);
    at(zh.node, -64, 2);
    const en = text(seg, 'English', 26);
    at(en.node, 64, 2);
    const place = () => {
      const zhOn = language() === 'zh_CN';
      at(on, zhOn ? -64 : 64, 0);
      // 深色凹槽里，选中的一段是蓝色果冻；没选中的字淡一点
      zh.color = zhOn ? COLOR.white : SEG_DIM;
      en.color = zhOn ? SEG_DIM : COLOR.white;
    };
    place();
    onTap(seg, () => {
      setLanguage(language() === 'zh_CN' ? 'en' : 'zh_CN');
      s.settings.lang = language();
      App.save.write();
      place();
    });
    y -= 96 + 16;
    if (App.platform.hasCapability('ad_test')) {
      const b = button(p.body, { color: 'blue', w: 556, h: 88, label: tr('UI_AD_TEST'), fontSize: 32, onTap: () => (p.close(), ui.go('adtest')) });
      at(b.node, 0, y - 8);
    }
  } else {
    const home = button(p.body, { color: 'blue', w: 270, h: 112, label: tr('H_TO_HOME'), fontSize: 40, onTap: () => (p.close(), o.onHome?.()) });
    at(home.node, -143, y - 24);
    const retry = button(p.body, { color: 'green', w: 270, h: 112, label: tr('H_RETRY'), fontSize: 40, onTap: () => (p.close(), o.onRetry?.()) });
    at(retry.node, 143, y - 24);
  }
}

// ---------------------------------------------------------------- 新收藏卡

export const RARITY_GLOW: Record<string, Color> = {
  common: new Color(220, 230, 245),
  uncommon: new Color(140, 240, 110),
  rare: new Color(110, 190, 255),
  epic: new Color(210, 140, 255),
  legend: new Color(255, 214, 64),
};

/**
 * 新收藏卡亮相（定版图 08 右）：卡背朝上弹出 → 翻面 → 正面 + 稀有度光圈；史诗、传说加金光、火花、彩纸和全屏闪；
 * 卡翻完才能点击继续。重复卡写「已拥有，换 N 金币」。多张依次翻
 */
export function revealCards(cards: CardResult[], done?: () => void): void {
  if (cards.length === 0) {
    done?.();
    return;
  }
  const [c, ...rest] = cards;
  const p = openPopup({ w: Screen.W, h: Screen.H, noClose: true, mascot: null, onClose: () => revealCards(rest, done) });
  const panel = p.body.getChildByName('frame');
  if (panel) panel.active = false;
  // 没有卡片底板：字直接压在压暗的背景上，用白字深描边
  setInk(p.body, DARK_INK);
  // 亮卡是全屏时刻：背景压得更暗，下面的按钮、文字不抢眼
  const dim = p.root.getChildByName('dim')?.getComponent(Sprite);
  if (dim) dim.color = new Color(0, 14, 44, 225);
  const epic = Cards.rank(App.config.eco, c.rarity) >= 3;
  const glow = fx.rays(p.body, 620);
  (glow.getComponent(Sprite) as Sprite).color = RARITY_GLOW[c.rarity] ?? COLOR.white;
  opacity(glow).opacity = 0;
  const card = box('card', p.body, 380, 508);
  at(card, 0, 60);
  const back = img(card, 'icon/card_back', 370, 508, 'back');
  const front = box('front', card, 380, 508);
  img(front, `skin/j_card_${c.rarity}`, 380, 508, 'frame');
  const art = img(front, `fish/${c.id}`, 280, 280, 'art');
  at(art, 0, 40);
  fx.bob(art, 6, 2.2);
  const sp = App.config.speciesById.get(c.id);
  // 名字在卡框下沿的彩色名牌上（白字深描边）
  const name = text(front, sp ? speciesName(sp.id) : c.id, 42);
  at(name.node, 0, -181);
  // 稀有度写在卡片下面（卡框下沿有宝石装饰，不压在上面），翻完才出来
  const rar = text(p.body, tr(`UI_RARITY_${c.rarity.toUpperCase()}`), 36, { color: RARITY_GLOW[c.rarity] });
  at(rar.node, 0, 60 - 254 - 36);
  rar.node.active = false;
  front.active = false;
  const line = text(p.body, c.is_new ? tr('CARD_RARITY_NEW') : tr('UI_CARD_OWNED', c.coins), 40);
  at(line.node, 0, 60 - 252 - 100);
  line.node.active = false;
  const cont = text(p.body, tr('TAP_CONTINUE'), 30);
  at(cont.node, 0, 60 - 252 - 190);
  cont.node.active = false;
  let ready = false;
  fx.popIn(card, 0.05, 0.35);
  sfx('card');
  tween(card)
    .delay(0.6)
    .to(0.18, { scale: new Vec3(0.02, 1.05, 1) }, { easing: 'quadIn' })
    .call(() => {
      back.active = false;
      front.active = true;
      tween(opacity(glow)).to(0.25, { opacity: 255 }).start();
      if (epic) {
        fx.flash(p.root, Screen.W, Screen.H, 200, RARITY_GLOW[c.rarity]);
        fx.confetti(p.root, 0, 200, 60, 420);
        buzz('medium');
      }
      fx.sparkle(p.body, 0, 60, epic ? 20 : 10, 280, RARITY_GLOW[c.rarity], epic ? 48 : 34);
      sfx(epic ? 'firework' : 'star');
    })
    .to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
    .call(() => {
      line.node.active = true;
      rar.node.active = true;
      cont.node.active = true;
      fx.breathe(cont.node, 0.06, 1.2);
      ready = true;
    })
    .start();
  onTap(p.root, () => ready && p.close(), { press: 0, sound: null });
}

/** 金币从 from 飞向 to（默认顶栏金币，ui.fx 坐标） */
export function coinsFly(from: [number, number], label?: Label, to: [number, number] = [-60, Screen.top - 64]): void {
  for (let i = 0; i < 8; i++) {
    const c = img(ui.fx, 'icon/coin', 48, 48, 'coin');
    at(c, from[0] + (Math.random() - 0.5) * 60, from[1] + (Math.random() - 0.5) * 60);
    fx.flyArc(c, to[0], to[1], 0.5 + i * 0.04, 80, 'quadIn', () => {
      c.destroy();
      if (i === 0) sfx('coin');
    });
  }
  if (label) fx.popIn(label.node, 0.6, 0.2);
}
