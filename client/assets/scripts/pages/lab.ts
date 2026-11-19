// 难度调试页（设置里的入口，game.json 开了 levelLab 的测试包才有；docs/01 第 9.7 节。调试用，版面朴素、字直接写）。
// 用户 2026-11-19：难度要能自己调、自己试。挑一关，调几个旋钮，现场生成一关顶替包里的那一关，马上试玩；
// 试出合适的数告诉开发，再写进 level_curve.json 重新生成全部关卡。生成的关存在本机，重开游戏还在；「恢复」换回包里的。
import { Node } from 'cc';
import * as Lab from '../core/gen/lab';
import * as Lives from '../core/meta/lives';
import * as Flow from '../game/flow';
import { App } from '../services/app';
import { now } from '../services/clock';
import { COLOR, at, box, button, lazyImg, slice, text } from '../ui/kit';
import { Screen } from '../ui/screen';
import { Page, pageHead, ui } from '../ui/shell';

type Key = keyof Lab.LabKnobs;

/** [旋钮, 名字, 最小, 最大, 步长, 单位] */
const ROWS: [Key, string, number, number, number, string][] = [
  ['pass', '目标过关率', 5, 100, 5, '%'],
  ['queue', '排队泡占', 0, 100, 10, '%'],
  ['ice', '厚冰泡', 0, 5, 1, ' 个'],
  ['iceDeps', '每个冰连', 2, 3, 1, ' 个泡'],
  ['chain', '锁链泡', 0, 4, 1, ' 个'],
  ['buffer', '暂存槽', 3, 5, 1, ' 格'],
];

export class LabPage extends Page {
  private root!: Node;
  private view: Node | null = null;
  private level = 0;
  private knobs!: Lab.LabKnobs;
  private seed = 1;
  private note = '';

  build(root: Node): void {
    this.root = root;
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(root, 'bg/home', (bgH * 1024) / 1536, bgH);
  }

  override show(): void {
    if (this.level === 0) this.pick(App.save.data.level);
    this.render();
  }

  override refresh(): void {
    this.render();
  }

  /** 换到第 id 关：旋钮先填上难度曲线里这一关的值 */
  private pick(id: number): void {
    this.level = Math.max(1, Math.min(App.config.levelCount, id));
    this.knobs = Lab.knobsFor(App.config.curve, this.level);
    if (this.knobs.pass <= 0) this.knobs.pass = 90;
    this.note = '';
  }

  private render(): void {
    this.view?.destroy();
    const v = box('view', this.root, Screen.W, Screen.H);
    this.view = v;
    const top = Screen.headTop;
    pageHead(v, '难度调试');
    const s = App.save.data;
    let y = top - 190;

    // 整体难度：所有关立刻生效，不用重新生成（暂存槽 ±1 格、连击窗口）
    const tierRow = slice(v, 'kit/row_blue', 690, 96, 'tier');
    at(tierRow, 0, y);
    at(text(tierRow, '整体', 30, { align: 'left' }).node, -320, 0);
    ([[1, '简单'], [0, '标准'], [-1, '困难']] as const).forEach(([t, name], i) => {
      const on = App.config.labTier === t;
      const b = button(tierRow, { color: on ? 'green' : 'blue', w: 150, h: 68, label: name, fontSize: 30, onTap: () => {
        App.config.setLabTier(t, App.platform);
        this.note = `整体难度：${name}（暂存槽 ${t > 0 ? '+1 格' : t < 0 ? '−1 格' : '照设计'}，连击窗口 ${App.config.eco.combo.windowSeconds} 秒）`;
        this.render();
      } });
      at(b.node, -60 + i * 160, 0);
    });
    y -= 104;

    // 第几关：±1、±5
    const row0 = slice(v, 'kit/row_blue', 690, 96, 'level');
    at(row0, 0, y);
    const custom = App.config.lab.has(this.level);
    at(text(row0, `第 ${this.level} 关${custom ? '（已改）' : ''}`, 34, { align: 'left' }).node, -320, 0);
    [-5, -1, 1, 5].forEach((d, i) => {
      const b = button(row0, { color: 'blue', w: 84, h: 68, label: d > 0 ? `+${d}` : String(d), fontSize: 28, onTap: () => (this.pick(this.level + d), this.render()) });
      at(b.node, 30 + i * 94, 0);
    });
    y -= 104;

    for (const [key, name, min, max, step, unit] of ROWS) {
      const row = slice(v, 'kit/row_blue', 690, 84, key);
      at(row, 0, y);
      at(text(row, name, 30, { align: 'left' }).node, -320, 0);
      at(text(row, `${this.knobs[key]}${unit}`, 34, { color: COLOR.yellow }).node, 60, 0);
      const set = (d: number) => {
        this.knobs[key] = Math.max(min, Math.min(max, this.knobs[key] + d));
        this.render();
      };
      at(button(row, { color: 'blue', w: 84, h: 64, label: '−', fontSize: 36, onTap: () => set(-step) }).node, 190, 0);
      at(button(row, { color: 'blue', w: 84, h: 64, label: '+', fontSize: 36, onTap: () => set(step) }).node, 288, 0);
      y -= 92;
    }

    const note = text(v, this.note || '调好旋钮点「生成」：现场做一关顶替这一关。过关率是机器人不花道具的比例', 26, { width: 680 });
    at(note.node, 0, y - 18);
    y -= 96;

    const gen = button(v, { color: 'green', w: 330, h: 92, label: '生成', fontSize: 38, onTap: () => this.generate() });
    at(gen.node, -175, y);
    const play = button(v, { color: 'green', w: 330, h: 92, label: '试玩这一关', fontSize: 34, onTap: () => this.play() });
    at(play.node, 175, y);
    y -= 104;
    const back = button(v, { color: 'blue', w: 330, h: 80, label: '恢复原关卡', fontSize: 30, onTap: () => {
      App.config.lab.delete(this.level);
      App.config.saveLab(App.platform);
      this.note = `第 ${this.level} 关换回包里的关卡`;
      this.render();
    } });
    at(back.node, -175, y);
    back.setEnabled(custom);
    const jump = button(v, { color: 'blue', w: 330, h: 80, label: '进度设到这一关', fontSize: 30, onTap: () => {
      s.level = this.level;
      App.save.write();
      this.note = `进度已设到第 ${this.level} 关`;
      this.render();
    } });
    at(jump.node, 175, y);
    y -= 92;
    const coins = button(v, { color: 'yellow', w: 330, h: 80, label: '金币 +1000', fontSize: 30, onTap: () => {
      s.coins += 1000;
      App.save.write();
      ui.refresh();
    } });
    at(coins.node, -175, y);
    const lives = button(v, { color: 'yellow', w: 330, h: 80, label: '生命补满', fontSize: 30, onTap: () => {
      Lives.add(s, App.config.eco, App.config.eco.lives.max, now());
      App.save.write();
      ui.toast('生命已补满');
    } });
    at(lives.node, 175, y);
  }

  private generate(): void {
    ui.busy(true);
    // 等「请稍候」画出来再算（生成要零点几秒到几秒）
    setTimeout(() => {
      this.seed += 1;
      let r: Lab.LabResult | null = null;
      try {
        r = Lab.make(App.config.curve, this.level, this.knobs, this.seed);
      } catch (e) {
        console.warn('生成失败', e);
      }
      ui.busy(false);
      if (r === null) this.note = '这组旋钮生成不出有解的关卡，调松一点再试';
      else {
        App.config.lab.set(this.level, r.lv);
        App.config.saveLab(App.platform);
        const fish = r.lv.bubbles.reduce((n, b) => n + b.fish.length, 0);
        const pc = (x: number) => `${Math.round(x * 100)}%`;
        this.note = `已生成：普通玩家 ${pc(r.normal)}、随手点 ${pc(r.casual)} 能过；打乱 ${pc(r.share)}，${fish} 条鱼 ${r.lv.bubbles.length} 个泡`;
      }
      if (this.view?.isValid) this.render();
    }, 50);
  }

  private play(): void {
    const s = App.save.data;
    // 还没打到的关先把进度设过去，不然结算不认
    if (this.level > s.level) {
      s.level = this.level;
      App.save.write();
    }
    Flow.startLevel(this.level);
  }
}
