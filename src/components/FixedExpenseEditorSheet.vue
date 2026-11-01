<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import BottomSheet from './BottomSheet.vue'
import type { FixedExpense, FixedExpenseInput, RecordKind, RecordType } from '../types'
import { categoriesFor } from '../utils/categories'
import { activeCurrencyInfo, formatFullDate, todayKey } from '../utils/format'
import { dueDateIn, intervalLabel, nextDueDate } from '../composables/useFixedExpenses'
import { useBooks } from '../composables/useBooks'

const props = defineProps<{ open: boolean; item: FixedExpense | null; saving?: boolean }>()
const emit = defineEmits<{ close: []; save: [FixedExpenseInput]; delete: [] }>()

const { myUid, partner, nameOf, currentBook } = useBooks()
const partnerName = computed(() => partner.value?.displayName ?? 'TA')

const NAME_MAX = 20
const name = ref('')
const amountText = ref('')
const categoryValue = ref('')
/** 固定支出（房租）还是固定收入（工资） */
const kind = ref<RecordKind>('expense')
const isIncome = computed(() => kind.value === 'income')
/** 文案里的「扣款 / 到账」 */
const dueWord = computed(() => (isIncome.value ? '到账' : '扣款'))
const day = ref(1)
/** 每几个月扣一次 */
const interval = ref(1)
const INTERVALS = [1, 2, 3, 4, 6, 12]
const type = ref<RecordType>('personal')
const payerUid = ref('')
/** 我承担的份额（滑条左边是我） */
const myShare = ref(5)
const tried = ref(false)

const categoryOptions = computed(() =>
  categoriesFor(kind.value).flatMap((c) =>
    c.subs.length
      ? c.subs.map((s) => ({ value: `${c.name}||${s.name}`, label: `${c.name} · ${s.name}` }))
      : [{ value: `${c.name}||`, label: c.name }],
  ),
)

/** 打开弹窗填值时不要触发「拉到一头就换付款人」 */
let filling = false
watch(
  () => props.open,
  async (open) => {
    if (!open) return
    filling = true
    tried.value = false
    const f = props.item
    name.value = f?.name ?? ''
    amountText.value = f ? String(f.amount) : ''
    kind.value = f?.kind ?? 'expense'
    categoryValue.value = f ? `${f.category}||${f.subCategory ?? ''}` : '固定开销||房租'
    day.value = f?.dayOfMonth ?? 1
    interval.value = f?.intervalMonths ?? 1
    firstPick.value = null
    type.value = f?.type ?? 'personal'
    payerUid.value = f?.payerUid ?? myUid.value
    myShare.value =
      f && f.type === 'shared'
        ? f.payerUid === myUid.value
          ? f.ratio
          : 10 - f.ratio
        : (currentBook.value?.defaultRatio ?? 5)
    await nextTick()
    filling = false
  },
)

const amount = computed(() => Math.round(Number.parseFloat(amountText.value) * 100) / 100)
const errors = computed(() => {
  const e: Record<string, string> = {}
  if (!name.value.trim()) e.name = '请填写名称'
  else if (name.value.trim().length > NAME_MAX) e.name = `最多 ${NAME_MAX} 个字`
  if (!(amount.value > 0)) e.amount = '金额需要大于 0'
  if (!isIncome.value && type.value === 'shared' && !partner.value) e.type = 'TA 加入后才能设共同扣款'
  return e
})

/** 预览下一次扣款（编辑时从原来的开始日算，新加的从今天算） */
/** 手动选的首次 / 下次扣款日；没选就按周期自动算（nextDue） */
const firstPick = ref<string | null>(null)
// 改了扣款日或周期，之前选的日期可能对不上了，回到自动算
watch([day, interval], () => (firstPick.value = null))

/** 可选的日期：从今天起往后 12 个月里每个月的扣款日 */
const firstOptions = computed(() => {
  const now = new Date()
  const today = todayKey()
  const list: string[] = []
  for (let i = 0; list.length < 12 && i < 14; i++) {
    const d = dueDateIn(now.getFullYear(), now.getMonth() + i, day.value)
    if (d >= today) list.push(d)
  }
  return list
})

/**
 * 编辑时改了扣款日 / 周期又没自己选日期：从上次扣款那个月往后一个周期开始，
 * 免得「1 号已经扣过、改成 30 号」同一个月又扣一次。
 */
const shiftedStart = computed(() => {
  const f = props.item
  if (!f?.lastGeneratedDate || (day.value === f.dayOfMonth && interval.value === f.intervalMonths)) return null
  const y = Number(f.lastGeneratedDate.slice(0, 4))
  const m = Number(f.lastGeneratedDate.slice(5, 7)) - 1
  const today = todayKey()
  for (let i = interval.value; i <= 240; i += interval.value) {
    const d = dueDateIn(y, m + i, day.value)
    if (d >= today) return d
  }
  return null
})

const nextDue = computed(() =>
  shiftedStart.value ??
  nextDueDate({
    startDate: props.item?.startDate ?? todayKey(),
    lastGeneratedDate: props.item?.lastGeneratedDate ?? null,
    dayOfMonth: day.value,
    intervalMonths: interval.value,
  }),
)

// 拉到一头时，付款人先跟着全出的人（和记账页一样，可以再改：比如 TA 全出、我先刷卡）
watch(myShare, (share) => {
  if (filling) return
  if (share === 10) payerUid.value = myUid.value
  else if (share === 0 && partner.value) payerUid.value = partner.value.userId
})

const sliderStyle = computed(() => {
  const pct = myShare.value * 10
  return { background: `linear-gradient(90deg, var(--me) 0%, var(--me) ${pct}%, var(--partner) ${pct}%, var(--partner) 100%)` }
})

const shareText = computed(() => {
  const p = partnerName.value
  const iPaid = payerUid.value === myUid.value
  if (myShare.value === 10) return iPaid ? '我请客' : `我全出 · ${p}先垫，我转给${p}`
  if (myShare.value === 0) return iPaid ? `${p}全出 · 我先垫，${p}转给我` : `${p}请客`
  return myShare.value === 5 ? '5:5 平摊' : `我 ${myShare.value * 10}% · ${partnerName.value} ${(10 - myShare.value) * 10}%`
})

/** 切换支出 / 收入：分类换成对应的第一个（工资） */
const setKind = (k: RecordKind) => {
  if (k === kind.value) return
  kind.value = k
  categoryValue.value = categoryOptions.value[0]?.value ?? ''
}

const submit = () => {
  tried.value = true
  if (Object.keys(errors.value).length || props.saving) return
  const [category, sub] = categoryValue.value.split('||')
  // 固定收入只算自己的
  if (isIncome.value) {
    emit('save', {
      name: name.value.trim(),
      amount: amount.value,
      kind: 'income',
      category,
      subCategory: sub || null,
      dayOfMonth: day.value,
      intervalMonths: interval.value,
      ...(firstPick.value || shiftedStart.value ? { startDate: firstPick.value ?? shiftedStart.value! } : {}),
      payerUid: props.item?.payerUid ?? myUid.value,
      type: 'personal',
      ratio: 10,
    })
    return
  }
  const shared = type.value === 'shared'
  // 旧设置可能是「我付钱、TA 请客」，保存时付款人按请客的人
  const payer = payerUid.value
  emit('save', {
    name: name.value.trim(),
    amount: amount.value,
    kind: 'expense',
    category,
    subCategory: sub || null,
    dayOfMonth: day.value,
    intervalMonths: interval.value,
    ...(firstPick.value || shiftedStart.value ? { startDate: firstPick.value ?? shiftedStart.value! } : {}),
    payerUid: payer,
    type: type.value,
    // 存「付款人份额」，和账单一致
    ratio: shared ? (payer === myUid.value ? myShare.value : 10 - myShare.value) : 10,
  })
}
</script>

<template>
  <BottomSheet :open="open" @close="emit('close')">
    <div class="head">
      <h3>{{ item ? (isIncome ? '编辑固定收入' : '编辑固定扣款') : '添加固定收支' }}</h3>
      <button v-if="item" class="del" @click="emit('delete')">删除</button>
    </div>

    <div class="form">
      <div v-if="!item" class="field">
        <span>收支</span>
        <div class="seg">
          <button :class="{ on: !isIncome }" @click="setKind('expense')">支出</button>
          <button :class="{ on: isIncome }" @click="setKind('income')">收入</button>
        </div>
      </div>
      <label class="field">
        <span>名称</span>
        <input v-model="name" :maxlength="NAME_MAX + 4" :placeholder="isIncome ? '如：工资' : '如：房租'" />
      </label>
      <p v-if="tried && errors.name" class="err">{{ errors.name }}</p>

      <label class="field">
        <span>金额</span>
        <b class="symbol">{{ activeCurrencyInfo.symbol }}</b>
        <input v-model="amountText" inputmode="decimal" placeholder="0" class="mono" />
      </label>
      <p v-if="tried && errors.amount" class="err">{{ errors.amount }}</p>

      <label class="field">
        <span>分类</span>
        <select v-model="categoryValue">
          <option v-for="o in categoryOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </label>

      <label class="field">
        <span>周期</span>
        <select v-model.number="interval">
          <option v-for="n in INTERVALS" :key="n" :value="n">{{ intervalLabel(n) }}</option>
          <optgroup label="自定义">
            <option v-for="n in [5, 7, 8, 9, 10, 11]" :key="n" :value="n">{{ intervalLabel(n) }}</option>
          </optgroup>
        </select>
      </label>

      <label class="field">
        <span>{{ dueWord }}日</span>
        <select v-model.number="day">
          <option v-for="d in 31" :key="d" :value="d">{{ d }} 号</option>
        </select>
      </label>
      <label class="field">
        <span>{{ item ? `下次${dueWord}` : `首次${dueWord}` }}</span>
        <select :value="firstPick ?? nextDue" @change="firstPick = ($event.target as HTMLSelectElement).value">
          <option v-if="!firstOptions.includes(nextDue)" :value="nextDue">{{ formatFullDate(nextDue) }}</option>
          <option v-for="d in firstOptions" :key="d" :value="d">{{ formatFullDate(d) }}</option>
        </select>
      </label>
      <p class="hint">
        <template v-if="isIncome">到这天打开 App 会自动记一笔收入并提醒你，金额不一样点进去改就好；这个月已经到账的话，选下一次的日期</template>
        <template v-else>
          <template v-if="interval > 1">从这天起{{ intervalLabel(interval) }}扣一次；</template>
          <template v-else>从这天起每月扣一次；</template>
          这个月已经扣过的话，选下一次的日期就好
        </template>
        <template v-if="day > 28">。没有 {{ day }} 号的月份按月底{{ dueWord }}</template>
      </p>

      <template v-if="!isIncome">
      <div class="field">
        <span>类型</span>
        <div class="seg">
          <button :class="{ on: type === 'personal' }" @click="type = 'personal'">个人</button>
          <button :class="{ on: type === 'shared' }" @click="type = 'shared'">共同</button>
        </div>
      </div>
      <p v-if="tried && errors.type" class="err">{{ errors.type }}</p>

      <div class="field">
        <span>付款人</span>
        <div class="chips">
          <button
            :class="['chip', 'me', { on: payerUid === myUid }]"
            @click="payerUid = myUid"
          >
            <i class="dot" />{{ nameOf(myUid) }}
          </button>
          <button
            v-if="partner"
            :class="['chip', 'partner', { on: payerUid === partner.userId }]"
            @click="payerUid = partner.userId"
          >
            <i class="dot" />{{ partner.displayName }}
          </button>
        </div>
      </div>

      <div v-if="type === 'shared'" class="ratio">
        <div class="ratio-head">
          <span class="who me">我 <b class="mono">{{ myShare }}</b></span>
          <span class="share">{{ shareText }}</span>
          <span class="who partner"><b class="mono">{{ 10 - myShare }}</b> {{ partnerName }}</span>
        </div>
        <input v-model.number="myShare" type="range" min="0" max="10" step="1" class="slider" :style="sliderStyle" aria-label="AA 比例" />
      </div>
      </template>
    </div>

    <button class="save" :disabled="saving" @click="submit">
      <AppIcon v-if="!saving" name="check" :size="18" :stroke="2.4" />{{ saving ? '保存中…' : '保存' }}
    </button>
  </BottomSheet>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  margin-bottom: 12px;
}
.head h3 {
  margin: 0;
  font-size: 16px;
}
.del {
  position: absolute;
  right: 0;
  font-size: 13px;
  color: var(--danger);
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 59, 48, 0.08);
}
.form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  padding: 0 14px;
  border-radius: 12px;
  background: var(--bg);
}
.field > span {
  width: 52px;
  flex-shrink: 0;
  font-size: 14px;
  color: var(--text-soft);
}
.field input,
.field select {
  flex: 1;
  min-width: 0;
  height: 44px;
  border: none;
  background: transparent;
  font-size: 16px;
  outline: none;
  text-align: right;
  text-align-last: right;
}
.symbol {
  margin-left: auto;
  color: var(--text-soft);
}
.mono {
  font-family: var(--mono);
}
.err,
.hint {
  margin: -2px 4px 2px;
  font-size: 12px;
}
.err {
  color: var(--danger);
}
.hint {
  color: var(--text-faint);
}
.seg {
  margin-left: auto;
  display: flex;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 999px;
  padding: 2px;
}
.seg button {
  padding: 4px 16px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--text-soft);
}
.seg button.on {
  background: var(--card);
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.chips {
  margin-left: auto;
  display: flex;
  gap: 6px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 12px;
  border-radius: 999px;
  border: 1.5px solid var(--line);
  font-size: 13px;
  color: var(--text-soft);
  background: var(--card);
}
.chip:disabled {
  opacity: 0.35;
}
.chip .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.chip.me .dot {
  background: var(--me);
}
.chip.partner .dot {
  background: var(--partner);
}
.chip.me.on {
  border-color: var(--me);
  background: var(--me-bg);
  color: var(--me-text);
  font-weight: 600;
}
.chip.partner.on {
  border-color: var(--partner);
  background: var(--partner-bg);
  color: var(--partner-text);
  font-weight: 600;
}
.ratio {
  padding: 10px 14px;
  border-radius: 12px;
  background: var(--bg);
}
.ratio-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
}
.who.me {
  color: var(--me-text);
}
.who.partner {
  color: var(--partner-text);
}
.share {
  font-size: 11px;
  color: var(--text-faint);
}
.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 10px;
  border-radius: 999px;
  outline: none;
  margin: 10px 0 4px;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
.slider::-moz-range-thumb {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
.save {
  width: 100%;
  height: 48px;
  margin-top: 16px;
  border-radius: 14px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.save:disabled {
  opacity: 0.6;
}
</style>
