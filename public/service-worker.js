const CACHE_VERSION = 'v2'
const APP_PREFIX = 'couple-expense-app'
const PAGE_CACHE_NAME = `${APP_PREFIX}-pages-${CACHE_VERSION}`
const ASSET_CACHE_NAME = `${APP_PREFIX}-assets-${CACHE_VERSION}`
const PRECACHE_URLS = ['/favicon.svg', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(ASSET_CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter(
            (cacheName) =>
              cacheName.startsWith(`${APP_PREFIX}-`) &&
              cacheName !== PAGE_CACHE_NAME &&
              cacheName !== ASSET_CACHE_NAME,
          )
          .map((cacheName) => caches.delete(cacheName))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

const putInCache = async (cacheName, request, response) => {
  if (!response || response.status !== 200 || response.type !== 'basic') {
    return response
  }

  const cache = await caches.open(cacheName)
  await cache.put(request, response.clone())
  return response
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  const requestUrl = new URL(event.request.url)
  const isSameOrigin = requestUrl.origin === self.location.origin
  const shouldBypassCache =
    requestUrl.pathname === '/' ||
    requestUrl.pathname === '/index.html' ||
    requestUrl.pathname === '/service-worker.js'

  if (shouldBypassCache) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }))
    return
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          return putInCache(PAGE_CACHE_NAME, '/index.html', response)
        })
        .catch(async () => {
          const cachedPage = await caches.match('/index.html')
          return cachedPage || caches.match(event.request)
        })
    )
    return
  }

  if (isSameOrigin && requestUrl.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse
        }

        return fetch(event.request).then((response) => putInCache(ASSET_CACHE_NAME, event.request, response))
      })
    )
    return
  }

  event.respondWith(
    caches.match(event.request).then(async (cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      try {
        const response = await fetch(event.request)
        return putInCache(ASSET_CACHE_NAME, event.request, response)
      } catch {
        return caches.match('/index.html')
      }
    })
  )
})
