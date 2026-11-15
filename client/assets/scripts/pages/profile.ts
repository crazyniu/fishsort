// 个人资料弹窗（定版图 17 右；docs/01 5.9）：头像（领过终极大奖加金框）、昵称、当前关、最高连击、收藏进度。
import { Sprite } from 'cc';
import * as Album from '../core/meta/album';
import { App } from '../services/app';
import { tr } from '../ui/i18n';
import { COLOR, at, img, slice, text } from '../ui/kit';
import { openPopup } from '../ui/popup';

export function profilePopup(): void {
  const s = App.save.data;
  const eco = App.config.eco;
  const h = 640;
  const p = openPopup({ w: 620, h, title: tr('PROFILE_TITLE'), mascot: null, tapOutside: true });
  const frame = slice(p.body, 'kit/tab_sel', 190, 190, 'avatar');
  at(frame, -150, h / 2 - 160);
  img(frame, 'icon/avatar', 160, 160, 'img');
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
    at(row, 0, h / 2 - 320 - i * 106);
    at(text(row, k, 38, { align: 'left' }).node, -240, 0);
    const pill = slice(row, 'kit/capsule', 200, 66, 'v');
    at(pill, 150, 0);
    text(pill, v, 36);
  });
}
