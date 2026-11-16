// 广告测试页（设置里的入口，仅调试构建可见；docs/01 7.2，调试用可朴素）：
// 列出全部广告位，可单独触发；今日展示次数、插屏频控状态；可重置频控；可切换「广告可用 / 不可用」。
import { Node } from 'cc';
import * as Meta from '../core/meta/meta';
import { PlatformDebug } from '../platform/platformDebug';
import { App } from '../services/app';
import { mono } from '../services/clock';
import { tr } from '../ui/i18n';
import { COLOR, at, box, button, iconButton, lazyImg, slice, text } from '../ui/kit';
import { Scroller } from '../ui/scroll';
import { Screen } from '../ui/screen';
import { Page, ui } from '../ui/shell';

export class AdTestPage extends Page {
  readonly tab = null;
  private root!: Node;
  private view: Node | null = null;

  build(root: Node): void {
    this.root = root;
    const bgH = Math.max(Screen.H, Screen.W * 1.5);
    lazyImg(root, 'bg/home', (bgH * 1024) / 1536, bgH);
  }

  override show(): void {
    this.render();
  }

  override refresh(): void {
    this.render();
  }

  private render(): void {
    const p = App.platform;
    const dbg = p instanceof PlatformDebug ? p : null;
    const s = App.save.data;
    this.view?.destroy();
    const v = box('view', this.root, Screen.W, Screen.H);
    this.view = v;
    const top = Screen.top;
    const back = iconButton(v, 'kit/round_blue', 'kit/ic_back', 90, () => ui.back());
    at(back, -Screen.W / 2 + 70, top - 80);
    const title = slice(v, 'kit/title_page', 340, 96, 'title');
    at(title, 20, top - 80);
    at(text(title, tr('UI_AD_TEST'), 52).node, 0, 4);

    // 开关 + 频控
    const on = p.adsAvailable();
    const tg = button(v, { color: on ? 'green' : 'gray', w: 330, h: 84, label: on ? '广告：可用' : '广告：不可用', fontSize: 34, onTap: () => {
      if (dbg) dbg.adsOn = !dbg.adsOn;
      this.render();
    } });
    at(tg.node, -175, top - 200);
    const reset = button(v, { color: 'blue', w: 330, h: 84, label: '重置频控', fontSize: 34, onTap: () => {
      s.ads = { interstitialAt: -1e9, interstitialLevel: -1e9, rewardedAt: -1e9 };
      App.save.write();
      ui.toast('频控已重置');
      this.render();
    } });
    at(reset.node, 175, top - 200);
    const can = Meta.shouldShowInterstitial(s, App.config.ads, s.level, mono());
    const st = text(v, `插屏：${can ? '现在会弹' : '频控中'} · 上次插屏关 ${s.ads.interstitialLevel} · 第 ${s.level} 关`, 26, { width: 680 });
    at(st.node, 0, top - 280);

    // 广告位列表
    const y0 = top - 330;
    const y1 = Screen.bottom + 20;
    const sc = new Scroller(v, Screen.W, y0 - y1);
    at(sc.node, 0, (y0 + y1) / 2);
    const ids = Object.keys(App.config.ads.placements);
    ids.forEach((id, i) => {
      const type = App.config.ads.placements[id].type;
      const row = slice(sc.content, 'kit/row_blue', 690, 110, id);
      at(row, 0, -70 - i * 122);
      at(text(row, id, 32, { align: 'left' }).node, -320, 16);
      at(text(row, `${type} · 今日 ${dbg?.shown[id] ?? 0} 次`, 24, { align: 'left', color: COLOR.yellow }).node, -320, -24);
      const go = button(row, { color: 'green', w: 160, h: 76, label: '触发', fontSize: 32, onTap: async () => {
        if (type === 'rewarded') {
          const r = await p.showRewarded(id);
          ui.toast(`${id}：${r}`);
        } else if (type === 'interstitial') {
          await p.showInterstitial(id);
          Meta.markInterstitial(s, s.level, mono());
          App.save.write();
        } else {
          p.showBanner(id);
          setTimeout(() => p.hideBanner(), 3000);
        }
        this.render();
      } });
      at(go.node, 245, 0);
    });
    sc.setContentHeight(ids.length * 122 + 20);
  }
}
