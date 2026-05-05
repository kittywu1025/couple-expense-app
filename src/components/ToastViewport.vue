<script setup lang="ts">
import { dismissToast, useToast, type ToastAction, type ToastItem } from '../composables/useToast'

const { toasts } = useToast()

const handleAction = async (toastItem: ToastItem, action: ToastAction) => {
  await action.onClick()
  if (toastItem.dismissible) {
    dismissToast(toastItem.id)
  }
}
</script>

<template>
  <div class="toast-viewport" aria-live="polite" aria-atomic="true">
    <transition-group name="toast" tag="div" class="toast-stack">
      <section
        v-for="toastItem in toasts"
        :key="toastItem.id"
        :class="['toast-card', `toast-${toastItem.type}`]"
        role="status"
      >
        <div class="toast-body">
          <div class="toast-copy">
            <strong v-if="toastItem.title" class="toast-title">{{ toastItem.title }}</strong>
            <p class="toast-message">{{ toastItem.message }}</p>
          </div>

          <button
            v-if="toastItem.dismissible"
            type="button"
            class="toast-close"
            aria-label="关闭提示"
            @click="dismissToast(toastItem.id)"
          >
            ×
          </button>
        </div>

        <div v-if="toastItem.actions.length" class="toast-actions">
          <button
            v-for="action in toastItem.actions"
            :key="action.label"
            type="button"
            :class="['toast-action-button', action.kind || 'secondary']"
            :disabled="action.disabled"
            @click="handleAction(toastItem, action)"
          >
            {{ action.label }}
          </button>
        </div>
      </section>
    </transition-group>
  </div>
</template>
