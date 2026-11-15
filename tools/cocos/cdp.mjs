#!/usr/bin/env node
// 调试用：连上 ./run.sh web-serve 开的 Chrome（--remote-debugging-port=9333），读控制台输出或在页面里求值。
// 用法：node tools/cocos/cdp.mjs logs [秒]        收集这么多秒的控制台输出和异常（会先刷新页面）
//       node tools/cocos/cdp.mjs eval '<表达式>'   在页面里求值，打印 JSON
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
if (cmd === 'eval') {
  const r = await send('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true });
  console.log(JSON.stringify(r.result?.value ?? r.exceptionDetails ?? r, null, 1));
  process.exit(0);
}
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
setTimeout(() => process.exit(0), Number(arg) * 1000);
