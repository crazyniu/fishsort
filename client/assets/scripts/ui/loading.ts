// 加载页（docs/ux/loading.md）：主页那张海底背景、游戏图标轻轻浮动、游戏名、进度条、一行小提示；
// 微信版（hasCapability('health_notice')）中文下最底下两行健康游戏忠告。下载失败时进度条换成提示和「重试」。
// 加载页出来时 resources 还没读（微信版要从网上下），所以只用本地 boot 包里的图、文案和字体，按钮自己画。
// 字体读到之前的一瞬间用系统字体，读到后换成游戏字体。
import { AssetManager, Color, Font, Graphics, JsonAsset, Label, Node, Sprite, SpriteFrame, UIOpacity, UITransform, tween, Tween, Vec3 } from 'cc';
import { loadFont, uiFont } from './res';
import { Screen } from './screen';

type Table = Record<string, Record<string, string>>;

const BAR_W = 520;
const BAR_H = 36;
const GREEN = new Color(76, 196, 62, 255);
const TRACK = new Color(10, 40, 90, 150);
const INK = new Color(18, 60, 120, 255);
const WHITE = Color.WHITE;
/** 小提示几秒换一条 */
const TIP_SECONDS = 3;
/** 进度条每秒最多走多少（0–1）：加载太快也让条走完，不闪一下就没了（总共至少约 0.8 秒） */
const BAR_SPEED = 1.25;

function node(name: string, parent: Node, w = 0, h = 0): Node {
  const n = new Node(name);
  n.layer = parent.layer;
  n.addComponent(UITransform).setContentSize(w, h);
  parent.addChild(n);
  return n;
}

function label(parent: Node, s: string, size: number, color: Color, outline: Color | null = null): Label {
  const l = node('text', parent).addComponent(Label);
  l.string = s;
  l.fontSize = size;
  l.lineHeight = Math.round(size * 1.3);
  const f = uiFont();
  if (f) {
    l.useSystemFont = false;
    l.font = f;
  } else {
    l.isBold = true;
  }
  l.color = color;
  l.horizontalAlign = Label.HorizontalAlign.CENTER;
  if (outline) {
    l.enableOutline = true;
    l.outlineColor = outline;
    l.outlineWidth = Math.max(2, Math.round(size / 12));
  }
  return l;
}

function roundRect(g: Graphics, x: number, y: number, w: number, h: number, c: Color): void {
  g.fillColor = c;
  g.roundRect(x, y, w, h, h / 2);
  g.fill();
}

export class LoadingView {
  readonly root: Node;
  private table: Table = {};
  private lang = 'zh_CN';
  private health = false;
  private bar: Graphics;
  private barNode: Node;
  private pct: Label;
  private tip: Label;
  private name: Label;
  private notice: Label;
  private version: Label;
  private fail: Node | null = null;
  private tipIndex = 0;
  /** 目标进度和画出来的进度（画的追着目标走，不倒退） */
  private target = 0;
  private shown = 0;
  private finishing: (() => void) | null = null;

  constructor(canvas: Node) {
    const root = node('loading', canvas, Screen.W, Screen.H);
    this.root = root;
    // 底色先用海蓝，背景图读到再铺上
    const g0 = node('fill', root).addComponent(Graphics);
    g0.fillColor = new Color(40, 150, 210, 255);
    g0.rect(-Screen.W / 2, -Screen.H / 2, Screen.W, Screen.H);
    g0.fill();

    const midY = Screen.H * 0.1;
    this.name = label(root, '', 64, WHITE, INK);
    this.name.node.setPosition(0, midY - 250, 0);

    this.barNode = node('bar', root, BAR_W, BAR_H);
    this.barNode.setPosition(0, midY - 400, 0);
    this.bar = this.barNode.addComponent(Graphics);
    this.pct = label(this.barNode, '0%', 26, WHITE, INK);

    this.tip = label(root, '', 30, WHITE, INK);
    this.tip.node.setPosition(0, midY - 470, 0);
    (this.tip.node.getComponent(UITransform) as UITransform).width = Screen.W - 80;
    this.tip.overflow = Label.Overflow.RESIZE_HEIGHT;

    this.notice = label(root, '', 20, WHITE, new Color(10, 40, 90, 200));
    this.notice.node.setPosition(0, Screen.bottom + 70, 0);
    this.version = label(root, '', 20, new Color(255, 255, 255, 200));
    this.version.horizontalAlign = Label.HorizontalAlign.RIGHT;
    (this.version.node.getComponent(UITransform) as UITransform).setAnchorPoint(1, 0.5);
    this.version.node.setPosition(Screen.W / 2 - 24, Screen.bottom + 24, 0);

    this.drawBar();
    // 进度条追着目标走；小提示定时换
    tween(root)
      .repeatForever(tween(root).delay(1 / 30).call(() => this.step(1 / 30)))
      .start();
    tween(root)
      .repeatForever(tween(root).delay(TIP_SECONDS).call(() => this.nextTip()))
      .start();
  }

  /** 本地 boot 包读到后：铺背景、放图标、读文案、换游戏字体 */
  useBundle(b: AssetManager.Bundle): void {
    loadFont()
      .then((f) => this.useFont(f))
      .catch((e: unknown) => console.warn('字体读不出来', e));
    b.load('bg/spriteFrame', SpriteFrame, (err: Error | null, sf: SpriteFrame) => {
      if (err || !this.root.isValid) return;
      const n = node('bg', this.root);
      n.setSiblingIndex(1);
      const sp = n.addComponent(Sprite);
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
      sp.spriteFrame = sf;
      // 铺满：按宽高里放大得多的那个
      const k = Math.max(Screen.W / sf.originalSize.width, Screen.H / sf.originalSize.height);
      (n.getComponent(UITransform) as UITransform).setContentSize(sf.originalSize.width * k, sf.originalSize.height * k);
    });
    b.load('logo/spriteFrame', SpriteFrame, (err: Error | null, sf: SpriteFrame) => {
      if (err || !this.root.isValid) return;
      const n = node('logo', this.root, 360, 360);
      n.setPosition(0, Screen.H * 0.1, 0);
      const sp = n.addComponent(Sprite);
      sp.sizeMode = Sprite.SizeMode.CUSTOM;
      sp.spriteFrame = sf;
      const y = n.position.y;
      tween(n)
        .repeatForever(
          tween(n)
            .to(1.2, { position: new Vec3(0, y + 14, 0) }, { easing: 'sineInOut' })
            .to(1.2, { position: new Vec3(0, y, 0) }, { easing: 'sineInOut' }),
        )
        .start();
    });
    b.load('strings', JsonAsset, (err: Error | null, a: JsonAsset) => {
      if (err || !this.root.isValid) return;
      this.table = a.json as Table;
      this.refreshText();
    });
  }

  private useFont(f: Font): void {
    if (!this.root.isValid) return;
    for (const l of this.root.getComponentsInChildren(Label)) {
      l.useSystemFont = false;
      l.font = f;
      // 字体本身就是粗体，不再加粗
      l.isBold = false;
    }
  }

  /** 语言定了（读到存档以后）；health：要不要显示健康游戏忠告（微信版，只在中文下） */
  setLanguage(lang: string, health: boolean): void {
    this.lang = lang;
    this.health = health;
    this.refreshText();
  }

  setVersion(v: string): void {
    this.version.string = v ? `v${v}` : '';
  }

  /** 0–1；不倒退 */
  setProgress(p: number): void {
    this.target = Math.max(this.target, Math.min(1, p));
  }

  /** 下载失败：进度条换成一行提示和「重试」，点了调 retry */
  showFail(retry: () => void): void {
    this.barNode.active = false;
    this.tip.node.active = false;
    this.fail?.destroy();
    const f = node('fail', this.root);
    f.setPosition(0, this.barNode.position.y, 0);
    this.fail = f;
    label(f, this.t('BOOT_FAIL'), 32, WHITE, INK).node.setPosition(0, 40, 0);
    const btn = node('retry', f, 260, 96);
    btn.setPosition(0, -60, 0);
    const g = btn.addComponent(Graphics);
    roundRect(g, -130, -48, 260, 96, GREEN);
    label(btn, this.t('BOOT_RETRY'), 40, WHITE, new Color(30, 110, 30, 255));
    btn.on(Node.EventType.TOUCH_END, () => {
      f.destroy();
      this.fail = null;
      this.barNode.active = true;
      this.tip.node.active = true;
      retry();
    });
  }

  /** 进度条走到头、停一下，整页淡出后销毁（主页已经在下面搭好，加载页先挪到最上层盖着它） */
  finish(): Promise<void> {
    const parent = this.root.parent;
    if (parent) this.root.setSiblingIndex(parent.children.length - 1);
    this.setProgress(1);
    return new Promise((resolve) => {
      this.finishing = () => {
        const op = this.root.addComponent(UIOpacity);
        tween(op)
          .delay(0.2)
          .to(0.25, { opacity: 0 })
          .call(() => {
            Tween.stopAllByTarget(this.root);
            this.root.destroy();
            resolve();
          })
          .start();
      };
    });
  }

  private step(dt: number): void {
    if (this.shown < this.target) {
      this.shown = Math.min(this.target, this.shown + BAR_SPEED * dt);
      this.drawBar();
    }
    if (this.finishing && this.shown >= 1) {
      const f = this.finishing;
      this.finishing = null;
      f();
    }
  }

  private drawBar(): void {
    const g = this.bar;
    g.clear();
    roundRect(g, -BAR_W / 2, -BAR_H / 2, BAR_W, BAR_H, TRACK);
    const w = Math.max(BAR_H, BAR_W * this.shown);
    if (this.shown > 0) roundRect(g, -BAR_W / 2, -BAR_H / 2, w, BAR_H, GREEN);
    this.pct.string = `${Math.floor(this.shown * 100)}%`;
  }

  private t(key: string): string {
    return this.table[this.lang]?.[key] ?? this.table.zh_CN?.[key] ?? '';
  }

  private tips(): string[] {
    const all = this.table[this.lang] ?? {};
    return Object.keys(all)
      .filter((k) => k.startsWith('BOOT_TIP_'))
      .map((k) => all[k]);
  }

  private nextTip(): void {
    const list = this.tips();
    if (list.length === 0) return;
    this.tipIndex = (this.tipIndex + 1) % list.length;
    this.tip.string = list[this.tipIndex];
  }

  private refreshText(): void {
    this.name.string = this.t('BOOT_NAME');
    const list = this.tips();
    if (list.length) this.tip.string = list[this.tipIndex % list.length];
    this.notice.string = this.health && this.lang === 'zh_CN' ? this.t('BOOT_HEALTH') : '';
  }
}
