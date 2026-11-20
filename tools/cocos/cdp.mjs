#!/usr/bin/env node
// 调试用：连上 ./run.sh（或 ./run.sh serve） 开的 Chrome（--remote-debugging-port=9333），读控制台输出或在页面里求值。
// 用法：node tools/cocos/cdp.mjs logs [秒]        收集这么多秒的控制台输出和异常（会先刷新页面）
//       node tools/cocos/cdp.mjs eval '<表达式>'   在页面里求值，打印 JSON
//       node tools/cocos/cdp.mjs shot <输出.jpg> [x,y,w,h]  按 2 倍屏截图（可只截一块，比例 0~1）
//       node tools/cocos/cdp.mjs burst <目录> <张数> <间隔毫秒> '<JS>'  执行 JS 后连拍（看动画）
//       node tools/cocos/cdp.mjs watch [日志文件]   盯着页面：每 2 秒问一声，超过 4 秒没回应（卡死）就暂停、记下正在执行的调用栈（连记 3 次），再放行；
//                                                控制台的异常也记下来。一直跑到 Ctrl+C（2026-11-20：查游戏偶尔卡死、一直响刺耳的声音）
// 只用 Node 自带的 fetch / WebSocket，不装东西。
const PORT = Number(process.env.CDP_PORT ?? 9333);
const [cmd = 'logs', arg = '6'] = process.argv.slice(2);

const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = pages.find((p) => p.type === 'page' && p.url.includes('localhost'));
if (!page) {
  console.error('找不到游戏页面', pages.map((p) => p.url));
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const waiting = new Map();
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const n = ++id;
    waiting.set(n, resolve);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const fmt = (a) => (a.type === 'string' ? a.value : a.description ?? JSON.stringify(a.value));
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && waiting.has(d.id)) {
    waiting.get(d.id)(d.result ?? d.error);
    waiting.delete(d.id);
  } else if (d.method === 'Runtime.consoleAPICalled') {
    console.log(`[${d.params.type}]`, d.params.args.map(fmt).join(' '));
  } else if (d.method === 'Runtime.exceptionThrown') {
    const e = d.params.exceptionDetails;
    console.log('[exception]', e.exception?.description ?? e.text);
  }
};
await new Promise((r) => (ws.onopen = r));
await send('Runtime.enable');
if (cmd === 'watch') {
  const { appendFileSync } = await import('node:fs');
  const out = process.argv[3] ?? '/tmp/fs_watch.log';
  const log = (t) => {
    const line = `${new Date().toISOString()} ${t}`;
    console.log(line);
    appendFileSync(out, line + '\n');
  };
  let pausedStack = null;
  const prev = ws.onmessage;
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.method === 'Debugger.paused') {
      pausedStack = d.params.callFrames.slice(0, 25).map((f) => `    ${f.functionName || '(匿名)'}  ${f.url.split('/').slice(-2).join('/')}:${f.location.lineNumber + 1}:${f.location.columnNumber + 1}`).join('\n');
      return;
    }
    if (d.method === 'Runtime.exceptionThrown') {
      const e = d.params.exceptionDetails;
      log(`[异常] ${e.exception?.description ?? e.text}`);
      return;
    }
    prev(m);
  };
  await send('Debugger.enable');
  log(`开始盯着页面（${page.url}），日志写到 ${out}`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ping = () => Promise.race([send('Runtime.evaluate', { expression: 'Date.now()', returnByValue: true }).then(() => true), sleep(4000).then(() => false)]);
  for (;;) {
    await sleep(2000);
    if (await ping()) continue;
    log('页面 4 秒没有回应，暂停看它卡在哪');
    for (let k = 1; k <= 3; k++) {
      pausedStack = null;
      ws.send(JSON.stringify({ id: ++id, method: 'Debugger.pause' }));
      for (let w = 0; w < 50 && pausedStack === null; w++) await sleep(100);
      log(`第 ${k} 次暂停的调用栈：\n${pausedStack ?? '    （没停下来）'}`);
      ws.send(JSON.stringify({ id: ++id, method: 'Debugger.resume' }));
      await sleep(1000);
    }
    // 卡了好一阵也别刷屏：等它恢复（或者一直等）
    while (!(await ping())) await sleep(5000);
    log('页面恢复响应了');
  }
}
if (cmd === 'eval') {
  const r = await send('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails ?? r, null, 1));
  process.exit(0);
}
if (cmd === 'shot') {
  // 按手机的 2 倍屏渲染后截图（和显示器无关），存成 JPEG：node tools/cocos/cdp.mjs shot <输出路径> [x,y,w,h 设计稿比例 0~1]
  const { writeFileSync } = await import('node:fs');
  const vp = (await send('Runtime.evaluate', { expression: '[innerWidth, innerHeight]', returnByValue: true })).result.value;
  await send('Emulation.setDeviceMetricsOverride', { width: vp[0], height: vp[1], deviceScaleFactor: 2, mobile: false });
  await new Promise((r) => setTimeout(r, 900));
  const [fx, fy, fw, fh] = (process.argv[4] ?? '0,0,1,1').split(',').map(Number);
  const clip = { x: vp[0] * fx, y: vp[1] * fy, width: vp[0] * fw, height: vp[1] * fh, scale: 1 };
  const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 90, clip });
  writeFileSync(arg, Buffer.from(r.data, 'base64'));
  await send('Emulation.clearDeviceMetricsOverride');
  console.log(`SHOT_DONE ${arg}`);
  process.exit(0);
}
if (cmd === 'burst') {
  // 连拍看动画：先在页面里执行 JS，再每隔 ms 截一张（1 倍、JPEG），存成 <目录>/f00.jpg…
  // 用法：node tools/cocos/cdp.mjs burst <目录> <张数> <间隔毫秒> '<JS>'
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const [, dir, n = '10', ms = '120', js = ''] = process.argv.slice(2);
  mkdirSync(dir, { recursive: true });
  const vp = (await send('Runtime.evaluate', { expression: '[innerWidth, innerHeight]', returnByValue: true })).result.value;
  const clip = { x: 0, y: 0, width: vp[0], height: vp[1], scale: Number(process.env.BURST_SCALE ?? 0.36) };
  if (js) await send('Runtime.evaluate', { expression: js });
  const t0 = Date.now();
  for (let i = 0; i < Number(n); i++) {
    const wait = t0 + i * Number(ms) - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 62, clip });
    writeFileSync(`${dir}/f${String(i).padStart(2, '0')}.jpg`, Buffer.from(r.data, 'base64'));
  }
  console.log(`BURST_DONE ${dir} ${Date.now() - t0}ms`);
  process.exit(0);
}
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
setTimeout(() => process.exit(0), Number(arg) * 1000);
