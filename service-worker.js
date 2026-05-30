// service-worker.js - 鹿野的日常 PWA 离线缓存
const CACHE_NAME = 'luye-companion-v1';
const DYNAMIC_CACHE = 'luye-dynamic-v1';
const CORE_ASSETS = [
  './luye-companion.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// 安装时预缓存核心资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] 预缓存核心资源');
      return cache.addAll(CORE_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 激活时清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => {
      return Promise.all(
        names.filter(n => n !== CACHE_NAME && n !== DYNAMIC_CACHE)
          .map(n => {
            console.log('[SW] 删除旧缓存:', n);
            return caches.delete(n);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// 拦截请求
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // HTML 导航：网络优先
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // 换装图片 /outfits/ ：缓存优先
  if (url.pathname.includes('/outfits/')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          // 后台更新
          fetch(event.request).then(resp => {
            if (resp && resp.status === 200) {
              caches.open(DYNAMIC_CACHE).then(c => c.put(event.request, resp.clone()));
            }
          }).catch(() => {});
          return cached;
        }
        return fetch(event.request).then(resp => {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            caches.open(DYNAMIC_CACHE).then(c => c.put(event.request, resp.clone()));
          }
          return resp;
        }).catch(() => new Response('', { status: 503 }));
      })
    );
    return;
  }

  // 其他资源：缓存优先，网络更新
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        fetchAndCache(event.request);
        return cached;
      }
      return fetch(event.request).then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          caches.open(DYNAMIC_CACHE).then(c => c.put(event.request, resp.clone()));
        }
        return resp;
      }).catch(() => {
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('./luye-companion.html');
        }
        return new Response('', { status: 503 });
      });
    })
  );
});

function fetchAndCache(request) {
  fetch(request).then(resp => {
    if (resp && resp.status === 200) {
      caches.open(DYNAMIC_CACHE).then(c => c.put(request, resp.clone()));
    }
  }).catch(() => {});
}
