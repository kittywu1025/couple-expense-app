import { onBeforeUnmount, onMounted, watch, type WatchSource } from 'vue'

/**
 * 手机返回键 / 返回手势：每打开一层（二级页、弹窗、记账页）就往浏览器历史里压一条，
 * 按返回时关掉最上面那层，而不是直接退出网页。
 * 点界面上的按钮关掉时，顺手把多压的那条历史退掉，保持两边一致。
 */
interface Layer {
  id: number
  /** 返回 false（或 Promise<false>）表示没关成，比如「放弃修改？」点了取消 */
  close: () => unknown
}

const stack: Layer[] = []
let seq = 0
/** 自己调用 history.back() 引起的 popstate，要跳过的次数 */
let skipPops = 0
/** history.back() 还没生效时又打开了新的一层，等退完再压 */
let pendingPushes = 0

const supported = typeof window !== 'undefined' && typeof history !== 'undefined'

const push = () => {
  try {
    history.pushState({ layer: true }, '')
  } catch {
    // 某些内嵌浏览器不让改历史，那就只能靠界面上的返回
  }
}

if (supported) {
  // 刷新页面后历史里可能还留着上次的层，清掉标记，避免按返回没反应
  if (history.state?.layer) history.replaceState(null, '')
  window.addEventListener('popstate', () => {
    if (skipPops > 0) {
      skipPops--
      if (skipPops === 0) for (; pendingPushes > 0; pendingPushes--) push()
      return
    }
    const top = stack.pop()
    if (!top) return
    Promise.resolve(top.close()).then((ok) => {
      // 没关成：把这一层放回去，下次按返回还能再问
      if (ok === false) reopen(top)
    })
  })
}

const reopen = (layer: Layer) => {
  stack.push(layer)
  if (!supported) return
  if (skipPops > 0) pendingPushes++
  else push()
}

const open = (close: () => unknown) => {
  const id = ++seq
  reopen({ id, close })
  return id
}

/** 界面上关掉的：从栈里拿掉并退一步历史 */
const closed = (id: number) => {
  const i = stack.findIndex((l) => l.id === id)
  if (i < 0) return
  stack.splice(i, 1)
  if (!supported) return
  if (pendingPushes > 0) {
    pendingPushes--
    return
  }
  skipPops++
  history.back()
}

/** 组件挂载即打开（二级页、记账页）：卸载时自动退掉 */
export const useBackLayerWhileMounted = (close: () => unknown) => {
  let id = 0
  onMounted(() => (id = open(close)))
  onBeforeUnmount(() => closed(id))
}

/** 跟着一个开关走（弹窗） */
export const useBackLayer = (isOpen: WatchSource<boolean>, close: () => void) => {
  let id = 0
  watch(
    isOpen,
    (now) => {
      if (now && !id) id = open(close)
      else if (!now && id) {
        closed(id)
        id = 0
      }
    },
    { immediate: true },
  )
  onBeforeUnmount(() => {
    if (id) closed(id)
    id = 0
  })
}
