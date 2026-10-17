<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBooks } from '../composables/useBooks'
import { useRecords } from '../composables/useRecords'
import CategoryBreakdown from '../components/CategoryBreakdown.vue'
import AppIcon from '../components/AppIcon.vue'
import { formatMoney } from '../utils/format'
import { currentPeriodMonth, debtOf, inPeriod, isTreat, periodRange, shiftMonth, treaterOf } from '../utils/settlement'

const { currentBook, myUid, otherUid, nameOf, partner } = useBooks()
const { records } = useRecords()

const settleDay = computed(() => currentBook.value?.settleDay ?? 1)
const month = ref(currentPeriodMonth(settleDay.value))
const range = computed(() => periodRange(month.value, settleDay.value))

const monthLabel = computed(() => {
  const [y, m] = month.value.split('-').map(Number)
  return `${y}年${m}月`
})
const rangeLabel = computed(() => {
  if (settleDay.value === 1) return ''
  const fmt = (k: string) => k.slice(5).replace('-', '/')
  const end = new Date(range.value.end)
  end.setDate(end.getDate() - 1)
  return `${fmt(range.value.start)} – ${end.getMonth() + 1}/${end.getDate()}`
})
const isCurrent = computed(() => month.value === currentPeriodMonth(settleDay.value))

const periodRecords = computed(() => records.value.filter((r) => inPeriod(r, range.value)))
const expenses = computed(() => periodRecords.value.filter((r) => r.kind === 'expense'))
const shared = computed(() => expenses.value.filter((r) => r.type === 'shared'))
const aa = computed(() => shared.value.filter((r) => !isTreat(r)))
const treats = computed(() => shared.value.filter(isTreat))

const sharedTotal = computed(() => shared.value.reduce((s, r) => s + r.amount, 0))
const aaTotal = computed(() => aa.value.reduce((s, r) => s + r.amount, 0))
const myTreats = computed(() => treats.value.filter((r) => treaterOf(r, otherUid) === myUid.value).length)
const partnerTreats = computed(() => treats.value.length - myTreats.value)

// 结算：我应付给对方 - 对方应付给我
const iOwe = computed(() => aa.value.filter((r) => r.payerUid !== myUid.value).reduce((s, r) => s + debtOf(r), 0))
const theyOwe = computed(() => aa.value.filter((r) => r.payerUid === myUid.value).reduce((s, r) => s + debtOf(r), 0))
const diff = computed(() => iOwe.value - theyOwe.value)
const partnerName = computed(() => partner.value?.displayName ?? 'TA')

// 各自实付
const paidBy = (uid: string) => expenses.value.filter((r) => r.payerUid === uid).reduce((s, r) => s + r.amount, 0)
const myPaid = computed(() => paidBy(myUid.value))
const partnerPaid = computed(() => expenses.value.reduce((s, r) => s + r.amount, 0) - myPaid.value)
const paidMax = computed(() => Math.max(myPaid.value, partnerPaid.value, 1))

const openSettle = ref(false)
const openPaid = ref(false)
</script>

<template>
  <div class="month-bar">
    <button class="arrow" @click="month = shiftMonth(month, -1)">‹</button>
    <div class="pill">
      {{ monthLabel }}
      <small v-if="rangeLabel">{{ rangeLabel }}</small>
    </div>
    <button class="arrow" :disabled="isCurrent" @click="month = shiftMonth(month, 1)">›</button>
  </div>

  <div class="two">
    <div class="card num">
      <span class="label">共同支出</span>
      <span class="value">{{ formatMoney(sharedTotal) }}</span>
    </div>
    <div class="card num">
      <span class="label">AA 部分</span>
      <span class="value">{{ formatMoney(aaTotal) }}</span>
    </div>
  </div>

  <div class="three card">
    <div>
      <span class="count me">{{ myTreats }}</span>
      <span class="label">我请客</span>
    </div>
    <div>
      <span class="count partner">{{ partnerTreats }}</span>
      <span class="label">{{ partnerName }}请客</span>
    </div>
    <div>
      <span class="count">{{ aa.length }}</span>
      <span class="label">AA 笔数</span>
    </div>
  </div>

  <div class="card fold">
    <button class="fold-head" @click="openSettle = !openSettle">
      <span class="fold-title"><span class="fold-icon"><AppIcon name="transfer" :size="16" :stroke="2" /></span>月末结算明细</span>
      <span :class="['chev', { open: openSettle }]">›</span>
    </button>
    <div v-if="openSettle" class="fold-body">
      <div v-if="Math.abs(diff) < 0.5" class="settle-result even"><AppIcon name="party" :size="20" />本期两清，无需转账</div>
      <div v-else class="settle-result">
        <div class="flow">
          <span :class="['avatar', diff > 0 ? 'me' : 'partner']">{{ (diff > 0 ? nameOf(myUid) : partnerName).slice(0, 1) }}</span>
          <span class="arrow-line">→</span>
          <span :class="['avatar', diff > 0 ? 'partner' : 'me']">{{ (diff > 0 ? partnerName : nameOf(myUid)).slice(0, 1) }}</span>
        </div>
        <p>{{ diff > 0 ? `我转给 ${partnerName}` : `${partnerName} 转给我` }}</p>
        <p class="big mono">{{ formatMoney(Math.abs(diff)) }}</p>
      </div>
      <dl class="detail">
        <div><dt>我应付给 {{ partnerName }}</dt><dd class="mono">{{ formatMoney(iOwe) }}</dd></div>
        <div><dt>{{ partnerName }} 应付给我</dt><dd class="mono">{{ formatMoney(theyOwe) }}</dd></div>
      </dl>
      <p class="explain">
        算法：每笔 AA 记录中，没付钱的一方应付「金额 × 自己的份额 / 10」给付款人。
        请客（10:0 或 0:10）不产生债务，只计次数。差额 = 我应付合计 − 对方应付给我合计，正数由我转给对方，负数由对方转给我。
      </p>
    </div>
  </div>

  <div class="card fold">
    <button class="fold-head" @click="openPaid = !openPaid">
      <span class="fold-title"><span class="fold-icon"><AppIcon name="wallet" :size="16" :stroke="2" /></span>各自支出明细</span>
      <span :class="['chev', { open: openPaid }]">›</span>
    </button>
    <div v-if="openPaid" class="fold-body">
      <div class="bar-row">
        <span class="bar-name">我</span>
        <div class="bar-track"><div class="bar me" :style="{ width: (myPaid / paidMax) * 100 + '%' }" /></div>
        <span class="mono bar-val">{{ formatMoney(myPaid) }}</span>
      </div>
      <div class="bar-row">
        <span class="bar-name">{{ partnerName }}</span>
        <div class="bar-track"><div class="bar partner" :style="{ width: (partnerPaid / paidMax) * 100 + '%' }" /></div>
        <span class="mono bar-val">{{ formatMoney(partnerPaid) }}</span>
      </div>
      <p class="explain">* 这里是各自实际掏钱的金额（含个人支出），不代表各自应付。</p>
    </div>
  </div>

  <CategoryBreakdown :records="periodRecords" />
</template>

<style scoped>
.month-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
}
.pill {
  background: var(--card);
  border-radius: 999px;
  padding: 8px 20px;
  font-weight: 600;
  text-align: center;
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.pill small {
  font-weight: 400;
  font-size: 11px;
  color: var(--text-faint);
}
.arrow {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--card);
  font-size: 22px;
  line-height: 1;
  color: var(--primary);
}
.arrow:disabled {
  color: var(--text-faint);
  opacity: 0.5;
}
.card {
  background: var(--card);
  border-radius: var(--radius);
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 12px;
}
.num {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.label {
  font-size: 12px;
  color: var(--text-soft);
}
.value {
  font-family: var(--mono);
  font-size: 22px;
  font-weight: 700;
}
.three {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  padding: 14px 0;
  margin-bottom: 12px;
  text-align: center;
}
.three > div {
  display: flex;
  flex-direction: column;
}
.three > div + div {
  border-left: 1px solid var(--line);
}
.count {
  font-family: var(--mono);
  font-size: 24px;
  font-weight: 700;
}
.count.me {
  color: var(--me);
}
.count.partner {
  color: var(--partner);
}
.fold {
  margin-bottom: 12px;
  overflow: hidden;
}
.fold-head {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  font-weight: 600;
}
.fold-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.fold-icon {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--primary-soft);
  color: var(--primary);
  display: grid;
  place-items: center;
}
.chev {
  font-size: 20px;
  color: var(--text-faint);
  transition: transform 0.2s;
}
.chev.open {
  transform: rotate(90deg);
}
.fold-body {
  padding: 0 16px 16px;
}
.settle-result {
  text-align: center;
  padding: 12px;
  background: var(--bg);
  border-radius: 12px;
}
.settle-result.even {
  color: var(--text-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.settle-result p {
  margin: 6px 0 0;
  color: var(--text-soft);
  font-size: 14px;
}
.settle-result .big {
  margin: 2px 0 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--text);
}
.flow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 700;
}
.avatar.me {
  background: var(--me);
}
.avatar.partner {
  background: var(--partner);
}
.arrow-line {
  color: var(--primary);
  font-size: 22px;
}
.detail {
  margin: 12px 0 0;
}
.detail div {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  font-size: 14px;
}
.detail dt {
  color: var(--text-soft);
}
.detail dd {
  margin: 0;
}
.explain {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--text-faint);
  line-height: 1.6;
}
.bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.bar-name {
  width: 48px;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bar-val {
  font-size: 13px;
  min-width: 72px;
  text-align: right;
}
.bar-track {
  flex: 1;
  height: 12px;
  background: var(--bg);
  border-radius: 999px;
  overflow: hidden;
}
.bar {
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s;
}
.bar.me {
  background: var(--me);
}
.bar.partner {
  background: var(--partner);
}
.mono {
  font-family: var(--mono);
}
</style>
