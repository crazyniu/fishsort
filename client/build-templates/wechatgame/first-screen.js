// 微信小游戏的「首屏」：引擎脚本还没加载完的那一两秒画什么。构建时这份文件覆盖 Cocos 模板里的同名文件
// （client/build-templates/wechatgame/ 下的文件会原样拷进构建产物）。
// Cocos 原版在这里画它自己的 logo、标语和进度条（用户 2026-11-18：启动时先闪一下 Cocos 的界面，去掉）。
// 我们只铺一层和加载页（ui/loading.ts）底色相同的海蓝，引擎起来后加载页接着出现，画面不跳。
// 接口和原版一样：game.js 调 start → setProgress → end。WebGL 上下文的创建方式也照原版，引擎之后会复用同一个上下文。

/** 加载页的底色 rgb(40, 150, 210)，和 ui/loading.ts 一致 */
const BG = [40 / 255, 150 / 255, 210 / 255, 1];

const options = {
  alpha: false,
  antialias: true,
  depth: true,
  stencil: true,
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
  powerPreference: 'default',
  failIfMajorPerformanceCaveat: false,
};

let gl = null;
let rafHandle = null;
let afterTick = null;

function draw() {
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(BG[0], BG[1], BG[2], BG[3]);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

function tick() {
  rafHandle = requestAnimationFrame(() => {
    draw();
    tick();
    if (afterTick) {
      afterTick();
      afterTick = null;
    }
  });
}

function setProgress() {
  return new Promise((resolve) => {
    afterTick = resolve;
  });
}

function start(alpha, antialias, useWebgl2) {
  options.alpha = alpha === 'true';
  options.antialias = antialias !== 'false';
  if (useWebgl2 === 'true') gl = window.canvas.getContext('webgl2', options);
  // 和原版一样：拿到 WebGL2 上下文就告诉引擎支持 WebGL2，否则退回 WebGL1
  if (gl) {
    window.WebGL2RenderingContext = true;
  } else {
    window.WebGL2RenderingContext = false;
    gl = window.canvas.getContext('webgl', options);
  }
  tick();
  return setProgress();
}

function end() {
  return setProgress().then(() => cancelAnimationFrame(rafHandle));
}

module.exports = { start, end, setProgress };
