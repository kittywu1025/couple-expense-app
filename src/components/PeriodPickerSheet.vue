<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import BottomSheet from './BottomSheet.vue'
import WheelPicker from './WheelPicker.vue'
import type { PeriodState } from '../utils/period'
import { addDays, mondayOf, parseKey } from '../utils/period'
import { toDateKey } from '../utils/format'

const props = defineProps<{ open: boolean; period: PeriodState }>()
const emit = defineEmits<{ close: []; apply: [PeriodState] }>()

const thisYear = new Date().getFullYear()
const years = Array.from({ length: 8 }, (_, i) => thisYear - 6 + i).map((y) => ({ value: y, label: `${y}年` }))
const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}月` }))

// 草稿：确定后才生效
const draftYear = ref(thisYear)
const draftMonth = ref(1)
const draftWeek = ref('')
const calMonth = ref('') // 周视图日历当前显示的月份 YYYY-MM
const customStart = ref('')
const customEnd = ref('')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const p = props.period
    if (p.mode === 'year') draftYear.value = p.year
    if (p.mode === 'month') {
      const [y, m] = p.month.split('-').map(Number)
      draftYear.value = y
      draftMonth.value = m
    }
    draftWeek.value = p.weekStart
    calMonth.value = p.weekStart.slice(0, 7)
    customStart.value = p.customStart
    customEnd.value = p.customEnd
  },
  { immediate: true },
)

const title = computed(
  () => ({ week: '选择周', month: '选择月份', year: '选择年份', custom: '自定义范围' })[props.period.mode],
)

// ── 周：日历，点任意一天选中它所在的周 ──
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']
const calTitle = computed(() => {
  const [y, m] = calMonth.value.split('-').map(Number)
  return `${y}年${m}月`
})
const calWeeks = computed(() => {
  const [y, m] = calMonth.value.split('-').map(Number)
  const first = toDateKey(new Date(y, m - 1, 1))
  let cursor = mondayOf(first)
  const rows: string[][] = []
  for (let r = 0; r < 6; r++) {
    const row = Array.from({ length: 7 }, (_, i) => addDays(cursor, i))
    if (r > 0 && parseKey(row[0]).getMonth() !== m - 1) break
    rows.push(row)
    cursor = addDays(cursor, 7)
  }
  return rows
})
const shiftCal = (dir: number) => {
  const [y, m] = calMonth.value.split('-').map(Number)
  const d = new Date(y, m - 1 + dir, 1)
  calMonth.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const inCalMonth = (key: string) => key.slice(0, 7) === calMonth.value
const todayKey = toDateKey(new Date())

// ── 自定义 ──
const customError = computed(() => {
  if (props.period.mode !== 'custom') return ''
  if (!customStart.value || !customEnd.value) return '请选择起止日期'
  if (customEnd.value < customStart.value) return '结束日期不能早于开始日期'
  return ''
})

const apply = () => {
  const p = { ...props.period }
  if (p.mode === 'year') p.year = draftYear.value
  if (p.mode === 'month') p.month = `${draftYear.value}-${String(draftMonth.value).padStart(2, '0')}`
  if (p.mode === 'week') p.weekStart = draftWeek.value
  if (p.mode === 'custom') {
    if (customError.value) return
    p.customStart = customStart.value
    p.customEnd = customEnd.value
  }
  emit('apply', p)
}
</script>

<template>
  <BottomSheet :open="open" @close="emit('close')">
    <h3 class="title">{{ title }}</h3>

    <div v-if="period.mode === 'month'" class="wheels">
      <WheelPicker v-model="draftYear" :items="years" />
      <WheelPicker v-model="draftMonth" :items="months" />
    </div>

    <div v-else-if="period.mode === 'year'" class="wheels">
      <WheelPicker v-model="draftYear" :items="years" />
    </div>

    <div v-else-if="period.mode === 'week'" class="cal">
      <div class="cal-head">
        <button aria-label="上个月" @click="shiftCal(-1)"><AppIcon name="chevronLeft" :size="18" /></button>
        <span>{{ calTitle }}</span>
        <button aria-label="下个月" @click="shiftCal(1)"><AppIcon name="chevronRight" :size="18" /></button>
      </div>
      <div class="cal-row weekdays">
        <span v-for="w in WEEKDAYS" :key="w">{{ w }}</span>
      </div>
      <button
        v-for="row in calWeeks"
        :key="row[0]"
        :class="['cal-row', 'week', { on: row[0] === draftWeek }]"
        @click="draftWeek = row[0]"
      >
        <span
          v-for="d in row"
          :key="d"
          :class="['day', { out: !inCalMonth(d), today: d === todayKey }]"
        >{{ parseKey(d).getDate() }}</span>
      </button>
    </div>

    <div v-else class="custom">
      <label>
        <span>开始</span>
        <input v-model="customStart" type="date" :max="customEnd || undefined" />
      </label>
      <label>
        <span>结束</span>
        <input v-model="customEnd" type="date" :min="customStart || undefined" />
      </label>
      <p class="err">{{ customError }}</p>
    </div>

    <button class="apply" :disabled="!!customError" @click="apply">确定</button>
  </BottomSheet>
</template>

<style scoped>
.title {
  margin: 0 0 12px;
  text-align: center;
  font-size: 16px;
}
.wheels {
  display: flex;
  gap: 8px;
}
.cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  font-weight: 600;
}
.cal-head button {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--bg);
  display: grid;
  place-items: center;
  color: var(--primary);
}
.cal-row {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
}
.weekdays {
  font-size: 11px;
  color: var(--text-faint);
  margin-bottom: 4px;
}
.week {
  border-radius: 12px;
  padding: 2px 0;
  transition: background 0.15s;
}
.week.on {
  background: var(--primary);
  color: #fff;
}
.day {
  height: 38px;
  display: grid;
  place-items: center;
  font-size: 15px;
}
.day.out {
  opacity: 0.35;
}
.day.today {
  font-weight: 800;
  text-decoration: underline;
}
.custom {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.custom label {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--bg);
  border-radius: 12px;
  padding: 0 14px;
  height: 48px;
}
.custom span {
  color: var(--text-soft);
  font-size: 14px;
}
.custom input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 16px;
  text-align: right;
  outline: none;
}
.err {
  margin: 0;
  min-height: 16px;
  font-size: 12px;
  color: var(--danger);
}
.apply {
  width: 100%;
  height: 48px;
  margin-top: 14px;
  border-radius: 14px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  font-size: 16px;
}
.apply:disabled {
  opacity: 0.5;
}
</style>
