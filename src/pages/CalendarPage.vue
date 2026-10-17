<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import PushPage from '../components/PushPage.vue'
import RecordList from '../components/RecordList.vue'
import { useRecords } from '../composables/useRecords'
import { calendarPageOpen } from '../composables/useUi'
import { formatFullDate, formatMoney, todayKey, toDateKey } from '../utils/format'
import { addDays, mondayOf, parseKey } from '../utils/period'

// 日历只显示共同记录 + 自己的个人记录（对方的个人消费不可见）
const { visibleRecords } = useRecords()

const today = todayKey()
const month = ref(today.slice(0, 7))
const selected = ref<string | null>(today)

const title = computed(() => {
  const [y, m] = month.value.split('-').map(Number)
  return `${y}年${m}月`
})
const shift = (dir: number) => {
  const [y, m] = month.value.split('-').map(Number)
  const d = new Date(y, m - 1 + dir, 1)
  month.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  selected.value = null
}

const monthRecords = computed(() => visibleRecords.value.filter((r) => r.date.startsWith(month.value)))
const byDay = computed(() => {
  const map = new Map<string, { expense: number; income: number; count: number }>()
  for (const r of monthRecords.value) {
    const cur = map.get(r.date) ?? { expense: 0, income: 0, count: 0 }
    if (r.kind === 'expense') cur.expense += r.amount
    else cur.income += r.amount
    cur.count++
    map.set(r.date, cur)
  }
  return map
})
const monthExpense = computed(() => [...byDay.value.values()].reduce((s, d) => s + d.expense, 0))
const monthIncome = computed(() => [...byDay.value.values()].reduce((s, d) => s + d.income, 0))

const weeks = computed(() => {
  const [y, m] = month.value.split('-').map(Number)
  let cursor = mondayOf(toDateKey(new Date(y, m - 1, 1)))
  const rows: string[][] = []
  for (let r = 0; r < 6; r++) {
    const row = Array.from({ length: 7 }, (_, i) => addDays(cursor, i))
    if (r > 0 && parseKey(row[0]).getMonth() !== m - 1) break
    rows.push(row)
    cursor = addDays(cursor, 7)
  }
  return rows
})

/** 日历格子里的金额：过万用「1.2万」缩短，避免挤出格子 */
const short = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万` : Math.round(n).toLocaleString('ja-JP'))

const dayRecords = computed(() => (selected.value ? monthRecords.value.filter((r) => r.date === selected.value) : []))
const pick = (key: string) => {
  if (!key.startsWith(month.value)) return
  selected.value = selected.value === key ? null : key
}
</script>

<template>
  <PushPage title="收支日历" back-label="首页" @back="calendarPageOpen = false">
    <section class="card">
      <div class="head">
        <button class="nav-btn" aria-label="上个月" @click="shift(-1)"><AppIcon name="chevronLeft" :size="18" :stroke="2.2" /></button>
        <div class="title">
          <b>{{ title }}</b>
          <small>支出 <span class="mono exp">{{ formatMoney(monthExpense) }}</span><template v-if="monthIncome"> · 收入 <span class="mono inc">{{ formatMoney(monthIncome) }}</span></template></small>
        </div>
        <button class="nav-btn" aria-label="下个月" @click="shift(1)"><AppIcon name="chevronRight" :size="18" :stroke="2.2" /></button>
      </div>

      <div class="grid weekdays">
        <span v-for="w in ['一', '二', '三', '四', '五', '六', '日']" :key="w">{{ w }}</span>
      </div>
      <div v-for="row in weeks" :key="row[0]" class="grid">
        <button
          v-for="d in row"
          :key="d"
          :class="['day', { out: !d.startsWith(month), today: d === today, on: d === selected, has: byDay.has(d) }]"
          :disabled="!d.startsWith(month)"
          @click="pick(d)"
        >
          <span class="num">{{ parseKey(d).getDate() }}</span>
          <span v-if="d.startsWith(month) && byDay.get(d)?.expense" class="amt exp mono">{{ short(byDay.get(d)!.expense) }}</span>
          <span v-else-if="d.startsWith(month) && byDay.get(d)?.income" class="amt inc mono">+{{ short(byDay.get(d)!.income) }}</span>
        </button>
      </div>
      <p class="tip">显示共同记录和你自己的个人记录</p>
    </section>

    <transition name="fade" mode="out-in">
      <div v-if="selected" :key="selected" class="day-list">
        <RecordList v-if="dayRecords.length" :records="dayRecords" />
        <p v-else class="none">{{ formatFullDate(selected) }}<br />这天没有记录，是平静的一天</p>
      </div>
    </transition>
  </PushPage>
</template>

<style scoped>
.card {
  background: var(--card);
  border-radius: var(--radius);
  padding: 14px 10px 10px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding: 0 4px;
}
.title {
  text-align: center;
  display: flex;
  flex-direction: column;
}
.title b {
  font-size: 17px;
}
.title small {
  font-size: 11px;
  color: var(--text-faint);
}
.nav-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--bg);
  color: var(--primary);
  display: grid;
  place-items: center;
}
.grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.weekdays {
  text-align: center;
  font-size: 11px;
  color: var(--text-faint);
  margin-bottom: 4px;
}
.day {
  height: 50px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding-top: 6px;
  gap: 1px;
  transition: background 0.15s;
}
.day:active:not(:disabled) {
  background: var(--bg);
}
.day.out {
  opacity: 0.25;
}
.num {
  font-size: 15px;
}
.day.today .num {
  color: var(--primary);
  font-weight: 800;
}
.day.on {
  background: var(--primary-soft);
}
.day.on .num {
  font-weight: 700;
}
.amt {
  font-size: 9.5px;
  line-height: 1.2;
}
.exp {
  color: var(--expense);
}
.inc {
  color: var(--income);
}
.mono {
  font-family: var(--mono);
}
.tip {
  margin: 8px 0 0;
  text-align: center;
  font-size: 11px;
  color: var(--text-faint);
}
.day-list {
  margin-top: 14px;
}
.none {
  margin: 0;
  padding: 24px;
  border-radius: var(--radius);
  background: var(--card);
  text-align: center;
  font-size: 13px;
  color: var(--text-faint);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
