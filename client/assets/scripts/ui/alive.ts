// 生物的常驻小动作（用户 2026-11-17：给动物加基础动画，比如眨眼、动爪子）。
// 生物图是一整张图，没有拆开的爪子、眼皮，所以：
// - 眨眼：眼睛的位置是 tools/art/eyes.py 从图上找出来的（config/fish_eyes.json），在眼睛上盖一块和眼睛上方皮肤同色的眼皮，
//   隔几秒合上再睁开（眼皮下沿一道深色睫毛线）。找不到眼睛的生物不眨。
// - 动作：按轮廓类给整只做（species.json 的 shape）：螃蟹龙虾「夹两下」、虾弹尾巴、水母一缩一伸、章鱼乌贼慢慢摆、
//   海星扭一扭、贝壳和螺一开一合（压扁再回来）、海葵管虫左右摇、其余的鱼摆尾。
// 只在界面层；时间和幅度很小，不影响点击判定。
import { Color, Node, Sprite, UITransform, Vec3, tween } from 'cc';
import { App } from '../services/app';
import { hex, img } from './kit';

/** 生物图的原始边长（eyes.json 里的坐标按它算） */
const SRC = 192;
const LASH = new Color(30, 42, 74, 255);

export interface Eye {
  x: number;
  y: number;
  w: number;
  h: number;
  lid: string;
}

/** 给一只生物加眨眼。node 是生物图本身（边长 size），眼皮是它的子节点，跟着它翻转、缩放、变透明 */
export function blink(node: Node, id: string, size: number): void {
  const eyes = App.config.eyes?.[id];
  if (!eyes || eyes.length === 0) return;
  const k = size / SRC;
  const lids: Node[] = [];
  for (const e of eyes) {
    const w = e.w * k * 1.18;
    const h = e.h * k * 1.12;
    const lid = img(node, 'kit/round_white', w, h, 'lid');
    (lid.getComponent(Sprite) as Sprite).color = hex(e.lid);
    (lid.getComponent(UITransform) as UITransform).setAnchorPoint(0.5, 1);
    lid.setPosition(e.x * k, (e.y + e.h / 2) * k + h * 0.06, 0);
    const lash = img(lid, 'kit/white', w * 0.9, Math.max(1.5, 2.2 * k * 2), 'lash');
    (lash.getComponent(Sprite) as Sprite).color = LASH;
    (lash.getComponent(UITransform) as UITransform).setAnchorPoint(0.5, 0);
    lash.setPosition(0, -h, 0);
    lid.setScale(1, 0, 1);
    lids.push(lid);
  }
  const loop = () => {
    if (!node.isValid) return;
    const wait = 2.2 + Math.random() * 4;
    // 偶尔连眨两下
    const twice = Math.random() < 0.2;
    for (const lid of lids) {
      let t = tween(lid).delay(wait).to(0.07, { scale: new Vec3(1, 1, 1) }).delay(0.05).to(0.09, { scale: new Vec3(1, 0, 1) });
      if (twice) t = t.delay(0.08).to(0.06, { scale: new Vec3(1, 1, 1) }).to(0.08, { scale: new Vec3(1, 0, 1) });
      t.start();
    }
    tween(node).delay(wait + 0.4).call(loop).start();
  };
  loop();
}

/** 按轮廓类给整只生物加常驻动作；phase 用来错开同一个气泡里的几条。返回 true = 做了（调用方就不再加默认的摆尾） */
export function idle(node: Node, shape: string, phase: number): boolean {
  const sx = node.scale.x;
  const v = (x: number, y: number) => new Vec3(sx * x, y, 1);
  const start = phase * 0.37 + Math.random() * 0.6;
  switch (shape) {
    case 'claws': {
      // 夹两下：身子一挺、左右各歪一下（整只画在一张图里，爪子跟着动）
      tween(node)
        .delay(start)
        .repeatForever(
          tween(node)
            .delay(1.8 + Math.random() * 1.6)
            .to(0.08, { scale: v(1.08, 0.95), angle: 6 })
            .to(0.08, { scale: v(0.98, 1.02), angle: -4 })
            .to(0.08, { scale: v(1.08, 0.95), angle: 6 })
            .to(0.12, { scale: v(1, 1), angle: 0 }),
        )
        .start();
      return true;
    }
    case 'shrimp': {
      tween(node)
        .delay(start)
        .repeatForever(
          tween(node)
            .delay(2 + Math.random() * 1.5)
            .to(0.07, { scale: v(0.9, 1.05), angle: -9 })
            .to(0.16, { scale: v(1, 1), angle: 0 }, { easing: 'backOut' }),
        )
        .start();
      return true;
    }
    case 'umbrella': {
      // 水母：一缩一伸地游
      tween(node)
        .delay(start)
        .repeatForever(
          tween(node)
            .to(0.35, { scale: v(1.07, 0.9) }, { easing: 'sineOut' })
            .to(0.6, { scale: v(0.97, 1.05) }, { easing: 'sineInOut' })
            .to(0.4, { scale: v(1, 1) }, { easing: 'sineIn' }),
        )
        .start();
      return true;
    }
    case 'legs':
    case 'tree': {
      // 章鱼、乌贼、海葵、管虫：慢慢地左右摆
      tween(node)
        .delay(start)
        .repeatForever(
          tween(node)
            .to(1.1, { angle: 6, scale: v(1.03, 0.98) }, { easing: 'sineInOut' })
            .to(1.1, { angle: -6, scale: v(0.98, 1.03) }, { easing: 'sineInOut' }),
        )
        .start();
      return true;
    }
    case 'star': {
      tween(node)
        .delay(start)
        .repeatForever(
          tween(node)
            .delay(2.4 + Math.random() * 1.5)
            .to(0.18, { angle: 12 }, { easing: 'quadOut' })
            .to(0.22, { angle: -8 }, { easing: 'quadInOut' })
            .to(0.2, { angle: 0 }, { easing: 'quadIn' }),
        )
        .start();
      return true;
    }
    case 'shell':
    case 'snail': {
      // 贝壳、螺：一开一合（压扁一下再弹回来）
      tween(node)
        .delay(start)
        .repeatForever(
          tween(node)
            .delay(2.2 + Math.random() * 1.8)
            .to(0.12, { scale: v(1.06, 0.88) }, { easing: 'quadOut' })
            .to(0.2, { scale: v(1, 1) }, { easing: 'backOut' }),
        )
        .start();
      return true;
    }
    case 'bird':
    case 'seal':
    case 'otter':
    case 'whale':
    case 'angel':
    case 'ghost': {
      // 企鹅、海豹、水獭、鲸、海天使、小幽灵：轻轻摇晃着浮
      tween(node)
        .delay(start)
        .repeatForever(
          tween(node)
            .to(0.9, { angle: 5, scale: v(1.03, 1) }, { easing: 'sineInOut' })
            .to(0.9, { angle: -4, scale: v(1, 1.03) }, { easing: 'sineInOut' }),
        )
        .start();
      return true;
    }
  }
  return false;
}

/** 一只生物的轮廓类（species.json 的 shape） */
export function shapeOf(id: string): string {
  return String(App.config.speciesById.get(id)?.shape ?? '');
}
