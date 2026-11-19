// 内网试玩用的静态文件服务（./run.sh lan）。Python 自带的 http.server 排队只有 5 个，别的设备一次要几十个文件时
// 会被重置连接、缺图缺声音（2026-11-20 从另一台机器访问时发现），所以内网模式用这个。只用 Node 自带的模块。
// 用法：node tools/web/serve.mjs <目录> <端口> [绑定地址，默认 0.0.0.0]
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const [dir, port, host = '0.0.0.0'] = process.argv.slice(2);
if (!dir || !port) {
  console.error('用法：node tools/web/serve.mjs <目录> <端口> [绑定地址]');
  process.exit(1);
}
const root = resolve(dir);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.bin': 'application/octet-stream',
};

const server = createServer((req, res) => {
  let path;
  try {
    path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = normalize(join(root, path));
  // 不让请求走出这个目录
  if (file !== root && !file.startsWith(root + '/')) {
    res.writeHead(403).end();
    return;
  }
  let st;
  try {
    st = statSync(file);
    if (st.isDirectory()) {
      file = join(file, 'index.html');
      st = statSync(file);
    }
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('没有这个文件');
    return;
  }
  // 试玩时每次都要拿到最新构建，不让浏览器缓存
  res.writeHead(200, { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
});
server.listen(Number(port), host, 511, () => console.log(`在 ${host}:${port} 提供 ${root}`));
