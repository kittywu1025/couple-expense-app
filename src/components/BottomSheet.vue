<script setup lang="ts">
defineProps<{ open: boolean }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <transition name="fade">
      <div v-if="open" class="backdrop" @click="$emit('close')" />
    </transition>
    <transition name="sheet">
      <div v-if="open" class="sheet" role="dialog" aria-modal="true">
        <div class="grabber" />
        <slot />
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  z-index: 300;
}
.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  max-width: 560px;
  margin: 0 auto;
  max-height: 86vh;
  overflow-y: auto;
  background: var(--card);
  border-radius: 20px 20px 0 0;
  padding: 8px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  z-index: 301;
}
.grabber {
  width: 36px;
  height: 5px;
  border-radius: 999px;
  background: #e0e0e5;
  margin: 0 auto 12px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.sheet-enter-active,
.sheet-leave-active {
  transition: transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%);
}
</style>
