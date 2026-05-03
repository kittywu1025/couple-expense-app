import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const appVersion = `${process.env.npm_package_version ?? '0.0.0'}-${Date.now()}`

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
})
