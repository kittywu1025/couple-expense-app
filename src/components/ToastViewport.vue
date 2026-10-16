<script setup lang="ts">
import { dismissToast, useToast, type ToastAction, type ToastItem } from '../composables/useToast'

const { toasts } = useToast()

const handleAction = async (toastItem: ToastItem, action: ToastAction) => {
  await action.onClick()
  if (toastItem.dismissible) dismissToast(toastItem.id)
}
</script>

<template>
  <div class="viewport" aria-live="polite">
    <transition-group name="toast" tag="div" class="stack">
      <section v-for="item in toasts" :key="item.id" :class="['toast', item.type]" role="status">
        <div class="body">
          <div>
            <strong v-if="item.title" class="title">{{ item.title }}</strong>
            <p class="message">{{ item.message }}</p>
          </div>
          <button v-if="item.dismissible" class="close" aria-label="关闭提示" @click="dismissToast(item.id)">×</button>
        </div>
        <div v-if="item.actions.length" class="actions">
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
  z-index: 1000;
  pointer-events: none;
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
.toast.success { border-left-color: #34c759; }
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
.action.primary {
  background: var(--primary);
  color: #fff;
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
