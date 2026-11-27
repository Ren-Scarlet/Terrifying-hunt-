/**
 * 生成离线 Service Worker。
 *
 * 在 `vite build` 之后运行：扫描 dist/ 里所有产物，写进 sw.js 的预缓存清单，
 * 缓存版本号用「文件清单的哈希」代替时间戳，内容不变就不会让用户重复下载 20MB。
 *
 *   node scripts/build-sw.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(DIST)
  .map((full) => relative(DIST, full).split(sep).join('/'))
  .filter((file) => file !== 'sw.js');

const hash = createHash('sha1');
for (const file of files) {
  hash.update(file);
  hash.update(String(statSync(join(DIST, file)).size));
}
const version = `v${hash.digest('hex').slice(0, 12)}`;

const sw = `/* 自动生成，请勿手改：scripts/build-sw.mjs */
const VERSION = ${JSON.stringify(version)};
const ASSETS = ${JSON.stringify(files.map((file) => './' + file), null, 2)};

const absolute = (path) => new URL(path, self.registration.scope).toString();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(ASSETS.map(absolute)))
      .then(() => self.skipWaiting())
      .catch(() => undefined),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：先走网络，断网时回退到缓存的首页（单页应用）。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(absolute('./index.html'), copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match(absolute('./index.html')).then((hit) => hit || Response.error())),
    );
    return;
  }

  // 静态资源：缓存优先，断网也能继续玩。
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      });
    }),
  );
});
`;

writeFileSync(join(DIST, 'sw.js'), sw, 'utf8');
console.log(`sw.js 已生成：${files.length} 个文件，版本 ${version}`);
