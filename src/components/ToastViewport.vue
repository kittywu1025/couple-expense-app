<script setup lang="ts">
import { computed } from 'vue'
import { dismissToast, useToast, type ToastAction, type ToastItem } from '../composables/useToast'

const { toasts } = useToast()
const groups = computed(() => [
  ['top', toasts.value.filter((t) => t.placement !== 'bottom')],
  ['bottom', toasts.value.filter((t) => t.placement === 'bottom')],
] as const)

const handleAction = async (toastItem: ToastItem, action: ToastAction) => {
  await action.onClick()
  if (toastItem.dismissible) dismissToast(toastItem.id)
}
</script>

<template>
  <!-- 普通提示在上方；带「撤销」的在下方，手指够得着 -->
  <div v-for="[place, list] in groups" :key="place" :class="['viewport', place]" aria-live="polite">
    <transition-group :name="`toast-${place}`" tag="div" class="stack">
      <section v-for="item in list" :key="item.id" :class="['toast', item.type]" role="status">
        <div class="body">
          <div>
            <strong v-if="item.title" class="title">{{ item.title }}</strong>
            <p class="message">{{ item.message }}</p>
          </div>
          <!-- 只有一个按钮（比如「撤销」）就放在同一行，像系统的提示条 -->
          <button
            v-if="item.actions.length === 1"
            :class="['action', 'inline', item.actions[0].kind || 'secondary']"
            :disabled="item.actions[0].disabled"
            @click="handleAction(item, item.actions[0])"
          >
            {{ item.actions[0].label }}
          </button>
          <button v-else-if="item.dismissible" class="close" aria-label="关闭提示" @click="dismissToast(item.id)">×</button>
        </div>
        <div v-if="item.actions.length > 1" class="actions">
          <button
            v-for="action in item.actions"
            :key="action.label"
            :class="['action', action.kind || 'secondary']"
            :disabled="action.disabled"
            @click="handleAction(item, action)"
          >
            {{ action.label }}
          </button>
        </div>
      </section>
    </transition-group>
  </div>
</template>

<style scoped>
.viewport {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top, 0px));
  left: 50%;
  transform: translateX(-50%);
  width: min(calc(100% - 24px), 440px);
  z-index: 100000; /* 永远在弹窗上面（弹窗按打开顺序递增） */
  pointer-events: none;
}
/* 下方：让开底部导航栏、记账的 + 按钮和结清页的操作条 */
.viewport.bottom {
  top: auto;
  bottom: calc(144px + env(safe-area-inset-bottom, 0px));
}
.stack {
  display: grid;
  gap: 8px;
}
.toast {
  pointer-events: auto;
  background: rgba(255, 255, 255, 0.97);
  border-radius: 14px;
  padding: 12px 14px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  border-left: 4px solid var(--primary);
}
.toast.success { border-left-color: var(--success); }
.toast.error { border-left-color: var(--danger); }
.toast.warning { border-left-color: #ff9f0a; }
.body {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.title {
  display: block;
  font-size: 14px;
}
.message {
  margin: 0;
  font-size: 14px;
  color: var(--text-soft);
}
.close {
  font-size: 20px;
  line-height: 1;
  color: var(--text-faint);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.action {
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  background: var(--bg);
}
.action.inline {
  flex-shrink: 0;
  align-self: center;
}
.action.primary {
  background: var(--primary);
  color: #fff;
}
.toast-top-enter-active,
.toast-top-leave-active,
.toast-bottom-enter-active,
.toast-bottom-leave-active {
  transition: all 0.2s ease;
}
.toast-top-enter-from,
.toast-top-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.toast-bottom-enter-from,
.toast-bottom-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
