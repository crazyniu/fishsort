import {
  _decorator,
  Camera,
  Canvas,
  Color,
  Component,
  Graphics,
  Label,
  Layers,
  Node,
  ResolutionPolicy,
  tween,
  UITransform,
  Vec3,
  view,
  Widget,
} from 'cc';

const { ccclass } = _decorator;

/** 设计分辨率：750×1334 竖屏，适配宽度（docs/09 第 8 节）。 */
const DESIGN_WIDTH = 750;
const DESIGN_HEIGHT = 1334;

/**
 * 启动组件：唯一挂在场景里的脚本。界面全部由代码生成，不依赖编辑器里手拖的节点。
 * 第 1 步只搭画布和相机，画一个会动的占位图，证明渲染循环在跑。
 */
@ccclass('Boot')
export class Boot extends Component {
  protected onLoad(): void {
    view.setDesignResolutionSize(DESIGN_WIDTH, DESIGN_HEIGHT, ResolutionPolicy.FIXED_WIDTH);
    const canvas = this.createCanvas();
    this.drawPlaceholder(canvas);
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

  private drawPlaceholder(canvas: Node): void {
    const bubble = new Node('Bubble');
    bubble.layer = Layers.Enum.UI_2D;
    canvas.addChild(bubble);
    bubble.addComponent(UITransform);
    const g = bubble.addComponent(Graphics);
    g.lineWidth = 8;
    g.fillColor = new Color(120, 220, 255, 140);
    g.strokeColor = new Color(255, 255, 255, 230);
    g.circle(0, 0, 120);
    g.fill();
    g.stroke();
    bubble.setPosition(0, 120, 0);
    tween(bubble)
      .repeatForever(
        tween(bubble)
          .to(0.8, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineInOut' })
          .to(0.8, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' }),
      )
      .start();

    // 占位用的工程信息，不是玩家文案；第 7 步接 i18n 时随占位画面一起删掉
    const info = new Node('Info');
    info.layer = Layers.Enum.UI_2D;
    canvas.addChild(info);
    info.addComponent(UITransform);
    const label = info.addComponent(Label);
    label.string = 'fishsort · Cocos Creator 3.8.8';
    label.fontSize = 40;
    label.color = Color.WHITE;
    info.setPosition(0, -120, 0);
  }
}
