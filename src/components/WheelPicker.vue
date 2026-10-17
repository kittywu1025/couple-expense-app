<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps<{ items: { value: number; label: string }[]; modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [number] }>()

/** 滚轮选择：scroll-snap 对齐，停下后取正中间那一项 */
const ITEM_H = 40
const list = ref<HTMLDivElement | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

const scrollToValue = (value: number, smooth = false) => {
  const i = props.items.findIndex((it) => it.value === value)
  if (i >= 0 && list.value) list.value.scrollTo({ top: i * ITEM_H, behavior: smooth ? 'smooth' : 'auto' })
}

onMounted(() => nextTick(() => scrollToValue(props.modelValue)))
watch(
  () => props.modelValue,
  (v) => {
    const i = props.items.findIndex((it) => it.value === v)
    if (list.value && Math.round(list.value.scrollTop / ITEM_H) !== i) scrollToValue(v, true)
  },
)

const onScroll = () => {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (!list.value) return
    const i = Math.min(props.items.length - 1, Math.max(0, Math.round(list.value.scrollTop / ITEM_H)))
    const value = props.items[i]?.value
    if (value !== undefined && value !== props.modelValue) {
      emit('update:modelValue', value)
      navigator.vibrate?.(4)
    }
  }, 90)
}
</script>

<template>
  <div class="wheel" data-no-sheet-drag>
    <div class="band" aria-hidden="true" />
    <div ref="list" class="list" @scroll="onScroll">
      <button
        v-for="it in items"
        :key="it.value"
        :class="['item', { on: it.value === modelValue }]"
        @click="emit('update:modelValue', it.value)"
      >
        {{ it.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.wheel {
  position: relative;
  height: 200px;
  flex: 1;
}
.band {
  position: absolute;
  left: 4px;
  right: 4px;
  top: 80px;
  height: 40px;
  border-radius: 10px;
  background: var(--bg);
  pointer-events: none;
}
.list {
  position: relative;
  height: 100%;
  overflow-y: auto;
  scroll-snap-type: y mandatory;
  scroll-padding-top: 80px;
  padding: 80px 0;
  scrollbar-width: none;
  -webkit-mask-image: linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent);
  mask-image: linear-gradient(to bottom, transparent, #000 30%, #000 70%, transparent);
}
.list::-webkit-scrollbar {
  display: none;
}
.item {
  display: block;
  width: 100%;
  height: 40px;
  scroll-snap-align: start;
  font-size: 17px;
  color: var(--text-faint);
  transition: color 0.15s, font-size 0.15s;
}
.item.on {
  color: var(--text);
  font-weight: 600;
  font-size: 19px;
}
</style>
