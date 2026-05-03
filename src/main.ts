import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { showPwaUpdate } from './composables/usePwaUpdate'
import { setAppError } from './composables/useRuntimeStatus'

const renderFatalError = (message: string) => {
  const target = document.querySelector('#app')
  if (!target) return

  target.innerHTML = `
    <div style="max-width:720px;margin:24px auto;padding:16px;">
      <div style="border:1px solid rgba(198,93,93,.18);background:rgba(255,255,255,.95);border-radius:20px;padding:20px;box-shadow:0 18px 40px rgba(70,52,38,.08);">
        <p style="margin:0 0 8px;color:#b25353;font-weight:700;">页面加载失败</p>
        <p style="margin:0;color:#243244;line-height:1.6;">${message}</p>
      </div>
    </div>
  `
}

window.addEventListener('error', (event) => {
  const message = event.error?.message || event.message || '应用发生未知错误。'
  setAppError(message)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason)
  setAppError(reason || '应用发生未处理的异步错误。')
})

try {
  const app = createApp(App)
  app.config.errorHandler = (error) => {
    const message = error instanceof Error ? error.message : String(error)
    setAppError(message)
    console.error(error)
  }
  app.mount('#app')
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  setAppError(message)
  renderFatalError(message)
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    if (import.meta.env.DEV) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)))
      }
      return
    }

    let hasReloadedForUpdate = false
    let pendingActivation = false

    const activateWaitingWorker = (registration: ServiceWorkerRegistration) => {
      if (!registration.waiting) return
      pendingActivation = true
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }

    const promptForUpdate = (registration: ServiceWorkerRegistration) => {
      if (!registration.waiting) return
      showPwaUpdate(__APP_VERSION__, () => activateWaitingWorker(registration))
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hasReloadedForUpdate || !pendingActivation) return
      hasReloadedForUpdate = true
      window.location.reload()
    })

    navigator.serviceWorker
      .register(`/service-worker.js?v=${encodeURIComponent(__APP_VERSION__)}`)
      .then(async (registration) => {
        if (registration.waiting) {
          promptForUpdate(registration)
        }

        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing
          if (!installingWorker) return

          installingWorker.addEventListener('statechange', () => {
            if (
              installingWorker.state === 'installed' &&
              navigator.serviceWorker.controller &&
              registration.waiting
            ) {
              promptForUpdate(registration)
            }
          })
        })

        await registration.update()
      })
      .catch((error) => {
        console.warn('Service Worker registration failed:', error)
      })
  })
}
