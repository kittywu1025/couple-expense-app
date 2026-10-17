<script setup lang="ts">
import { computed, ref } from 'vue'
import RecordDetailSheet from './RecordDetailSheet.vue'
import CategoryIcon from './CategoryIcon.vue'
import type { LedgerRecord } from '../types'
import { recordColor, recordIcon } from '../utils/categories'
import { formatDateLabel, formatMoney, formatWeekday } from '../utils/format'
import { isTreat, shareOf, treaterOf } from '../utils/settlement'
import { useBooks } from '../composables/useBooks'

const props = defineProps<{ records: LedgerRecord[] }>()

const { myUid, otherUid } = useBooks()
const selectedId = ref<string | null>(null)
const selected = computed(() => props.records.find((r) => r.id === selectedId.value) ?? null)

const groups = computed(() => {
  const map = new Map<string, LedgerRecord[]>()
  for (const r of props.records) {
    if (!map.has(r.date)) map.set(r.date, [])
    map.get(r.date)!.push(r)
  }
  return [...map.entries()].map(([date, items]) => ({
    date,
    items,
    expense: items.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0),
    income: items.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0),
  }))
})

const tag = (r: LedgerRecord) => {
  if (r.type === 'personal') return { text: '个人', cls: 'personal' }
  if (isTreat(r)) {
    const mine = treaterOf(r, otherUid) === myUid.value
    return { text: mine ? '我请客' : 'TA请客', cls: 'treat' }
  }
  const s = shareOf(r, myUid.value)
  return { text: s === 5 ? 'AA' : `AA ${s}:${10 - s}`, cls: 'shared' }
}
</script>

<template>
  <div v-for="g in groups" :key="g.date" class="group">
    <div class="group-head">
      <span class="day">{{ formatDateLabel(g.date) }}<small>{{ formatWeekday(g.date) }}</small></span>
      <span class="sum mono">
        <template v-if="g.income">收 {{ formatMoney(g.income) }}　</template>
        <template v-if="g.expense">支 {{ formatMoney(g.expense) }}</template>
      </span>
    </div>
    <div class="card">
      <button
        v-for="r in g.items"
        :key="r.id"
        class="row"
        @click="selectedId = r.id"
      >
        <CategoryIcon :name="recordIcon(r.category, r.subCategory)" :color="recordColor(r.category)" :size="38" />
        <span class="info">
          <span class="line">
            <span class="name">{{ r.subCategory || r.category }}</span>
            <span :class="['amount', 'mono', { income: r.kind === 'income' }]">
              {{ r.kind === 'income' ? '+' : '-' }}{{ formatMoney(r.amount) }}
            </span>
          </span>
          <span class="line meta">
            <span class="sub">
              <i :class="['dot', r.payerUid === myUid ? 'me' : 'partner']" />
              <span v-if="r.note" class="note">{{ r.note }}</span>
            </span>
            <span :class="['tag', tag(r).cls]">{{ tag(r).text }}</span>
          </span>
        </span>
      </button>
    </div>
  </div>

  <RecordDetailSheet :record="selected" @close="selectedId = null" />
</template>

<style scoped>
.group {
  margin-bottom: 14px;
}
.group-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0 4px 6px;
  font-size: 12px;
  color: var(--text-soft);
}
.day {
  font-weight: 600;
  color: var(--text);
  font-size: 13px;
}
.day small {
  margin-left: 6px;
  font-weight: 400;
  color: var(--text-faint);
}
.sum {
  font-size: 11px;
  color: var(--text-faint);
}
.card {
  background: var(--card);
  border-radius: var(--radius);
  overflow: hidden;
}
.row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  text-align: left;
  position: relative;
  transition: background 0.15s;
}
.row + .row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 64px;
  right: 0;
  border-top: 1px solid var(--line);
}
.row:active {
  background: #f2f2f5;
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
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
  font-size: 15px;
  white-space: nowrap;
  color: var(--expense);
}
.amount.income {
  color: var(--income);
}
.meta {
  font-size: 12px;
  color: var(--text-faint);
}
.sub {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.note {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dot {
  width: 7px;
  height: 7px;
  flex-shrink: 0;
  border-radius: 50%;
}
.dot.me {
  background: var(--me);
}
.dot.partner {
  background: var(--partner);
}
.tag {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-soft);
}
.tag.shared {
  background: var(--primary-soft);
  color: var(--primary);
}
.tag.treat {
  background: rgba(255, 143, 171, 0.22);
  color: #e0607f;
}
.mono {
  font-family: var(--mono);
}
</style>
