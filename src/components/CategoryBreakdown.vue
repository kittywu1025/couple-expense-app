<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { LedgerRecord, RecordKind } from '../types'
import { findCategory, recordIcon } from '../utils/categories'
import { formatMoney } from '../utils/format'
import EmptyState from './EmptyState.vue'
import AppIcon from './AppIcon.vue'
import CategoryIcon from './CategoryIcon.vue'
import type { IconName } from '../utils/icons'
import { shareOf } from '../utils/settlement'
import { useBooks } from '../composables/useBooks'

const props = defineProps<{ records: LedgerRecord[] }>()

const kind = ref<RecordKind>('expense')
const expanded = ref<string | null>(null)
/** 列表显示方式：金额 / 占比 */
const display = ref<'amount' | 'percent'>('amount')
/** 统计视角：全体 / 只看我（和金额/占比互相独立，可组合） */
const scope = ref<'all' | 'me'>('all')

const { myUid } = useBooks()

/**
 * 某笔记录在当前视角下计入的金额：
 * - 收入：不管哪个视角都只算自己的
 * - 对方的个人消费：不计入（只在列表里看得到）
 * - 全体：共同全额 + 我的个人全额
 * - 只看我：个人记录只算我付的（全额）；共同记录按我的 AA 份额
 */
const weightOf = (r: LedgerRecord) => {
  // 收入只能看自己的
  if (r.kind === 'income') return r.payerUid === myUid.value ? r.amount : 0
  // 对方的个人消费不进统计（列表里照常能看到）
  if (r.type === 'personal' && r.payerUid !== myUid.value) return 0
  if (scope.value === 'all') return r.amount
  if (r.type === 'personal') return r.amount
  return (r.amount * shareOf(r, myUid.value)) / 10
}

const scoped = computed(() =>
  props.records
    .filter((r) => r.kind === kind.value)
    .map((r) => ({ r, w: weightOf(r) }))
    .filter((x) => x.w > 0),
)
watch([kind, scope], () => (expanded.value = null))

interface SubRow {
  name: string
  icon: IconName
  value: number
  count: number
  pct: number
}
interface CatRow extends SubRow {
  color: string
  subs: SubRow[]
}

const total = computed(() => scoped.value.reduce((s, x) => s + x.w, 0))

const rows = computed<CatRow[]>(() => {
  const map = new Map<string, { r: LedgerRecord; w: number }[]>()
  for (const x of scoped.value) {
    if (!map.has(x.r.category)) map.set(x.r.category, [])
    map.get(x.r.category)!.push(x)
  }
  const sum = total.value || 1
  return [...map.entries()]
    .map(([name, list]) => {
      const value = list.reduce((s, x) => s + x.w, 0)
      const subMap = new Map<string, { r: LedgerRecord; w: number }[]>()
      for (const x of list) {
        const key = x.r.subCategory || name
        if (!subMap.has(key)) subMap.set(key, [])
        subMap.get(key)!.push(x)
      }
      const subs = [...subMap.entries()]
        .map(([subName, items]) => {
          const v = items.reduce((s, x) => s + x.w, 0)
          return {
            name: subName,
            icon: recordIcon(name, subName),
            value: v,
            count: items.length,
            pct: (v / (value || 1)) * 100,
          }
        })
        .sort((a, b) => b.value - a.value)
      const cat = findCategory(name)
      return {
        name,
        icon: cat?.icon ?? 'sparkles',
        color: cat?.color ?? '#B0B3C0',
        value,
        count: list.length,
        pct: (value / sum) * 100,
        subs,
      }
    })
    .sort((a, b) => b.value - a.value)
})

// ── 环形图 ──
const CX = 180
const CY = 118
const R = 72
const STROKE = 28
const C = 2 * Math.PI * R

const segments = computed(() => {
  let start = 0
  return rows.value.map((row) => {
    const len = (row.pct / 100) * C
    const gap = rows.value.length > 1 && len > 4 ? 1.5 : 0
    const seg = {
      ...row,
      dash: `${Math.max(len - gap, 0)} ${C - Math.max(len - gap, 0)}`,
      offset: -start,
      mid: ((start + len / 2) / C) * Math.PI * 2 - Math.PI / 2,
    }
    start += len
    return seg
  })
})

// 只给占比 ≥ 4% 的分类画引线标签，避免挤在一起
const labels = computed(() =>
  segments.value
    .filter((s) => s.pct >= 4)
    .map((s) => {
      const cos = Math.cos(s.mid)
      const sin = Math.sin(s.mid)
      const r1 = R + STROKE / 2 + 3
      const r2 = r1 + 12
      const x1 = CX + cos * r1
      const y1 = CY + sin * r1
      const x2 = CX + cos * r2
      const y2 = CY + sin * r2
      const right = cos >= 0
      const x3 = x2 + (right ? 12 : -12)
      return {
        key: s.name,
        color: s.color,
        line: `M${x1},${y1} L${x2},${y2} L${x3},${y2}`,
        x: x3 + (right ? 4 : -4),
        y: y2,
        anchor: right ? 'start' : 'end',
        // 金额模式显示各分类金额，占比模式显示百分比
        text: display.value === 'amount' ? `${s.name} ${formatMoney(s.value)}` : `${s.name} ${s.pct.toFixed(1)}%`,
      }
    }),
)

const kindLabel = computed(() => (kind.value === 'expense' ? '支出' : '收入'))
const toggleKind = () => (kind.value = kind.value === 'expense' ? 'income' : 'expense')
</script>

<template>
  <section class="card">
    <div class="head">
      <h2 class="title"><span class="badge"><AppIcon name="chart" :size="14" :stroke="2.2" /></span> 收支分类详情</h2>
      <div class="display-switch" role="tablist" aria-label="显示方式">
        <button :class="{ on: display === 'amount' }" @click="display = 'amount'">金额</button>
        <button :class="{ on: display === 'percent' }" @click="display = 'percent'">占比</button>
      </div>
    </div>

    <svg v-if="rows.length" viewBox="0 0 360 236" class="donut" role="img" :aria-label="`${kindLabel}分类占比`">
      <circle :cx="CX" :cy="CY" :r="R" fill="none" stroke="#F0F0F3" :stroke-width="STROKE" />
      <circle
        v-for="s in segments"
        :key="s.name"
        :cx="CX"
        :cy="CY"
        :r="R"
        fill="none"
        :stroke="s.color"
        :stroke-width="STROKE"
        :stroke-dasharray="s.dash"
        :stroke-dashoffset="s.offset"
        :transform="`rotate(-90 ${CX} ${CY})`"
      />
      <g v-for="l in labels" :key="l.key">
        <path :d="l.line" fill="none" :stroke="l.color" stroke-width="1.2" />
        <text :x="l.x" :y="l.y + 4" :text-anchor="l.anchor" class="label">{{ l.text }}</text>
      </g>
      <g class="center" @click="toggleKind">
        <circle :cx="CX" :cy="CY" :r="R - STROKE / 2 - 2" fill="transparent" />
        <text :x="CX" :y="CY - 8" text-anchor="middle" class="center-caption">总{{ kindLabel }} ⇆</text>
        <text :x="CX" :y="CY + 16" text-anchor="middle" class="center-value">{{ formatMoney(total) }}</text>
      </g>
    </svg>

    <div class="scope-switch" role="tablist" aria-label="统计视角">
      <button :class="{ on: scope === 'all' }" @click="scope = 'all'">全体</button>
      <button :class="{ on: scope === 'me' }" @click="scope = 'me'">只看我</button>
    </div>
    <p v-if="scope === 'me'" class="scope-hint">个人消费按全额，共同消费按我的 AA 份额</p>

    <div class="kind-switch">
      <button :class="{ on: kind === 'expense' }" @click="kind = 'expense'">支出</button>
      <button :class="{ on: kind === 'income' }" @click="kind = 'income'">收入</button>
    </div>

    <EmptyState
      v-if="!rows.length"
      :icon="kind === 'expense' ? 'chart' : 'wallet'"
      :title="`这个周期还没有${kindLabel}`"
      desc="记账后会在这里按分类汇总占比"
    />

    <div v-for="row in rows" :key="row.name" class="row-wrap">
      <button class="row" @click="expanded = expanded === row.name ? null : row.name">
        <CategoryIcon :name="row.icon" :color="row.color" :size="42" />
        <span class="main">
          <!-- 金额模式：分类名 + 金额 -->
          <span v-if="display === 'amount'" class="top">
            <span class="name">{{ row.name }} <small>{{ row.count }} 笔</small></span>
            <span class="mono amount">{{ formatMoney(row.value) }}</span>
          </span>
          <!-- 占比模式：分类名 + 百分比 + 进度条 -->
          <template v-else>
            <span class="top">
              <span class="name">{{ row.name }}</span>
              <span class="mono amount">{{ row.pct.toFixed(1) }}%</span>
            </span>
            <span class="bottom">
              <span class="track"><span class="bar" :style="{ width: row.pct + '%', background: row.color }" /></span>
            </span>
          </template>
        </span>
        <span :class="['chev', { open: expanded === row.name }]">›</span>
      </button>
      <div v-if="expanded === row.name" class="subs">
        <div v-for="sub in row.subs" :key="sub.name" class="sub">
          <span class="sub-icon" :style="{ color: row.color }"><AppIcon :name="sub.icon" :size="20" /></span>
          <span class="sub-name">{{ sub.name }}</span>
          <span class="mono sub-val">{{ display === 'amount' ? formatMoney(sub.value) : `${sub.pct.toFixed(1)}%` }}</span>
          <span class="sub-meta">{{ sub.count }} 笔 / {{ sub.pct.toFixed(1) }}%</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.card {
  background: var(--card);
  border-radius: var(--radius);
  padding: 16px 16px 8px;
  margin-top: 20px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.scope-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-top: 12px;
  background: var(--bg);
  border-radius: 10px;
  padding: 2px;
}
.scope-switch button {
  padding: 6px 0;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-soft);
}
.scope-switch button.on {
  background: var(--card);
  color: var(--primary);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.scope-hint {
  margin: 6px 2px 0;
  font-size: 11px;
  color: var(--text-faint);
  text-align: center;
}
.display-switch {
  display: flex;
  background: var(--bg);
  border-radius: 999px;
  padding: 2px;
}
.display-switch button {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-soft);
}
.display-switch button.on {
  background: var(--card);
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.title {
  margin: 0;
  font-size: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.badge {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: var(--primary);
  color: #fff;
  font-size: 13px;
  display: grid;
  place-items: center;
}
.donut {
  overflow: visible;
  width: 100%;
  display: block;
  margin: 4px 0;
}
.donut circle {
  transition: stroke-dasharray 0.4s ease, stroke-dashoffset 0.4s ease;
}
.label {
  font-size: 10px;
  fill: var(--text-soft);
}
.center {
  cursor: pointer;
}
.center-caption {
  font-size: 11px;
  fill: var(--text-faint);
}
.center-value {
  font-family: var(--mono);
  font-size: 18px;
  font-weight: 700;
  fill: var(--text);
}
.kind-switch {
  display: flex;
  width: fit-content;
  margin: 0 auto 8px;
  background: var(--bg);
  border-radius: 999px;
  padding: 3px;
}
.kind-switch button {
  padding: 5px 20px;
  border-radius: 999px;
  font-size: 14px;
  color: var(--text-soft);
}
.kind-switch button.on {
  background: var(--card);
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
.row-wrap + .row-wrap {
  border-top: 1px solid var(--line);
}
.row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  text-align: left;
}
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.top,
.bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.name {
  font-weight: 600;
  font-size: 15px;
}
.name small {
  font-weight: 400;
  color: var(--text-faint);
  margin-left: 2px;
}
.amount {
  font-size: 15px;
  font-weight: 600;
}
.track {
  flex: 1;
  height: 6px;
  background: var(--bg);
  border-radius: 999px;
  overflow: hidden;
}
.bar {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.3s;
}
.count {
  font-size: 12px;
  color: var(--text-faint);
  white-space: nowrap;
}
.chev {
  font-size: 20px;
  color: var(--text-faint);
  transition: transform 0.2s;
}
.chev.open {
  transform: rotate(90deg);
}
.subs {
  margin: 0 0 10px 54px;
  background: var(--bg);
  border-radius: 12px;
  padding: 4px 12px;
}
.sub {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  grid-template-rows: auto auto;
  column-gap: 8px;
  align-items: center;
  padding: 8px 0;
}
.sub + .sub {
  border-top: 1px solid var(--line);
}
.sub-icon {
  grid-row: span 2;
}
.sub-name {
  font-size: 14px;
}
.sub-val {
  font-size: 14px;
  text-align: right;
}
.sub-meta {
  grid-column: 2 / 4;
  font-size: 11px;
  color: var(--text-faint);
  text-align: right;
}
.mono {
  font-family: var(--mono);
}
</style>
