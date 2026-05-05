import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { registerPwaRegistration, setPwaUpdated, showPwaUpdate } from './composables/usePwaUpdate'
import { setAppError } from './composables/useRuntimeStatus'

const renderFatalError = () => {
  const target = document.querySelector('#app')
  if (!target) return

  target.innerHTML = `
    <div style="position:fixed;left:50%;top:calc(12px + env(safe-area-inset-top, 0px));transform:translateX(-50%);width:min(calc(100% - 24px), 560px);z-index:9999;">
      <div style="border:1px solid rgba(227,93,84,.18);background:rgba(255,255,255,.96);border-radius:22px;padding:16px 18px;box-shadow:0 18px 40px rgba(70,52,38,.08);backdrop-filter:blur(18px);">
        <p style="margin:0 0 4px;color:#b25353;font-weight:700;">页面加载失败</p>
        <p style="margin:0;color:#243244;line-height:1.6;">页面出现问题，请刷新后重试。</p>
      </div>
    </div>
  `
}

window.addEventListener('error', (event) => {
  console.error(event.error || event.message || event)
  setAppError()
})

window.addEventListener('unhandledrejection', (event) => {
  console.error(event.reason)
  setAppError()
})

try {
  const app = createApp(App)
  app.config.errorHandler = (error) => {
    console.error(error)
    setAppError()
  }
  app.mount('#app')
} catch (error) {
  console.error(error)
  setAppError()
  renderFatalError()
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
      setPwaUpdated()
      window.location.reload()
    })

    navigator.serviceWorker
      .register('/service-worker.js', { updateViaCache: 'none' })
      .then(async (registration) => {
        registerPwaRegistration(registration)

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
