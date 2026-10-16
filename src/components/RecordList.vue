<script setup lang="ts">
import { computed } from 'vue'
import type { LedgerRecord } from '../types'
import { recordColor, recordIcon } from '../utils/categories'
import { formatDateLabel, formatMoney } from '../utils/format'
import { isTreat, ratioLabel } from '../utils/settlement'
import { useBooks } from '../composables/useBooks'
import { useRecords } from '../composables/useRecords'
import { toast } from '../composables/useToast'

const props = defineProps<{ records: LedgerRecord[] }>()

const { myUid } = useBooks()
const { deleteRecord } = useRecords()

const groups = computed(() => {
  const map = new Map<string, LedgerRecord[]>()
  for (const r of props.records) {
    if (!map.has(r.date)) map.set(r.date, [])
    map.get(r.date)!.push(r)
  }
  return [...map.entries()].map(([date, items]) => ({
    date,
    items,
    total: items.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0),
  }))
})

const tagClass = (r: LedgerRecord) => (r.type === 'personal' ? 'personal' : isTreat(r) ? 'treat' : 'shared')

const onTap = async (r: LedgerRecord) => {
  const title = r.subCategory || r.category
  if (!window.confirm(`删除这笔「${title} ${formatMoney(r.amount)}」？`)) return
  const { error } = await deleteRecord(r.id)
  if (error) toast.error(error.message)
  else toast.success('已删除')
}
</script>

<template>
  <div v-if="!records.length" class="empty">
    <div class="empty-icon">🧾</div>
    还没有账单，点右下角 ＋ 记一笔
  </div>
  <div v-for="g in groups" :key="g.date" class="group">
    <div class="group-head">
      <span>{{ formatDateLabel(g.date) }}</span>
      <span v-if="g.total" class="mono">支出 {{ formatMoney(g.total) }}</span>
    </div>
    <div class="card">
      <button v-for="r in g.items" :key="r.id" class="row" @click="onTap(r)">
        <span class="icon" :style="{ background: recordColor(r.category) + '33' }">
          {{ recordIcon(r.category, r.subCategory) }}
        </span>
        <span class="info">
          <span class="name">
            {{ r.subCategory || r.category }}
            <i class="dot" :class="r.payerUid === myUid ? 'me' : 'partner'" />
          </span>
          <span v-if="r.note" class="note">{{ r.note }}</span>
        </span>
        <span class="right">
          <span :class="['amount', 'mono', { income: r.kind === 'income' }]">
            {{ r.kind === 'income' ? '+' : '-' }}{{ formatMoney(r.amount) }}
          </span>
          <span :class="['tag', tagClass(r)]">{{ ratioLabel(r, myUid) }}</span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.empty {
  text-align: center;
  color: var(--text-faint);
  padding: 40px 0;
  font-size: 14px;
}
.empty-icon {
  font-size: 40px;
  margin-bottom: 8px;
}
.group {
  margin-bottom: 14px;
}
.group-head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-soft);
  padding: 0 4px 6px;
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
  padding: 12px 14px;
  text-align: left;
}
.row + .row {
  border-top: 1px solid var(--line);
}
.row:active {
  background: var(--bg);
}
.icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 20px;
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.name {
  font-weight: 600;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot.me {
  background: var(--me);
}
.dot.partner {
  background: var(--partner);
}
.note {
  font-size: 12px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}
.amount {
  font-weight: 600;
  font-size: 15px;
}
.amount.income {
  color: #34c759;
}
.tag {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--bg);
  color: var(--text-soft);
}
.tag.shared {
  background: var(--primary-soft);
  color: var(--primary);
}
.tag.treat {
  background: rgba(255, 143, 171, 0.18);
  color: #e0607f;
}
.mono {
  font-family: var(--mono);
}
</style>
