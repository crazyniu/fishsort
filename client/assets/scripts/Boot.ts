// 启动：画布与相机 → 平台、配置、存档 → 文案、图、音效 → 界面外壳 → 主页。
// 唯一挂在场景里的脚本，界面全部由代码生成（docs/09 第 8 节）。
import { _decorator, Camera, Canvas, Color, Component, Label, Layers, Node, ResolutionPolicy, UITransform, Widget, profiler, tween, view } from 'cc';
import { DEBUG } from 'cc/env';
import { GamePage } from './game/gameView';
import { ResultPage } from './game/result';
import { HomePage } from './pages/home';
import { CollectPage } from './pages/collect';
import { LevelsPage } from './pages/levels';
import { ShopPage } from './pages/shop';
import { LockPage, TodoPage } from './pages/lock';
import { App } from './services/app';
import { initAudio, sfx } from './services/audio';
import { loadStrings, onLanguage, tr } from './ui/i18n';
import { setTapSound } from './ui/kit';
import { livesPopup, settingsPopup } from './ui/popups';
import { preload } from './ui/res';
import { Screen } from './ui/screen';
import { reportError, setErrorSink, ui } from './ui/shell';

const { ccclass } = _decorator;

/** 设计分辨率：750×1334 竖屏，适配宽度（docs/09 第 8 节） */
const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1334;

@ccclass('Boot')
export class Boot extends Component {
  protected override onLoad(): void {
    view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
    Screen.init();
    profiler.hideStats();
    const canvas = this.createCanvas();
    if (DEBUG) this.errorOverlay(canvas);
    const loading = this.loading(canvas);
    this.boot(canvas)
      .then(() => loading.destroy())
      .catch((e: unknown) => {
        (loading.getComponent(Label) as Label).string = `启动失败：${String(e)}`;
        console.error(e);
      });
  }

  private async boot(canvas: Node): Promise<void> {
    await App.start();
    await Promise.all([loadStrings(App.save.data.settings.lang ?? 'zh_CN'), preload(), initAudio(this.node)]);
    setTapSound((n) => sfx(n));
    const topActions = {
      coins: () => ui.go('shop'),
      lives: () => livesPopup(),
      settings: () => settingsPopup('home'),
      profile: () => ui.go('profile'),
    };
    ui.init(canvas, topActions);
    ui.register('home', () => new HomePage());
    ui.register('game', () => new GamePage());
    ui.register('result', () => new ResultPage());
    ui.register('lock', () => new LockPage());
    ui.register('shop', () => new ShopPage());
    ui.register('base', () => new TodoPage('base', 'homeBase'));
    ui.register('collect', () => new CollectPage());
    ui.register('rank', () => new TodoPage('rank', 'rank'));
    ui.register('levels', () => new LevelsPage());
    ui.register('daily', () => new TodoPage(null, 'daily'));
    ui.register('wheel', () => new TodoPage(null, 'wheel'));
    ui.register('profile', () => new TodoPage(null, 'album'));
    ui.register('adtest', () => new TodoPage(null, 'wheel'));
    onLanguage(() => ui.rebuild(topActions));
    // 调试：?level=N 直接进关
    if (App.flags.level > 0 && App.flags.play) ui.go('game', { level: App.flags.level });
    else if (App.flags.page) ui.go(App.flags.page);
    else ui.go('home');
    // 顶栏的生命倒计时、无限生命每秒走一次
    tween(this.node)
      .repeatForever(tween(this.node).delay(1).call(() => ui.currentName === 'home' && ui.topbar.refresh()))
      .start();
  }

  private createCanvas(): Node {
    const canvasNode = new Node('Canvas');
    canvasNode.layer = Layers.Enum.UI_2D;
    canvasNode.addComponent(UITransform);
    this.node.scene.addChild(canvasNode);
    const cameraNode = new Node('UICamera');
    cameraNode.layer = Layers.Enum.UI_2D;
    cameraNode.setPosition(0, 0, 1000);
    canvasNode.addChild(cameraNode);
    const camera = cameraNode.addComponent(Camera);
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.visibility = Layers.Enum.UI_2D;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(18, 74, 160, 255);
    camera.near = 1;
    camera.far = 2000;
    const canvas = canvasNode.addComponent(Canvas);
    canvas.cameraComponent = camera;
    const widget = canvasNode.addComponent(Widget);
    widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
    widget.top = widget.bottom = widget.left = widget.right = 0;
    return canvasNode;
  }

  /** 调试构建：没接住的错误画在屏幕顶上，截图就能看到 */
  private errorOverlay(canvas: Node): void {
    const n = new Node('errors');
    n.layer = Layers.Enum.UI_2D;
    const t = n.addComponent(UITransform);
    t.setContentSize(Screen.W - 20, 10);
    t.setAnchorPoint(0.5, 1);
    canvas.addChild(n);
    n.setPosition(0, Screen.H / 2 - 10, 0);
    const l = n.addComponent(Label);
    l.fontSize = 20;
    l.lineHeight = 24;
    l.color = new Color(255, 60, 60, 255);
    l.overflow = Label.Overflow.RESIZE_HEIGHT;
    l.enableWrapText = true;
    l.string = '';
    const lines: string[] = [];
    setErrorSink((msg) => {
      lines.push(msg);
      l.string = lines.slice(-4).join('\n');
      n.setSiblingIndex(canvas.children.length - 1);
    });
    const g = globalThis as unknown as { addEventListener?: (t: string, f: (e: { error?: unknown; reason?: unknown; message?: string }) => void) => void };
    g.addEventListener?.('error', (e) => reportError('error', e.error ?? e.message));
    g.addEventListener?.('unhandledrejection', (e) => reportError('promise', e.reason));
  }

  /** 载入页：文案还没读到，先用系统字体 */
  private loading(canvas: Node): Node {
    const n = new Node('loading');
    n.layer = Layers.Enum.UI_2D;
    n.addComponent(UITransform);
    canvas.addChild(n);
    const l = n.addComponent(Label);
    l.string = '…';
    l.fontSize = 48;
    l.isBold = true;
    void tr;
    return n;
  }
}
