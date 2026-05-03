<script setup lang="ts">
defineProps<{
  tabs: Array<{ key: string; label: string; icon: string }>
  activeTab: string
}>()

const emit = defineEmits<{
  (e: 'change', tab: string): void
}>()
</script>

<template>
  <nav class="tab-bar" aria-label="主导航">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      :class="['tab-button', { active: activeTab === tab.key }]"
      type="button"
      @click="emit('change', tab.key)"
    >
      <span class="tab-icon">{{ tab.icon }}</span>
      <span class="tab-label">{{ tab.label }}</span>
    </button>
  </nav>
</template>
