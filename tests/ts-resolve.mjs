// 让 node 直接跑 src 里的 .ts：import './format' 这种不带扩展名的补上 .ts（Vite 里本来就这么写）
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context)
    } catch (error) {
      if (specifier.startsWith('.') && !/\.[cm]?[jt]s$/.test(specifier)) return next(`${specifier}.ts`, context)
      throw error
    }
  },
})
