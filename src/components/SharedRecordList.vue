<script setup lang="ts">
import { computed } from 'vue'
import CategoryIcon from './CategoryIcon.vue'
import type { LedgerRecord } from '../types'
import { useBooks } from '../composables/useBooks'
import { recordColor, recordIcon } from '../utils/categories'
import { formatDateLabel, formatMoney } from '../utils/format'
import { isTreat, shareOf, treaterOf } from '../utils/settlement'
import { owedBy } from '../utils/stats'

/** 共同消费清单：日期、分类、金额、付款人、AA 比例、两人各自承担多少 */
const props = defineProps<{ records: LedgerRecord[] }>()

const { myUid, partner, nameOf, otherUid } = useBooks()
const partnerUid = computed(() => partner.value?.userId ?? '')
const partnerName = computed(() => partner.value?.displayName ?? 'TA')

const shared = computed(() =>
  props.records
    .filter((r) => r.kind === 'expense' && r.type === 'shared')
    .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date))),
)

const ratioText = (r: LedgerRecord) => {
  if (isTreat(r)) return `${treaterOf(r, otherUid) === myUid.value ? '我' : partnerName.value}请客`
  const mine = shareOf(r, myUid.value)
  return mine === 5 ? '平摊' : `${mine}:${10 - mine}`
}
</script>

<template>
  <p v-if="!shared.length" class="none">这段时间还没有一起花的钱</p>
  <div v-for="r in shared" :key="r.id" class="item">
    <CategoryIcon :name="recordIcon(r.category, r.subCategory)" :color="recordColor(r.category)" :size="36" />
    <div class="info">
      <div class="line">
        <span class="name">{{ r.subCategory || r.category }}</span>
        <span class="mono amount">{{ formatMoney(r.amount) }}</span>
      </div>
      <div class="meta">
        <span>{{ formatDateLabel(r.date) }}</span>
        <span class="payer"><i :class="['dot', r.payerUid === myUid ? 'me' : 'partner']" />{{ nameOf(r.payerUid) }}付</span>
        <span :class="['tag', { treat: isTreat(r) }]">{{ ratioText(r) }}</span>
      </div>
      <div v-if="!isTreat(r)" class="owed">
        <span><i class="dot me" />{{ nameOf(myUid) }} {{ formatMoney(owedBy(r, myUid)) }}</span>
        <span><i class="dot partner" />{{ partnerName }} {{ formatMoney(owedBy(r, partnerUid)) }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.none {
  margin: 0;
  padding: 16px 0 6px;
  text-align: center;
  font-size: 13px;
  color: var(--text-faint);
}
.item {
  display: flex;
  gap: 10px;
  padding: 10px 0;
  position: relative;
}
.item + .item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 46px;
  right: 0;
  border-top: 1px solid var(--line);
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
  gap: 8px;
}
.name {
  font-weight: 600;
  font-size: 14px;
}
.amount {
  font-weight: 600;
  color: var(--expense);
}
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-faint);
}
.payer {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-soft);
}
.tag {
  margin-left: auto;
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary);
}
.tag.treat {
  background: rgba(255, 143, 171, 0.22);
  color: #e0607f;
}
.owed {
  display: flex;
  gap: 14px;
  font-size: 11px;
  color: var(--text-faint);
}
.owed span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
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
</style>
