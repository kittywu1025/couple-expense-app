<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import BottomSheet from './BottomSheet.vue'
import type { IconName } from '../utils/icons'
import { CATEGORY_COLOR_CHOICES, CATEGORY_ICON_CHOICES } from '../utils/categories'

const props = defineProps<{
  open: boolean
  /** category = 新建大类（可选颜色）；sub = 给大类加子分类 */
  mode: 'category' | 'sub'
  /** sub 模式下用大类的颜色预览 */
  color?: string
  parentName?: string
  /** 返回错误文字表示名字不可用 */
  validateName: (name: string) => string
  saving?: boolean
}>()
const emit = defineEmits<{ close: []; save: [{ name: string; icon: IconName; color: string }] }>()

const NAME_MAX = 8
const name = ref('')
const icon = ref<IconName>('sparkles')
const color = ref(CATEGORY_COLOR_CHOICES[0])
const touched = ref(false)
const input = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    name.value = ''
    icon.value = props.mode === 'sub' ? 'sparkles' : 'bag'
    color.value = props.color ?? CATEGORY_COLOR_CHOICES[Math.floor(Math.random() * CATEGORY_COLOR_CHOICES.length)]
    touched.value = false
    await nextTick()
    setTimeout(() => input.value?.focus(), 280)
  },
)

const previewColor = computed(() => (props.mode === 'sub' ? (props.color ?? color.value) : color.value))
const error = computed(() => {
  const v = name.value.trim()
  if (!v) return '请输入名称'
  if (v.length > NAME_MAX) return `最多 ${NAME_MAX} 个字`
  return props.validateName(v)
})

const submit = () => {
  touched.value = true
  if (error.value || props.saving) return
  emit('save', { name: name.value.trim(), icon: icon.value, color: previewColor.value })
}
</script>

<template>
  <BottomSheet :open="open" @close="emit('close')">
    <h3 class="title">{{ mode === 'sub' ? `给「${parentName}」添加子分类` : '新建分类' }}</h3>

    <div class="preview">
      <span class="preview-icon" :style="{ background: previewColor, color: '#fff' }">
        <AppIcon :name="icon" :size="26" :stroke="2" />
      </span>
      <div class="field">
        <input
          ref="input"
          v-model="name"
          :maxlength="NAME_MAX + 4"
          :placeholder="mode === 'sub' ? '子分类名称' : '分类名称'"
          enterkeyhint="done"
          @keyup.enter="submit"
        />
        <p :class="['meta', { err: touched || name.length > 0 }]">
          <span>{{ (touched || name.length > 0) && error ? error : '' }}</span>
          <span>{{ name.trim().length }}/{{ NAME_MAX }}</span>
        </p>
      </div>
    </div>

    <p class="label">图标</p>
    <div class="icons">
      <button
        v-for="i in CATEGORY_ICON_CHOICES"
        :key="i"
        :class="['icon', { on: icon === i }]"
        :style="icon === i ? { background: previewColor, color: '#fff' } : { color: previewColor }"
        :aria-label="i"
        @click="icon = i"
      >
        <AppIcon :name="i" :size="20" />
      </button>
    </div>

    <template v-if="mode === 'category'">
      <p class="label">颜色</p>
      <div class="colors">
        <button
          v-for="c in CATEGORY_COLOR_CHOICES"
          :key="c"
          :class="['color', { on: color === c }]"
          :style="{ '--c': c }"
          :aria-label="c"
          @click="color = c"
        >
          <AppIcon v-if="color === c" name="check" :size="14" :stroke="3" />
        </button>
      </div>
    </template>

    <button class="save" :disabled="saving" @click="submit">{{ saving ? '保存中…' : '保存' }}</button>
  </BottomSheet>
</template>

<style scoped>
.title {
  margin: 0 0 14px;
  text-align: center;
  font-size: 16px;
}
.preview {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.preview-icon {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  transition: background 0.15s;
}
.field {
  flex: 1;
}
.field input {
  width: 100%;
  height: 48px;
  border-radius: 12px;
  border: 1.5px solid transparent;
  background: var(--bg);
  padding: 0 14px;
  font-size: 16px;
  outline: none;
}
.field input:focus {
  border-color: var(--primary);
}
.meta {
  display: flex;
  justify-content: space-between;
  margin: 4px 2px 0;
  font-size: 11px;
  color: var(--text-faint);
}
.meta.err span:first-child {
  color: var(--danger);
}
.label {
  margin: 14px 0 8px;
  font-size: 12px;
  color: var(--text-soft);
}
.icons {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
  max-height: 168px;
  overflow-y: auto;
}
.icon {
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--bg);
  display: grid;
  place-items: center;
  transition: transform 0.1s;
}
.icon:active,
.color:active {
  transform: scale(0.9);
}
.colors {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 6px;
}
.color {
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--c);
  color: #fff;
  display: grid;
  place-items: center;
}
.color.on {
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--c);
}
.save {
  width: 100%;
  height: 48px;
  margin-top: 18px;
  border-radius: 14px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  font-size: 16px;
}
.save:disabled {
  opacity: 0.6;
}
</style>
