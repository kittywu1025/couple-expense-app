<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from '../utils/icons'

defineProps<{ icon: IconName; title: string; desc?: string; action?: string }>()
defineEmits<{ action: [] }>()
</script>

<template>
  <div class="empty">
    <div class="art">
      <span class="ring" />
      <span class="emoji"><AppIcon :name="icon" :size="38" :stroke="1.6" /></span>
    </div>
    <p class="title">{{ title }}</p>
    <p v-if="desc" class="desc">{{ desc }}</p>
    <button v-if="action" class="btn" @click="$emit('action')">{{ action }}</button>
  </div>
</template>

<style scoped>
.empty {
  text-align: center;
  padding: 32px 24px 28px;
}
.art {
  position: relative;
  width: 88px;
  height: 88px;
  margin: 0 auto 14px;
  display: grid;
  place-items: center;
}
.ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle, var(--primary-soft) 0%, rgba(108, 99, 255, 0.04) 70%);
}
.emoji {
  position: relative;
  color: var(--primary);
  animation: float 3s ease-in-out infinite;
}
@keyframes float {
  50% {
    transform: translateY(-5px);
  }
}
.title {
  margin: 0;
  font-weight: 600;
  font-size: 15px;
}
.desc {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-faint);
  line-height: 1.6;
}
.btn {
  margin-top: 16px;
  padding: 10px 24px;
  border-radius: 999px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  box-shadow: 0 6px 16px rgba(108, 99, 255, 0.3);
}
.btn:active {
  transform: scale(0.96);
}
</style>
