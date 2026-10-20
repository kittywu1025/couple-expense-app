<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import CategoryEditorSheet from '../components/CategoryEditorSheet.vue'
import CategoryIcon from '../components/CategoryIcon.vue'
import PushPage from '../components/PushPage.vue'
import { useBooks } from '../composables/useBooks'
import { AMOUNT_COLOR_OPTIONS, amountColorsPref } from '../composables/usePrefs'
import { toast } from '../composables/useToast'
import { bookSettingsOpen, confirmAction } from '../composables/useUi'
import type { CustomCategory, RecordKind } from '../types'
import { isCategoryNameTaken } from '../utils/categories'
import { CURRENCIES, isCurrencyCode } from '../utils/currency'
import type { IconName } from '../utils/icons'

const { currentBook, updateBookSettings, bookActionLoading } = useBooks()

const settleDays = Array.from({ length: 28 }, (_, i) => i + 1)

const onSettleDay = async (e: Event) => {
  const { error } = await updateBookSettings({ settleDay: Number((e.target as HTMLSelectElement).value) })
  if (error) toast.error(error.message)
  else toast.success('结算日已更新，统计会按新周期计算')
}

const changeRatio = async (delta: number) => {
  if (!currentBook.value) return
  const next = Math.min(10, Math.max(0, currentBook.value.defaultRatio + delta))
  if (next === currentBook.value.defaultRatio) return
  const { error } = await updateBookSettings({ defaultRatio: next })
  if (error) toast.error(error.message)
}

const onCurrency = async (e: Event) => {
  const code = (e.target as HTMLSelectElement).value
  if (!isCurrencyCode(code)) return
  const { error } = await updateBookSettings({ currency: code })
  if (error) toast.error(error.message)
  else toast.success('货币已切换')
}

// ── 自定义分类 ──
const custom = computed(() => currentBook.value?.customCategories ?? [])
const kindLabel = (k: RecordKind) => (k === 'income' ? '收入' : '支出')
const editorOpen = ref(false)
const editorKind = ref<RecordKind>('expense')
const saving = ref(false)

const saveList = async (list: CustomCategory[]) => {
  saving.value = true
  const { error } = await updateBookSettings({ customCategories: list })
  saving.value = false
  if (error) toast.error(error.message)
  return !error
}

const openEditor = (kind: RecordKind) => {
  editorKind.value = kind
  editorOpen.value = true
}

const onSave = async ({ name, icon, color }: { name: string; icon: IconName; color: string }) => {
  const list = [...custom.value, { key: `c-${Date.now().toString(36)}`, name, icon, color, kind: editorKind.value, subs: [] }]
  if (!(await saveList(list))) return
  editorOpen.value = false
  toast.success(`已添加「${name}」，记账时可以在分类最后找到`)
}

const onDelete = async (c: CustomCategory) => {
  const ok = await confirmAction({
    title: `删除分类「${c.name}」？`,
    message: `会连同 ${c.subs.length} 个子分类一起删除。已经记过的账单不会被删除。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  if (await saveList(custom.value.filter((x) => x.key !== c.key))) toast.success('已删除')
}
</script>

<template>
  <PushPage title="账本设置" back-label="我的" @back="bookSettingsOpen = false">
    <p class="note">账本设置两个人共用，改了对方那边也会变</p>
    <section class="group">
      <label class="row">
        <span class="grow">结算日<small class="hint">每月从这天开始算一个周期</small></span>
        <select :value="currentBook?.settleDay" :disabled="bookActionLoading" @change="onSettleDay">
          <option v-for="d in settleDays" :key="d" :value="d">每月 {{ d }} 日</option>
        </select>
      </label>
      <div class="row">
        <span class="grow">默认 AA 比例<small class="hint">记共同账时滑条的起始位置（我:TA）</small></span>
        <div class="stepper">
          <button :disabled="bookActionLoading" aria-label="减少" @click="changeRatio(-1)"><AppIcon name="minus" :size="16" :stroke="2.2" /></button>
          <span class="mono">{{ currentBook?.defaultRatio }}:{{ 10 - (currentBook?.defaultRatio ?? 5) }}</span>
          <button :disabled="bookActionLoading" aria-label="增加" @click="changeRatio(1)"><AppIcon name="plus" :size="16" :stroke="2.2" /></button>
        </div>
      </div>
      <label class="row">
        <span class="grow">记账货币<small class="hint">只改变显示单位，不会换算已有金额</small></span>
        <select :value="currentBook?.currency" :disabled="bookActionLoading" @change="onCurrency">
          <option v-for="c in CURRENCIES" :key="c.code" :value="c.code">{{ c.symbol }} {{ c.name }}</option>
        </select>
      </label>
    </section>

    <h2 class="section-title">自定义分类</h2>
    <section class="group">
      <div v-for="c in custom" :key="c.key" class="row">
        <CategoryIcon :name="(c.icon as IconName)" :color="c.color" :size="34" />
        <span class="grow">
          {{ c.name }}
          <small class="hint">{{ kindLabel(c.kind) }} · {{ c.subs.length ? c.subs.map((s) => s.name).join('、') : '没有子分类' }}</small>
        </span>
        <button class="del" @click="onDelete(c)">删除</button>
      </div>
      <p v-if="!custom.length" class="empty">还没有自定义分类，默认分类不够用时可以加</p>
      <div class="row add-row">
        <button class="add" @click="openEditor('expense')"><AppIcon name="plus" :size="16" :stroke="2.2" />支出分类</button>
        <button class="add" @click="openEditor('income')"><AppIcon name="plus" :size="16" :stroke="2.2" />收入分类</button>
      </div>
    </section>
    <p class="note">子分类可以在记账页点开自定义大类后添加；默认分类不能删除</p>

    <h2 class="section-title">显示 <small>只对这台手机生效</small></h2>
    <section class="group">
      <label class="row">
        <span class="grow">
          金额颜色
          <small class="hint">
            <i class="swatch" style="background: var(--expense)" />支出
            <i class="swatch" style="background: var(--income)" />收入
          </small>
        </span>
        <select v-model="amountColorsPref">
          <option v-for="o in AMOUNT_COLOR_OPTIONS" :key="o.key" :value="o.key">{{ o.label }}</option>
        </select>
      </label>
    </section>

    <CategoryEditorSheet
      :open="editorOpen"
      mode="category"
      :validate-name="(n) => (isCategoryNameTaken(n) ? '已经有同名分类了' : '')"
      :saving="saving"
      @close="editorOpen = false"
      @save="onSave"
    />
  </PushPage>
</template>

<style scoped>
.note {
  margin: 4px 6px 10px;
  font-size: 12px;
  color: var(--text-faint);
}
.section-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-soft);
  margin: 22px 6px 8px;
}
.section-title small {
  color: var(--text-faint);
  font-weight: 400;
}
.group {
  background: var(--card);
  border-radius: var(--radius);
  overflow: hidden;
}
.row {
  min-height: 54px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  font-size: 15px;
  position: relative;
}
.row + .row::before,
.empty + .row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 16px;
  right: 0;
  border-top: 1px solid var(--line);
}
.grow {
  flex: 1;
  min-width: 0;
}
.hint {
  display: block;
  font-size: 11px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
select {
  border: none;
  background: var(--bg);
  border-radius: 8px;
  padding: 6px 10px;
  font: inherit;
  font-size: 14px;
  color: var(--primary);
  max-width: 50%;
}
.stepper {
  display: flex;
  align-items: center;
  gap: 10px;
}
.stepper button {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
  display: grid;
  place-items: center;
}
.stepper button:disabled {
  opacity: 0.5;
}
.mono {
  font-family: var(--mono);
}
.del {
  font-size: 13px;
  color: var(--danger);
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 59, 48, 0.08);
}
.empty {
  margin: 0;
  padding: 16px;
  font-size: 13px;
  color: var(--text-faint);
  text-align: center;
}
.add-row {
  gap: 10px;
}
.add {
  flex: 1;
  height: 36px;
  border-radius: 10px;
  border: 1.5px dashed #d1d1d6;
  color: var(--primary);
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin: 0 3px 0 6px;
}
.swatch:first-child {
  margin-left: 0;
}
</style>
