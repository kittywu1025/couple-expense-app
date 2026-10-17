<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import CategoryIcon from '../components/CategoryIcon.vue'
import EmptyState from '../components/EmptyState.vue'
import FixedExpenseEditorSheet from '../components/FixedExpenseEditorSheet.vue'
import { nextDueDate, useFixedExpenses } from '../composables/useFixedExpenses'
import { useBooks } from '../composables/useBooks'
import { closeFixedPage, confirmAction } from '../composables/useUi'
import { toast } from '../composables/useToast'
import type { FixedExpense, FixedExpenseInput } from '../types'
import { recordColor, recordIcon } from '../utils/categories'
import { formatDateLabel, formatMoney } from '../utils/format'

const { items, add, update, setPaused, remove, generateDue } = useFixedExpenses()
const { myUid, nameOf } = useBooks()

const editorOpen = ref(false)
const editing = ref<FixedExpense | null>(null)
const saving = ref(false)

const sorted = computed(() => [...items.value].sort((a, b) => Number(a.paused) - Number(b.paused) || a.dayOfMonth - b.dayOfMonth))
const monthlyTotal = computed(() => items.value.filter((f) => !f.paused).reduce((s, f) => s + f.amount, 0))

const typeText = (f: FixedExpense) => {
  if (f.type === 'personal') return '个人'
  const mine = f.payerUid === myUid.value ? f.ratio : 10 - f.ratio
  if (mine === 10 || mine === 0) return '请客'
  return mine === 5 ? '共同 · 平摊' : `共同 · ${mine}:${10 - mine}`
}

const openNew = () => {
  editing.value = null
  editorOpen.value = true
}
const openEdit = (f: FixedExpense) => {
  editing.value = f
  editorOpen.value = true
}

const onSave = async (input: FixedExpenseInput) => {
  saving.value = true
  const { error } = editing.value ? await update(editing.value.id, input) : await add(input)
  saving.value = false
  if (error) {
    toast.error(error.message)
    return
  }
  editorOpen.value = false
  toast.success(editing.value ? '已保存' : `已添加「${input.name}」`)
  // 新加的如果今天就是扣款日，马上生成
  const count = await generateDue()
  if (count) toast.success(`已自动记入 ${count} 笔固定扣款`)
}

const onDelete = async () => {
  const f = editing.value
  if (!f) return
  const ok = await confirmAction({
    title: `删除「${f.name}」？`,
    message: '以后不会再自动记账。已经生成的账单不会被删除。',
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  const { error } = await remove(f.id)
  if (error) {
    toast.error(error.message)
    return
  }
  editorOpen.value = false
  toast.success('已删除')
}

const togglePause = async (f: FixedExpense) => {
  const { error } = await setPaused(f.id, !f.paused)
  if (error) toast.error(error.message)
  else toast.success(f.paused ? `已恢复「${f.name}」，从今天起继续自动记账` : `已暂停「${f.name}」`)
}
</script>

<template>
  <div class="page">
    <header class="nav">
      <button class="back" aria-label="返回" @click="closeFixedPage">
        <AppIcon name="chevronLeft" :size="22" :stroke="2.2" />我的
      </button>
      <h1>固定扣款</h1>
      <button class="add" aria-label="添加固定扣款" @click="openNew"><AppIcon name="plus" :size="22" :stroke="2.2" /></button>
    </header>

    <div class="body">
      <section v-if="items.length" class="summary">
        <span>每月固定支出</span>
        <b class="mono">{{ formatMoney(monthlyTotal) }}</b>
        <small>到扣款日自动记一笔账，打开 App 时检查</small>
      </section>

      <section v-if="!items.length" class="empty">
        <EmptyState
          icon="calendar"
          title="还没有固定扣款"
          desc="房租、话费这类每月固定的支出，设置一次就会按日期自动记账"
          action="添加固定扣款"
          @action="openNew"
        />
      </section>

      <section v-else class="group">
        <div v-for="f in sorted" :key="f.id" :class="['row', { paused: f.paused }]">
          <button class="main" @click="openEdit(f)">
            <CategoryIcon :name="recordIcon(f.category, f.subCategory)" :color="recordColor(f.category)" :size="40" />
            <span class="info">
              <span class="line">
                <span class="name">{{ f.name }}</span>
                <span class="mono amount">{{ formatMoney(f.amount) }}</span>
              </span>
              <span class="meta">
                <i :class="['dot', f.payerUid === myUid ? 'me' : 'partner']" />
                每月 {{ f.dayOfMonth }} 号 · {{ typeText(f) }} · {{ nameOf(f.payerUid) }}付
              </span>
              <span class="next">{{ f.paused ? '已暂停' : `下次 ${formatDateLabel(nextDueDate(f))}` }}</span>
            </span>
          </button>
          <button
            :class="['switch', { on: !f.paused }]"
            role="switch"
            :aria-checked="!f.paused"
            :aria-label="f.paused ? '恢复' : '暂停'"
            @click="togglePause(f)"
          >
            <span class="knob" />
          </button>
        </div>
      </section>

      <p v-if="items.length" class="tip">右侧开关可以暂停 / 恢复；点条目可以编辑或删除</p>
    </div>

    <FixedExpenseEditorSheet
      :open="editorOpen"
      :item="editing"
      :saving="saving"
      @close="editorOpen = false"
      @save="onSave"
      @delete="onDelete"
    />
  </div>
</template>

<style scoped>
.page {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: var(--bg);
  overflow-y: auto;
}
.nav {
  position: sticky;
  top: 0;
  z-index: 1;
  display: grid;
  grid-template-columns: 80px 1fr 80px;
  align-items: center;
  padding: calc(8px + env(safe-area-inset-top, 0px)) 8px 8px;
  background: rgba(245, 245, 247, 0.9);
  backdrop-filter: blur(16px);
}
.nav h1 {
  margin: 0;
  text-align: center;
  font-size: 17px;
}
.back {
  display: flex;
  align-items: center;
  color: var(--primary);
  font-size: 16px;
  padding: 6px 4px;
}
.add {
  justify-self: end;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: var(--primary);
}
.body {
  max-width: 560px;
  margin: 0 auto;
  padding: 8px 16px calc(32px + env(safe-area-inset-bottom, 0px));
}
.summary {
  display: flex;
  flex-direction: column;
  padding: 16px 18px;
  border-radius: var(--radius);
  background: var(--card);
  margin-bottom: 14px;
}
.summary span {
  font-size: 13px;
  color: var(--text-soft);
}
.summary b {
  font-size: 28px;
  margin: 2px 0;
}
.summary small {
  font-size: 11px;
  color: var(--text-faint);
}
.empty,
.group {
  background: var(--card);
  border-radius: var(--radius);
  overflow: hidden;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 14px;
  position: relative;
  transition: opacity 0.2s;
}
.row + .row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 66px;
  right: 0;
  border-top: 1px solid var(--line);
}
.row.paused .main {
  opacity: 0.45;
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0 12px 14px;
  text-align: left;
}
.main:active {
  opacity: 0.7;
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.name {
  font-weight: 600;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.amount {
  font-weight: 600;
  color: var(--expense);
}
.meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-soft);
}
.next {
  font-size: 11px;
  color: var(--text-faint);
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.dot.me {
  background: var(--me);
}
.dot.partner {
  background: var(--partner);
}
.mono {
  font-family: var(--mono);
}
.switch {
  flex-shrink: 0;
  width: 46px;
  height: 28px;
  border-radius: 999px;
  background: #d1d1d6;
  position: relative;
  transition: background 0.2s;
}
.switch.on {
  background: #34c759;
}
.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s;
}
.switch.on .knob {
  transform: translateX(18px);
}
.tip {
  margin: 10px 4px 0;
  font-size: 11px;
  color: var(--text-faint);
  text-align: center;
}
</style>
