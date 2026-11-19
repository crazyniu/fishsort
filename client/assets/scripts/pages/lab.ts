// 难度调试页（设置里的入口，game.json 开了 levelLab 的测试包才有；docs/01 第 9.7 节。调试用，版面朴素、字直接写）。
// 用户 2026-11-19：难度要能自己调、自己试。
// - 整体三档：暂存槽 ±1 格、连击窗口，所有关立刻生效
// - 单关：每关收紧时按「正常打法能过几成」每 10% 存了一档（tools/level/route.ts --lab），挑一档顶替包里那一关，马上试玩。
//   手机上现场生成太慢，所以挑现成的。试出合适的档告诉开发，写进难度曲线（jam.targets）重新生成
// - 演示：「看路线」让电脑按关卡里存的参考解打一遍（打得完 = 这一档一定过得去），「看正常打法」现场按正常打法打一局
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
      // 每档一行（从容易到难）：正常打法能过几成、想清楚能过几成、路线最长连击；点「用这档」。
      // 档多的时候行高跟着压，底下的按钮都要留在屏幕里（2026-11-19 第 6 关 8 档时下面一排被挤出屏幕）
      const vers = Object.keys(info.versions).map(Number).sort((a, b) => b - a);
      const using = custom ? custom.ver : info.base;
      // 行下面还要放：说明一行、演示一排、试玩一排、金币生命一排、「已改」一行
      const bottom = -Screen.H / 2 + 430;
      const step = Math.max(62, Math.min(92, Math.floor((y + 46 - bottom) / Math.max(1, vers.length))));
      const rowH = step - 8;
      const k = Math.min(1, rowH / 84);
      for (const ver of vers) {
        const m = info.versions[String(ver)];
        const row = slice(v, 'kit/row_blue', 690, rowH, `p${ver}`);
        at(row, 0, y);
        const tag = `${ver === info.base ? '（包里）' : ''}`;
        at(text(row, `正常打法能过 ${m.natural}%${tag}`, Math.round(30 * k), { align: 'left', color: ver === using ? COLOR.yellow : undefined }).node, -320, 14 * k);
        at(text(row, `想清楚能过 ${m.think}% · 连击最多 ${m.run}`, Math.max(18, Math.round(22 * k)), { align: 'left' }).node, -320, -20 * k);
        const b = button(row, { color: ver === using ? 'green' : 'blue', w: 150, h: Math.min(64, rowH - 10), label: ver === using ? '在用' : '用这档', fontSize: 28, onTap: () => void this.use(ver) });
        at(b.node, 255, 0);
        y -= step;
      }
    }

    const note = text(v, this.note || (info ? `这关目标：正常打法 ${info.target}% 能过。挑一档马上试，或先看电脑打一遍` : ''), 26, { width: 680 });
    at(note.node, 0, y - 6);
    y -= 76;

    // 演示：电脑打在用的这一档（调试页换了档就打换的，没换就打包里的）
    const route = button(v, { color: 'yellow', w: 330, h: 80, label: '看路线（一定能过）', fontSize: 28, onTap: () => Flow.startDemo(this.level, 'route') });
    at(route.node, -175, y);
    const casual = button(v, { color: 'yellow', w: 330, h: 80, label: '看正常打法打一局', fontSize: 28, onTap: () => Flow.startDemo(this.level, 'casual') });
    at(casual.node, 175, y);
    y -= 96;

    const play = button(v, { color: 'green', w: 330, h: 84, label: '试玩这一关', fontSize: 34, onTap: () => this.play() });
    at(play.node, -175, y);
    const back = button(v, { color: 'blue', w: 330, h: 84, label: '恢复包里的', fontSize: 30, onTap: () => {
      App.config.lab.delete(this.level);
      App.config.saveLab(App.platform);
      this.note = `第 ${this.level} 关换回包里的版本`;
      this.render();
    } });
    at(back.node, 175, y);
    back.setEnabled(!!custom);
    y -= 96;
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
    const changed = Array.from(App.config.lab.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([id, x]) => `第${id}关 ${App.config.labIndex[String(id)]?.versions[String(x.ver)]?.natural ?? x.ver}%`);
    if (changed.length > 0) at(text(v, `已改：${changed.join('、')}`, 24, { width: 680, color: COLOR.yellow }).node, 0, y);
  }

  private async use(ver: number): Promise<void> {
    ui.busy(true);
    try {
      const lv = await App.config.loadLabVersion(this.level, ver);
      lv.id = this.level;
      lv.variants = [];
      App.config.lab.set(this.level, { lv, ver });
      App.config.saveLab(App.platform);
      const m = App.config.labIndex[String(this.level)]?.versions[String(ver)];
      this.note = `第 ${this.level} 关换成「正常打法能过 ${m ? m.natural : ver}%」的版本`;
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
