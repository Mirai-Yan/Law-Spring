/*
 * 法脉·刑法学 · Service Worker
 * - 页面：联网时总取最新版并顺手缓存；离线时用缓存；缓存里也没有，就显示离线页。
 * - /_next/static/：文件名带内容哈希，永不变化，缓存优先。
 * - 图片、图标：先用缓存，后台更新。
 * - /api/、登录与后台：一律走网络、不缓存，个人数据不进缓存。
 * 改动这个文件时请把 VERSION 加一，旧缓存会在新版本激活时清掉。
 */
const VERSION = "v3";
const PAGES = `fm-pages-${VERSION}`;
const STATIC = `fm-static-${VERSION}`;
const ASSETS = `fm-assets-${VERSION}`;
const KEEP = [PAGES, STATIC, ASSETS];
const OFFLINE = "/offline.html";
// 安装时预先缓存的公共页面（连同它们用到的脚本和样式）
const CORE = ["/", "/ask/", "/concepts/", "/crimes/", "/graph/", "/practice/", "/scholars/", "/lens/", "/spectrum/", "/about/"];
const NETWORK_ONLY = [/^\/api\//, /^\/admin\//, /^\/login\//];
const LIMIT = { [PAGES]: 400, [STATIC]: 800, [ASSETS]: 400 };

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const assets = await caches.open(ASSETS);
      await assets.addAll([OFFLINE, "/icons/icon-192.png", "/manifest.webmanifest"]);
      const pages = await caches.open(PAGES);
      const statics = await caches.open(STATIC);
      await Promise.allSettled(
        CORE.map(async (path) => {
          const res = await fetch(path, { credentials: "same-origin" });
          if (!res.ok) return;
          const html = await res.clone().text();
          await pages.put(path, res);
          const urls = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) || [])];
          await Promise.allSettled(urls.map((u) => statics.match(u).then((hit) => hit || statics.add(u))));
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("fm-") && !KEEP.includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function trim(name) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - LIMIT[name]; i++) await cache.delete(keys[i]);
}

function cacheable(res) {
  return res && res.ok && res.type === "basic" && !res.redirected;
}

async function networkFirstPage(request) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (cacheable(res)) {
      await cache.put(request, res.clone());
      trim(PAGES);
    }
    return res;
  } catch {
    // 查询参数不同的页面（如阅读页 ?doc=…）共用同一个页面外壳
    const hit = (await cache.match(request, { ignoreVary: true })) || (await cache.match(request, { ignoreVary: true, ignoreSearch: true }));
    return hit || (await caches.match(OFFLINE)) || Response.error();
  }
}

async function cacheFirst(request, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (cacheable(res)) {
    await cache.put(request, res.clone());
    trim(name);
  }
  return res;
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then(async (res) => {
      if (cacheable(res)) {
        await cache.put(request, res.clone());
        trim(ASSETS);
      }
      return res;
    })
    .catch(() => hit);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  return (await update) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NETWORK_ONLY.some((re) => re.test(url.pathname))) return;
  // 站内跳转时 Next 取的是 RSC 数据；离线时它取不到，会自动改为整页加载，由下面的页面缓存接住
  if (url.searchParams.has("_rsc") || request.headers.get("RSC")) return;

  if (url.pathname.startsWith("/_next/static/")) event.respondWith(cacheFirst(request, STATIC));
  else if (request.mode === "navigate") event.respondWith(networkFirstPage(request));
  else if (/^\/(icons|scholars)\//.test(url.pathname) || ["image", "font"].includes(request.destination)) event.respondWith(staleWhileRevalidate(request, event));
});
