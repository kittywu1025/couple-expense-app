<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import BottomSheet from './BottomSheet.vue'
import type { Category } from '../utils/categories'

defineProps<{ open: boolean; category: Category | null; selectedSub: string | null }>()
const emit = defineEmits<{
  close: []
  pickSub: [name: string]
  addSub: []
  deleteSub: [name: string]
  deleteCategory: []
}>()

// 长按子分类删除；长按触发后松手的那次 click 不算选择
let timer: ReturnType<typeof setTimeout> | undefined
let longPressed = false
const startPress = (name: string) => {
  longPressed = false
  clearTimeout(timer)
  timer = setTimeout(() => {
    longPressed = true
    navigator.vibrate?.(20)
    emit('deleteSub', name)
  }, 550)
}
const cancelPress = () => clearTimeout(timer)
const onSubClick = (name: string) => {
  if (longPressed) {
    longPressed = false
    return
  }
  emit('pickSub', name)
}
</script>

<template>
  <BottomSheet :open="open" @close="emit('close')">
    <template v-if="category">
      <header class="head">
        <span class="icon" :style="{ background: category.color, color: '#fff' }">
          <AppIcon :name="category.icon" :size="24" :stroke="2" />
        </span>
        <div class="title">
          <h3>{{ category.name }}</h3>
          <p>自定义分类 · {{ category.subs.length }} 个子分类</p>
        </div>
        <button class="delete-cat" @click="emit('deleteCategory')">删除大类</button>
      </header>

      <div class="subs">
        <button
          v-for="s in category.subs"
          :key="s.name"
          :class="['sub', { on: s.name === selectedSub }]"
          :style="s.name === selectedSub ? { background: category.color + '22' } : undefined"
          @click="onSubClick(s.name)"
          @pointerdown="startPress(s.name)"
          @pointerup="cancelPress"
          @pointerleave="cancelPress"
          @pointercancel="cancelPress"
          @contextmenu.prevent
        >
          <span class="sub-icon" :style="{ color: category.color }"><AppIcon :name="s.icon" :size="22" /></span>
          <span class="sub-name">{{ s.name }}</span>
        </button>
        <button class="sub add" @click="emit('addSub')">
          <span class="sub-icon"><AppIcon name="plus" :size="20" :stroke="2" /></span>
          <span class="sub-name">添加子分类</span>
        </button>
      </div>
      <p class="tip">点子分类直接用来记账，长按子分类可删除</p>
    </template>
  </BottomSheet>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
}
.title {
  flex: 1;
  min-width: 0;
}
.title h3 {
  margin: 0;
  font-size: 17px;
}
.title p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-faint);
}
.delete-cat {
  align-self: flex-start;
  font-size: 13px;
  color: var(--danger);
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 59, 48, 0.08);
}
.subs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.sub {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 2px;
  border-radius: 12px;
  background: var(--bg);
  font-size: 12px;
  color: var(--text-soft);
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.12s;
}
.sub:active {
  transform: scale(0.95);
}
.sub.on {
  color: var(--text);
  font-weight: 600;
}
.sub.add {
  background: transparent;
  border: 1.5px dashed #d1d1d6;
  color: var(--text-faint);
}
.sub-icon {
  height: 24px;
  display: grid;
  place-items: center;
}
.sub-name {
  line-height: 1.3;
  text-align: center;
}
.tip {
  margin: 14px 0 0;
  text-align: center;
  font-size: 11px;
  color: var(--text-faint);
}
</style>
