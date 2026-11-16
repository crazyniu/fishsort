// 个人资料弹窗（定版图 17 右；docs/01 5.9）：头像（领过终极大奖加金框）、昵称、当前关、最高连击、收藏进度。
// 点头像可以换成收藏里已有的生物（或换回平台头像）。
import { Sprite } from 'cc';
import * as Album from '../core/meta/album';
import * as PlayerData from '../core/meta/playerData';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import { tr } from '../ui/i18n';
import { COLOR, INK, at, img, onTap, slice, text } from '../ui/kit';
import { openPopup } from '../ui/popup';
import { speciesName } from '../ui/popups';
import { Scroller } from '../ui/scroll';
import { ui } from '../ui/shell';

/** 头像图：换过生物就是生物图，否则是默认头像 */
export function avatarPath(): string {
  const id = PlayerData.avatarOf(App.save.data);
  return id ? `fish/${id}` : 'icon/avatar';
}

export function profilePopup(): void {
  const s = App.save.data;
  const eco = App.config.eco;
  const h = 640;
  const p = openPopup({ w: 620, h, title: tr('PROFILE_TITLE'), mascot: null, tapOutside: true });
  const frame = slice(p.body, 'kit/tab_sel', 190, 190, 'avatar');
  at(frame, -150, h / 2 - 160);
  img(frame, avatarPath(), 160, 160, 'img');
  // 「点击更换」放在头像下面，蓝色小字，不压在头像上
  const edit = text(p.body, tr('PROFILE_CHANGE_AVATAR'), 24, { color: INK.blue });
  at(edit.node, -150, h / 2 - 160 - 95 - 22);
  onTap(frame, () => {
    p.close();
    avatarPicker();
  });
  if (Album.hasFrame(s)) {
    const ring = img(frame, 'kit/fx_ring', 210, 210, 'frame');
    (ring.getComponent(Sprite) as Sprite).color = COLOR.yellow;
  }
  const name = text(p.body, tr('PROFILE_DEFAULT_NAME'), 46, { align: 'left' });
  at(name.node, -30, h / 2 - 160);
  void App.platform.getProfile().then((pr) => {
    if (pr?.nickname && name.isValid) name.string = pr.nickname;
  });
  const books = Album.books(eco);
  const total = books.reduce((a, b) => a + b.cards.length, 0);
  const got = books.reduce((a, _b, i) => a + Album.have(s, eco, i), 0);
  const rows: [string, string][] = [
    [tr('PROFILE_LEVEL'), tr('UI_LEVEL', s.level)],
    [tr('PROFILE_BEST_COMBO'), String(s.bestCombo)],
    [tr('PROFILE_CARDS'), `${got}/${total}`],
  ];
  rows.forEach(([k, v], i) => {
    const row = slice(p.body, 'kit/row', 540, 92, 'row');
    at(row, 0, h / 2 - 350 - i * 106);
    at(text(row, k, 38, { align: 'left' }).node, -240, 0);
    const pill = slice(row, 'kit/capsule', 200, 66, 'v');
    at(pill, 150, 0);
    text(pill, v, 36);
  });
}

/** 选头像：已拥有的收藏生物网格 + 第一格「默认」 */
function avatarPicker(): void {
  const s = App.save.data;
  const owned = App.config.species.filter((sp) => (s.cards[sp.id] ?? 0) > 0);
  const h = 900;
  const p = openPopup({ w: 660, h, title: tr('PROFILE_PICK_AVATAR'), mascot: null, tapOutside: true, onClose: () => ui.refresh() });
  const sc = new Scroller(p.body, 580, h - 120);
  at(sc.node, 0, -30);
  const ids = ['', ...owned.map((sp) => sp.id)];
  const cur = PlayerData.avatarOf(s);
  const cell = 145;
  ids.forEach((id, i) => {
    const c = slice(sc.content, id === cur ? 'kit/cell_gold' : 'kit/row', 130, 150, `a${i}`);
    at(c, -cell * 1.5 + (i % 4) * cell, -85 - Math.floor(i / 4) * 165);
    img(c, id ? `fish/${id}` : 'icon/avatar', 100, 100, 'img').setPosition(0, 14, 0);
    const l = text(c, id ? speciesName(id) : tr('PROFILE_DEFAULT_AVATAR'), 20, { width: 124 });
    at(l.node, 0, -54);
    onTap(c, () => {
      if (!PlayerData.setAvatar(App.save.data, id)) return;
      App.save.write();
      sfx('tap');
      p.close();
    });
  });
  sc.setContentHeight(Math.ceil(ids.length / 4) * 165 + 20);

}

