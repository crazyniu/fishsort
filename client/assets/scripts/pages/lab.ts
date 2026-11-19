// 难度调试页（设置里的入口，game.json 开了 levelLab 的测试包才有；docs/01 第 9.7 节。调试用，版面朴素、字直接写）。
// 用户 2026-11-19：难度要能自己调、自己试。
// - 整体三档：暂存槽 ±1 格、连击窗口，所有关立刻生效
// - 单关：每关收紧时存下了容错 0–4 各一档（tools/level/route.ts --lab），挑一档顶替包里那一关，马上试玩。
//   手机上现场生成太慢（一关要几分钟），所以挑现成的。试出合适的档告诉开发，写进难度曲线重新生成
import { Node } from 'cc';
import * as Lives from '../core/meta/lives';
import * as Flow from '../game/flow';
import { App } from '../services/app';
import { now } from '../services/clock';
import { COLOR, at, box, button, lazyImg, slice, text } from '../ui/kit';
import { Screen } from '../ui/screen';
import { Page, pageHead, ui } from '../ui/shell';

export class LabPage extends Page {
  private root!: Node;
  private view: Node | null = null;
  private level = 0;
  private note = '';

  build(root: Node): void {
    this.root = root;
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(root, 'bg/home', (bgH * 1024) / 1536, bgH);
  }

  override show(): void {
    if (this.level === 0) this.level = this.firstWithVersions(App.save.data.level);
    this.render();
  }

  override refresh(): void {
    this.render();
  }

  /** 从 id 起往后找第一个有各档版本的关（没有就停在 id） */
  private firstWithVersions(id: number): number {
    const ids = Object.keys(App.config.labIndex).map(Number).sort((a, b) => a - b);
    return ids.find((x) => x >= id) ?? ids[0] ?? id;
  }

  private render(): void {
    this.view?.destroy();
    const v = box('view', this.root, Screen.W, Screen.H);
    this.view = v;
    const top = Screen.headTop;
    pageHead(v, '难度调试');
    const s = App.save.data;
    let y = top - 190;

    // 整体难度：所有关立刻生效（暂存槽 ±1 格、连击窗口）
    const tierRow = slice(v, 'kit/row_blue', 690, 96, 'tier');
    at(tierRow, 0, y);
    at(text(tierRow, '整体', 30, { align: 'left' }).node, -320, 0);
    ([[1, '简单'], [0, '标准'], [-1, '困难']] as const).forEach(([t, name], i) => {
      const on = App.config.labTier === t;
      const b = button(tierRow, { color: on ? 'green' : 'blue', w: 150, h: 68, label: name, fontSize: 30, onTap: () => {
        App.config.setLabTier(t, App.platform);
        this.note = `整体难度：${name}（暂存槽 ${t > 0 ? '多 1 格' : t < 0 ? '少 1 格' : '照设计'}，连击窗口 ${App.config.eco.combo.windowSeconds} 秒）`;
        this.render();
      } });
      at(b.node, -60 + i * 160, 0);
    });
    y -= 112;

    // 第几关：有各档版本的关之间跳
    const ids = Object.keys(App.config.labIndex).map(Number).sort((a, b) => a - b);
    const row0 = slice(v, 'kit/row_blue', 690, 96, 'level');
    at(row0, 0, y);
    const custom = App.config.lab.get(this.level);
    at(text(row0, `第 ${this.level} 关`, 34, { align: 'left' }).node, -320, 0);
    const step = (d: number) => {
      const i = ids.indexOf(this.level);
      if (ids.length > 0) this.level = ids[Math.max(0, Math.min(ids.length - 1, (i < 0 ? 0 : i) + d))];
      this.note = '';
      this.render();
    };
    at(button(row0, { color: 'blue', w: 130, h: 68, label: '上一关', fontSize: 28, onTap: () => step(-1) }).node, 120, 0);
    at(button(row0, { color: 'blue', w: 130, h: 68, label: '下一关', fontSize: 28, onTap: () => step(1) }).node, 270, 0);
    y -= 112;

    const info = App.config.labIndex[String(this.level)];
    if (!info) {
      at(text(v, '这一关没有各档版本（只给样品关生成了）', 28, { width: 680 }).node, 0, y);
      y -= 90;
    } else {
      // 每档一行：容错、关键步、最少要几格、最长连击；点「用这档」
      const slacks = Object.keys(info.versions).map(Number).sort((a, b) => a - b);
      const using = custom ? custom.slack : info.base;
      for (const sl of slacks) {
        const m = info.versions[String(sl)];
        const row = slice(v, 'kit/row_blue', 690, 84, `s${sl}`);
        at(row, 0, y);
        const tag = `${sl === info.base ? '（包里）' : ''}`;
        at(text(row, `容错 ${sl}${tag}`, 30, { align: 'left', color: sl === using ? COLOR.yellow : undefined }).node, -320, 14);
        const nat = m.natural !== undefined ? `正常打法能过 ${m.natural}% · ` : '';
        at(text(row, `${nat}关键步 ${m.keys} · 连击最多 ${m.run}`, 22, { align: 'left' }).node, -320, -20);
        const b = button(row, { color: sl === using ? 'green' : 'blue', w: 150, h: 64, label: sl === using ? '在用' : '用这档', fontSize: 28, onTap: () => void this.use(sl) });
        at(b.node, 255, 0);
        y -= 92;
      }
    }

    const note = text(v, this.note || '容错 = 能犯几次错（点错、放进暂存槽）；0 = 一步错就过不去。挑一档马上试', 26, { width: 680 });
    at(note.node, 0, y - 10);
    y -= 90;

    const play = button(v, { color: 'green', w: 330, h: 92, label: '试玩这一关', fontSize: 34, onTap: () => this.play() });
    at(play.node, -175, y);
    const back = button(v, { color: 'blue', w: 330, h: 92, label: '恢复包里的', fontSize: 30, onTap: () => {
      App.config.lab.delete(this.level);
      App.config.saveLab(App.platform);
      this.note = `第 ${this.level} 关换回包里的版本`;
      this.render();
    } });
    at(back.node, 175, y);
    back.setEnabled(!!custom);
    y -= 104;
    const coins = button(v, { color: 'yellow', w: 220, h: 80, label: '金币 +1000', fontSize: 28, onTap: () => {
      s.coins += 1000;
      App.save.write();
      ui.refresh();
      ui.toast('金币 +1000');
    } });
    at(coins.node, -235, y);
    const lives = button(v, { color: 'yellow', w: 220, h: 80, label: '生命补满', fontSize: 28, onTap: () => {
      Lives.add(s, App.config.eco, App.config.eco.lives.max, now());
      App.save.write();
      ui.toast('生命已补满');
    } });
    at(lives.node, 0, y);
    const jump = button(v, { color: 'yellow', w: 220, h: 80, label: '进度到这关', fontSize: 28, onTap: () => {
      s.level = this.level;
      App.save.write();
      ui.toast(`进度已设到第 ${this.level} 关`);
    } });
    at(jump.node, 235, y);
    y -= 96;

    // 改过的关一览：截图发给开发就行
    const changed = Array.from(App.config.lab.entries()).sort((a, b) => a[0] - b[0]).map(([id, x]) => `第${id}关 容错${x.slack}`);
    if (changed.length > 0) at(text(v, `已改：${changed.join('、')}`, 24, { width: 680, color: COLOR.yellow }).node, 0, y);
  }

  private async use(slack: number): Promise<void> {
    ui.busy(true);
    try {
      const lv = await App.config.loadLabVersion(this.level, slack);
      lv.id = this.level;
      lv.variants = [];
      App.config.lab.set(this.level, { lv, slack });
      App.config.saveLab(App.platform);
      this.note = `第 ${this.level} 关换成容错 ${slack} 的版本`;
    } catch (e) {
      console.warn('读不出这一档', e);
      this.note = '这一档读不出来';
    } finally {
      ui.busy(false);
    }
    if (this.view?.isValid) this.render();
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
