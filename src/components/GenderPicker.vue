<script setup lang="ts">
import type { Gender } from '../types'

defineProps<{ modelValue: Gender | null; compact?: boolean }>()
defineEmits<{ 'update:modelValue': [Gender] }>()

const options: { value: Gender; label: string }[] = [
  { value: 'female', label: '女生' },
  { value: 'male', label: '男生' },
]
</script>

<template>
  <div :class="['picker', { compact }]" role="radiogroup" aria-label="性别">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="radio"
      :aria-checked="modelValue === o.value"
      :class="['opt', o.value, { on: modelValue === o.value }]"
      @click="$emit('update:modelValue', o.value)"
    >
      <i class="swatch" />{{ o.label }}
    </button>
  </div>
</template>

<style scoped>
.picker {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.picker.compact {
  display: flex;
  gap: 6px;
}
.opt {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 44px;
  border-radius: 12px;
  border: 1.5px solid var(--line);
  background: var(--card);
  color: var(--text-soft);
  font-size: 14px;
  transition: all 0.15s;
}
.compact .opt {
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 13px;
}
.opt:active {
  transform: scale(0.97);
}
.swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.female .swatch {
  background: #ff8fab;
}
.male .swatch {
  background: #74c0fc;
}
.female.on {
  border-color: #ff8fab;
  background: #fff0f3;
  color: #d9577a;
  font-weight: 600;
}
.male.on {
  border-color: #74c0fc;
  background: #eff8ff;
  color: #2f86c9;
  font-weight: 600;
}
</style>
