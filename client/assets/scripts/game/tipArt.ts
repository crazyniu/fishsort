// 「新玩法」弹窗上面的小场景：用局内同一套图（气泡、鱼、锁链、迷雾、冰晶、鱼缸、目标卡）摆出这个机制长什么样，
// 让人一眼对上局里看到的东西（用户 2026-11-17：弹窗中间空一大块、只有一行字）。只是示意，不接逻辑。
import { Color, Node, Sprite, Vec3, tween } from 'cc';
import * as fx from '../ui/fx';
import { COLOR, at, box, fit, hex, img, opacity, plate, slice, text } from '../ui/kit';

const PINK = new Color(255, 120, 190, 230);
/** 木架多厚（和局里一样） */
const SHELF_H = 32;

/** 一个气泡，里面放几条鱼（和局里一样，鱼挤在泡里） */
function bubble(parent: Node, x: number, y: number, d: number, fish: string[], name = 'bubble'): Node {
  const n = box(name, parent, d, d);
  at(n, x, y);
  const fs = fish.length > 1 ? d * 0.5 : d * 0.66;
  const offs = fish.length > 1 ? [[-d * 0.17, d * 0.08], [d * 0.17, -d * 0.1], [0, d * 0.22]] : [[0, 0]];
  fish.forEach((id, k) => at(img(n, `fish/${id}`, fs, fs, `fish${k}`), offs[k][0], offs[k][1]));
  img(n, 'kit/bubble', d, d, 'film');
  return n;
}

/** 一段木架，上面坐着几个鱼缸，每个缸下面钉一张目标卡（和局里同一个样子：大鱼 +「0/3」）；可以在缸角挂倒计时 */
function shelfScene(parent: Node, bowls: { s: number; fish: string; cap: number; timer?: string }[]): void {
  const gap = 24;
  const total = bowls.reduce((a, b) => a + b.s, 0) + gap * (bowls.length - 1);
  const shelfTop = 4;
  const shelf = slice(parent, 'kit/shelf', total + 60, SHELF_H, 'shelf');
  at(shelf, 0, shelfTop - SHELF_H / 2);
  let x = -total / 2;
  for (const b of bowls) {
    const cx = x + b.s / 2;
    x += b.s + gap;
    const h = b.s * 0.925;
    const bowl = img(parent, 'skin/j_bowl', b.s, h, 'bowl');
    at(bowl, cx, shelfTop - 5 + h / 2);
    if (b.timer) badge(bowl, b.s / 2 - 14, h / 2 - 20, 56, b.timer);
    const gw = 112;
    const gh = (gw * 122) / 140;
    const tag = img(parent, 'skin/j_goal', gw, gh, 'tag');
    at(tag, cx, shelfTop - SHELF_H + 14 - gh / 2);
    at(img(tag, `fish/${b.fish}`, gh * 0.68, gh * 0.68, 'fish'), -gw * 0.13, -gh * 0.02);
    const l = text(tag, `0/${b.cap}`, 30, { outline: COLOR.navy, outlineWidth: 4 });
    at(l.node, gw * 0.17, -gh * 0.2);
    fit(l, gw * 0.5, 30, 20);
  }
}

/** 红色圆角标，写一个数（锁链剩几缸、限时缸剩几秒） */
function badge(parent: Node, x: number, y: number, s: number, v: string): void {
  const b = img(parent, 'kit/round_red', s, s, 'badge');
  at(b, x, y);
  text(b, v, Math.round(s * 0.52));
}

/** 按机制说明的文案 key 摆一个小场景，放在 parent 原点；大约 400 × 230 */
export function tipArt(parent: Node, key: string): Node {
  const n = box('art', parent, 400, 230);
  switch (key) {
    case 'TIP_LAYER': {
      // 后面一个被压住（发暗），前面一个压在上面
      const back = bubble(n, -60, 40, 170, ['c02', 'c03'], 'back');
      for (const c of back.children) {
        const sp = c.getComponent(Sprite);
        if (sp) sp.color = hex('#8C9AB8');
      }
      const front = bubble(n, 60, -30, 180, ['c01', 'c05'], 'front');
      fx.breathe(front, 0.05, 1.2);
      break;
    }
    case 'TIP_CHAIN': {
      const b = bubble(n, 0, 0, 210, ['c01', 'c02']);
      img(b, 'skin/j_chain', 210, 178, 'chain');
      badge(b, 210 * 0.31, -210 * 0.31, 64, '3');
      break;
    }
    case 'TIP_DROP': {
      // 一个气泡从上面掉下来、落下去，后面拖两个淡的残影
      bubble(n, 0, -40, 160, ['c01', 'c03']);
      const fall = bubble(n, 0, 100, 120, ['c02'], 'fall');
      const from = new Vec3(0, 150, 0);
      const to = new Vec3(0, 40, 0);
      fall.setPosition(from);
      const op = opacity(fall);
      tween(fall)
        .repeatForever(
          tween(fall)
            .call(() => (op.opacity = 0))
            .set({ position: from })
            .call(() => (op.opacity = 255))
            .to(0.55, { position: to }, { easing: 'quadIn' })
            .delay(0.9),
        )
        .start();
      break;
    }
    case 'TIP_TIMER': {
      shelfScene(n, [{ s: 124, fish: 'c01', cap: 3, timer: '20' }]);
      break;
    }
    case 'TIP_BIG': {
      // 普通缸和大缸并排，一眼看出大缸要 6 条
      shelfScene(n, [
        { s: 112, fish: 'c02', cap: 3 },
        { s: 136, fish: 'c05', cap: 6 },
      ]);
      break;
    }
    case 'TIP_FOG': {
      const d = 210;
      const b = bubble(n, 0, 0, d, []);
      const fog = img(b, 'skin/j_fog', d * 1.06, d * 1.06, 'fog');
      fog.setSiblingIndex(0);
      for (const [x, y] of [[-d * 0.17, d * 0.08], [d * 0.17, -d * 0.1], [0, d * 0.22]]) at(img(b, 'skin/j_mystery', d * 0.42, d * 0.42, 'mark'), x, y);
      // 下沿一排小泡：还要别处破几个才显形
      for (let i = 0; i < 3; i++) {
        const pip = img(b, 'kit/circle_white', 30, 30, `pip${i}`);
        (pip.getComponent(Sprite) as Sprite).color = hex('#BFE6FF');
        img(pip, 'skin/j_bubble', 32, 32, 'shine');
        at(pip, (i - 1) * 36, -d * 0.43);
      }
      break;
    }
    case 'TIP_ICE': {
      // 左边冻住的气泡（下沿蓝色计数牌「还要点破 1 个」），右边带同色雪花牌的气泡；点破它，左边就解冻（和局里一样）
      const blue = new Color(64, 156, 255, 255);
      const a = bubble(n, -105, 0, 160, ['c02', 'c03'], 'frozen');
      const ice = img(a, 'icon/ice', 136, 136, 'ice');
      opacity(ice).opacity = 170;
      const tag = img(a, 'kit/circle_white', 52, 52, 'tag');
      (tag.getComponent(Sprite) as Sprite).color = blue;
      at(tag, 0, -68);
      at(img(tag, 'skin/j_frost', 28, 30, 'flake'), -22, 20);
      text(tag, '1', 30, { outline: COLOR.navy, outlineWidth: 4 });
      const key = bubble(n, 105, 0, 160, ['c01'], 'key');
      const badge = img(key, 'kit/circle_white', 46, 46, 'badge');
      (badge.getComponent(Sprite) as Sprite).color = blue;
      at(badge, 52, 50);
      img(badge, 'skin/j_frost', 33, 35, 'flake');
      break;
    }
    case 'TIP_PAIR': {
      const d = 210;
      const b = bubble(n, 0, 0, d, ['c01', 'c01']);
      // 两条结伴的鱼之间一道粉色的线（和局里一样）
      const len = Math.hypot(d * 0.34, d * 0.18);
      const link = img(b, 'kit/round_white', len, 10, 'link');
      (link.getComponent(Sprite) as Sprite).color = PINK;
      link.angle = (Math.atan2(-d * 0.18, d * 0.34) * 180) / Math.PI;
      at(link, 0, -d * 0.01);
      // 和局里一样画在鱼上面、泡膜下面
      link.setSiblingIndex(b.children.length - 2);
      break;
    }
    case 'TIP_QUEUE': {
      // 排队泡：三条鱼叠成一串，排头最亮，后面两条压暗（和局里一样）
      const d = 220;
      const b = box('queue', n, d, d);
      const ids = ['c03', 'c02', 'c01'];
      ids.forEach((id, k) => {
        const f = img(b, `fish/${id}`, d * 0.42, d * 0.42, `fish${k}`);
        at(f, (k - 1) * d * 0.19, -(k - 1) * d * 0.15);
        if (k < 2) (f.getComponent(Sprite) as Sprite).color = new Color(150, 165, 195, 255);
        else fx.breathe(f, 0.08, 0.7);
      });
      img(b, 'kit/bubble', d, d, 'skin');
      break;
    }
    case 'TIP_TOOLS3': {
      // 每种道具每关能用 3 次：两个道具图标，角上挂「×3」
      ['skill_shuffle', 'skill_net'].forEach((id, i) => {
        const ic = img(n, `icon/${id}`, 150, 150, id);
        at(ic, (i - 0.5) * 190, 0);
        badge(ic, 62, 56, 68, '×3');
        fx.breathe(ic, 0.04, 0.9 + i * 0.2);
      });
      break;
    }
    case 'TIP_BUFFER4': {
      // 暂存槽只有 4 格：和局里一样的一排槽，前三格有鱼，最后一格闪
      const w = 84;
      // 槽是半透明白的，弹窗也是白底：垫一块和局内顶栏一样的深色底
      at(plate(n, 'skin/f_hud', 4 * (w + 10) + 34, w + 40, 'back'), 0, 10);
      for (let i = 0; i < 4; i++) {
        const sl = slice(n, 'kit/slot', w, w, `slot${i}`);
        at(sl, (i - 1.5) * (w + 10), 10);
        if (i < 3) at(img(sl, `fish/${['c01', 'c02', 'c03'][i]}`, w * 0.8, w * 0.8, 'fish'), 0, 0);
        else fx.breathe(sl, 0.08, 0.6);
      }
      break;
    }
    case 'TIP_CLOCK': {
      // 限时关：一块和局内顶栏一样的倒计时条，旁边一只气泡
      const pill = plate(n, 'skin/f_hud', 200, 96, 'clock');
      at(pill, -40, 20);
      const t = text(pill, '1:30', 52);
      at(t.node, 0, 0);
      fx.breathe(pill, 0.05, 0.8);
      bubble(n, 140, -40, 130, ['c01']);
      break;
    }
    case 'TIP_LIVES': {
      at(img(n, 'icon/heart', 150, 150, 'heart'), -50, 0);
      const m = text(n, '-1', 84, { color: hex('#E8473A') });
      at(m.node, 85, 0);
      break;
    }
    default: {
      bubble(n, 0, 0, 200, ['c01', 'c05']);
    }
  }
  return n;
}
