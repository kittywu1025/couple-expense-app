<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { RecordKind, RecordType } from '../types'
import { categoriesFor } from '../utils/categories'
import { formatMoney, todayKey } from '../utils/format'
import { useBooks } from '../composables/useBooks'
import { useRecords } from '../composables/useRecords'
import { toast } from '../composables/useToast'

const emit = defineEmits<{ close: [] }>()

const { currentBook, myUid, partner, nameOf } = useBooks()
const { addRecord } = useRecords()

const partnerName = computed(() => partner.value?.displayName ?? 'TA')

// ── 分类 ──
const kind = ref<RecordKind>('expense')
const categories = computed(() => categoriesFor(kind.value))
const catIndex = ref(0)
const category = computed(() => categories.value[catIndex.value])
const subName = ref<string | null>(category.value.subs[0]?.name ?? null)

const pickCategory = (i: number) => {
  catIndex.value = i
  subName.value = categories.value[i].subs[0]?.name ?? null
}
watch(kind, () => {
  pickCategory(0)
  if (kind.value === 'income') type.value = 'personal'
})

// ── 个人 / 共同 ──
const type = ref<RecordType>('personal')
const payerUid = ref(myUid.value)
/** 我承担的份额 0-10（滑条左端=我） */
const myShare = ref(currentBook.value?.defaultRatio ?? 5)

const setType = (t: RecordType) => {
  if (t === 'shared' && !partner.value) {
    toast.info('TA 加入账本后才能记共同账')
    return
  }
  type.value = t
}


const sliderStyle = computed(() => {
  const pct = myShare.value * 10
  return { background: `linear-gradient(90deg, #FF8FAB 0%, #FF8FAB ${pct}%, #74C0FC ${pct}%, #74C0FC 100%)` }
})

// ── 计算器 ──
const expr = ref('')
const MAX_LEN = 24

const evaluate = (s: string) => {
  const tokens = s.match(/[+-]?[^+-]+/g) ?? []
  const sum = tokens.reduce((acc, t) => acc + (Number.parseFloat(t) || 0), 0)
  return Math.round(sum * 100) / 100
}
const amount = computed(() => evaluate(expr.value))
const hasOperator = computed(() => /[+-]/.test(expr.value.slice(1)))
const lastNumber = computed(() => expr.value.split(/[+-]/).pop() ?? '')

const press = (key: string) => {
  const s = expr.value
  if (key === '⌫') {
    expr.value = s.slice(0, -1)
    return
  }
  if (key === '=') {
    expr.value = amount.value ? String(amount.value) : ''
    return
  }
  if (s.length >= MAX_LEN) return
  if (key === '+' || key === '-') {
    if (!s) return
    expr.value = /[+-]$/.test(s) ? s.slice(0, -1) + key : s + key
    return
  }
  if (key === '.') {
    if (lastNumber.value.includes('.')) return
    expr.value = s + (lastNumber.value === '' ? '0.' : '.')
    return
  }
  // 数字：限制两位小数，避免前导 0
  const [, decimals] = lastNumber.value.split('.')
  if (decimals !== undefined && decimals.length >= 2) return
  if (lastNumber.value === '0') {
    expr.value = s.slice(0, -1) + key
    return
  }
  expr.value = s + key
}

const keys = ['7', '8', '9', '⌫', '4', '5', '6', '+', '1', '2', '3', '-', '.', '0', '=']

// ── 时间 / 备注 ──
const date = ref(todayKey())
const note = ref('')

// ── 实时说明 ──
const shareText = computed(() => {
  const s = myShare.value
  const a = amount.value
  if (s === 10) return `🎁 我请客，${partnerName.value} 不用付钱`
  if (s === 0) return `🎁 ${partnerName.value} 请客，我不用付钱`
  const mine = (a * s) / 10
  const theirs = a - mine
  const base = s === 5 ? '5:5 平摊' : `我承担 ${s * 10}%，${partnerName.value} 承担 ${(10 - s) * 10}%`
  if (!a) return base
  const debt = payerUid.value === myUid.value ? `${partnerName.value} 需付我 ${formatMoney(theirs)}` : `我需付 ${partnerName.value} ${formatMoney(mine)}`
  return `${base} · ${debt}`
})

// ── 保存 ──
const saving = ref(false)

const save = async (closeAfter: boolean) => {
  if (saving.value) return
  const value = amount.value
  if (!(value > 0)) {
    toast.warning('请输入金额')
    return
  }
  const shared = type.value === 'shared'
  const payer = shared ? payerUid.value : myUid.value
  saving.value = true
  const { error } = await addRecord({
    amount: value,
    kind: kind.value,
    type: type.value,
    payerUid: payer,
    // 存「付款人份额」
    ratio: shared ? (payer === myUid.value ? myShare.value : 10 - myShare.value) : 10,
    category: category.value.name,
    subCategory: subName.value,
    note: note.value.trim() || null,
    date: date.value || todayKey(),
  })
  saving.value = false
  if (error) {
    toast.error(error.message)
    return
  }
  if (closeAfter) {
    toast.success('已记一笔')
    emit('close')
  } else {
    toast.success('已保存，继续记下一笔', { duration: 1500 })
    expr.value = ''
    note.value = ''
  }
}
</script>

<template>
  <div class="add">
    <!-- 顶部 -->
    <header class="top">
      <button class="close" aria-label="关闭" @click="emit('close')">✕</button>
      <div class="kind-switch">
        <button :class="{ on: kind === 'expense' }" @click="kind = 'expense'">支出</button>
        <button :class="{ on: kind === 'income' }" @click="kind = 'income'">收入</button>
      </div>
      <span class="book">默认账本</span>
    </header>

    <!-- 分类区 -->
    <div class="upper">
      <div class="cat-grid">
        <button
          v-for="(c, i) in categories"
          :key="c.key"
          :class="['cat', { on: i === catIndex }]"
          @click="pickCategory(i)"
        >
          <span class="cat-icon" :style="{ background: i === catIndex ? c.color : c.color + '33' }">{{ c.icon }}</span>
          <span class="cat-name">{{ c.name }}</span>
        </button>
      </div>

      <div v-if="category.subs.length" class="sub-card">
        <button
          v-for="s in category.subs"
          :key="s.name"
          :class="['sub', { on: s.name === subName }]"
          @click="subName = s.name"
        >
          <span class="sub-icon">{{ s.icon }}</span>
          <span>{{ s.name }}</span>
        </button>
      </div>

      <template v-if="kind === 'expense'">
        <div class="type-switch">
          <button :class="{ on: type === 'personal' }" @click="setType('personal')">个人</button>
          <button :class="{ on: type === 'shared' }" @click="setType('shared')">共同</button>
        </div>

        <div v-if="type === 'shared'" class="shared-card">
          <div class="payer-line">
            <span class="hint">谁付的钱</span>
            <div class="chips">
              <button :class="['chip', 'me', { on: payerUid === myUid }]" @click="payerUid = myUid">
                {{ nameOf(myUid) }}
              </button>
              <button
                v-if="partner"
                :class="['chip', 'partner', { on: payerUid === partner.userId }]"
                @click="payerUid = partner.userId"
              >
                {{ partner.displayName }}
              </button>
            </div>
          </div>

          <div class="ratio-head">
            <span class="who me">我 <b class="mono">{{ myShare }}</b></span>
            <span class="hint">AA 比例</span>
            <span class="who partner"><b class="mono">{{ 10 - myShare }}</b> {{ partnerName }}</span>
          </div>
          <input v-model.number="myShare" type="range" min="0" max="10" step="1" class="slider" :style="sliderStyle" />
          <p class="share-text">{{ shareText }}</p>
        </div>
      </template>
    </div>

    <!-- 计算器区 -->
    <div class="lower">
      <div class="amount-line">
        <span class="expr mono">{{ hasOperator ? expr : '' }}</span>
        <span class="amount mono">¥{{ hasOperator ? amount : expr || '0' }}</span>
      </div>
      <div class="meta">
        <label class="date">
          📅
          <input v-model="date" type="date" :max="todayKey()" />
        </label>
        <input v-model="note" class="note" maxlength="40" placeholder="添加备注…" />
      </div>
      <div class="pad">
        <button
          v-for="k in keys"
          :key="k"
          :class="['key', { op: ['+', '-', '=', '⌫'].includes(k), zero: k === '0' }]"
          @click="press(k)"
        >
          {{ k }}
        </button>
      </div>
      <div class="submit">
        <button class="again" :disabled="saving" @click="save(false)">保存再记</button>
        <button class="done" :disabled="saving" @click="save(true)">完成</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.add {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  max-width: 560px;
  margin: 0 auto;
}
.top {
  display: grid;
  grid-template-columns: 64px 1fr 64px;
  align-items: center;
  padding: calc(10px + env(safe-area-inset-top, 0px)) 12px 10px;
}
.close {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--card);
  font-size: 16px;
}
.kind-switch {
  justify-self: center;
  display: flex;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 999px;
  padding: 3px;
}
.kind-switch button,
.type-switch button {
  padding: 5px 18px;
  border-radius: 999px;
  font-size: 14px;
  color: var(--text-soft);
}
.kind-switch button.on,
.type-switch button.on {
  background: var(--card);
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
.book {
  justify-self: end;
  font-size: 12px;
  color: var(--primary);
  background: var(--primary-soft);
  padding: 4px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.upper {
  flex: 1;
  overflow-y: auto;
  padding: 4px 14px 12px;
}
.cat-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px 4px;
  margin-bottom: 12px;
}
.cat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.cat-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 22px;
  transition: transform 0.15s, background 0.15s;
}
.cat.on .cat-icon {
  transform: scale(1.08);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.12);
}
.cat-name {
  font-size: 12px;
  color: var(--text-soft);
}
.cat.on .cat-name {
  color: var(--text);
  font-weight: 600;
}
.sub-card {
  background: var(--card);
  border-radius: var(--radius);
  padding: 10px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  margin-bottom: 12px;
}
.sub {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 2px;
  border-radius: 12px;
  font-size: 12px;
  color: var(--text-soft);
}
.sub.on {
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 600;
}
.sub-icon {
  font-size: 20px;
}
.type-switch {
  display: flex;
  width: fit-content;
  margin: 0 auto 10px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 999px;
  padding: 3px;
}
.type-switch button {
  padding: 6px 28px;
}
.shared-card {
  background: var(--card);
  border-radius: var(--radius);
  padding: 14px;
}
.payer-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.hint {
  font-size: 12px;
  color: var(--text-faint);
}
.chips {
  display: flex;
  gap: 8px;
}
.chip {
  padding: 5px 14px;
  border-radius: 999px;
  font-size: 13px;
  border: 1.5px solid var(--line);
  color: var(--text-soft);
}
.chip.me.on {
  border-color: var(--me);
  background: rgba(255, 143, 171, 0.15);
  color: #e0607f;
  font-weight: 600;
}
.chip.partner.on {
  border-color: var(--partner);
  background: rgba(116, 192, 252, 0.15);
  color: #3a93d6;
  font-weight: 600;
}
.ratio-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
  font-size: 13px;
}
.who.me {
  color: #e0607f;
}
.who.partner {
  color: #3a93d6;
}
.who b {
  font-size: 18px;
}
.slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 10px;
  border-radius: 999px;
  outline: none;
  margin: 6px 0;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  cursor: grab;
}
.slider::-moz-range-thumb {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
.share-text {
  margin: 8px 0 0;
  font-size: 13px;
  text-align: center;
  color: var(--text-soft);
}
.lower {
  background: var(--card);
  border-radius: 20px 20px 0 0;
  box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.06);
  padding: 12px 12px calc(10px + env(safe-area-inset-bottom, 0px));
}
.amount-line {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: 10px;
  padding: 0 6px;
  min-height: 46px;
}
.expr {
  font-size: 14px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.amount {
  color: #ff3b30;
  font-size: 34px;
  font-weight: 700;
  white-space: nowrap;
}
.mono {
  font-family: var(--mono);
}
.meta {
  display: flex;
  gap: 8px;
  margin: 6px 0 10px;
}
.date {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg);
  border-radius: 10px;
  padding: 0 8px;
  font-size: 14px;
}
.date input {
  border: none;
  background: transparent;
  font-size: 13px;
  width: 116px;
  outline: none;
}
.note {
  flex: 1;
  min-width: 0;
  border: none;
  background: var(--bg);
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 14px;
  outline: none;
}
.pad {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.key {
  height: 48px;
  border-radius: 12px;
  background: var(--bg);
  font-size: 20px;
  font-family: var(--mono);
}
.key:active {
  background: #e5e5ea;
}
.key.op {
  color: var(--primary);
  background: var(--primary-soft);
}
.key.zero {
  grid-column: span 2;
}
.submit {
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 8px;
  margin-top: 8px;
}
.submit button {
  height: 50px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 16px;
}
.again {
  background: var(--bg);
  color: var(--text);
}
.done {
  background: #6c63ff;
  color: #fff;
}
.submit button:disabled {
  opacity: 0.6;
}
</style>
