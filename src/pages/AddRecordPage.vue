<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CustomCategory, LedgerRecord, NewRecord, RecordKind, RecordType } from '../types'
import { categoriesFor, isCategoryNameTaken } from '../utils/categories'
import CategoryEditorSheet from '../components/CategoryEditorSheet.vue'
import CategoryDetailSheet from '../components/CategoryDetailSheet.vue'
import type { IconName } from '../utils/icons'
import { needsPartnerConfirm, shareOf } from '../utils/settlement'
import { activeCurrencyInfo, formatDateLabel, formatMoney, todayKey } from '../utils/format'
import { useBooks } from '../composables/useBooks'
import { useRecords } from '../composables/useRecords'
import { confirmAction, haptic } from '../composables/useUi'
import { toast } from '../composables/useToast'
import AppIcon from '../components/AppIcon.vue'

const props = defineProps<{ record?: LedgerRecord | null }>()
const emit = defineEmits<{ close: [] }>()

/** 编辑模式：预填当前记录的值 */
const editing = props.record ?? null

const { currentBook, myUid, partner, nameOf, updateBookSettings } = useBooks()
const { addRecord, updateRecord } = useRecords()

const partnerName = computed(() => partner.value?.displayName ?? 'TA')
const MAX_AMOUNT = 99_999_999

// ── 分类 ──
const kind = ref<RecordKind>(editing?.kind ?? 'expense')
const categories = computed(() => categoriesFor(kind.value))
const initialCatIndex = editing ? categoriesFor(editing.kind).findIndex((c) => c.name === editing.category) : 0
const catIndex = ref(
  initialCatIndex >= 0 ? initialCatIndex : Math.max(0, categoriesFor(kind.value).findIndex((c) => c.name === '其他')),
)
const category = computed(() => categories.value[catIndex.value] ?? categories.value[0])
const subName = ref<string | null>(
  editing && category.value.subs.some((s) => s.name === editing.subCategory)
    ? editing.subCategory
    : (category.value.subs[0]?.name ?? null),
)
const popKey = ref(0)

const pickCategory = (i: number) => {
  if (i !== catIndex.value) haptic(6)
  catIndex.value = i
  subName.value = categories.value[i].subs[0]?.name ?? null
  popKey.value++
}
const pickSub = (name: string) => {
  if (name !== subName.value) haptic(6)
  subName.value = name
}

// ── 自定义分类 ──
const editorMode = ref<'category' | 'sub' | null>(null)
const savingCategory = ref(false)

const validateCategoryName = (name: string) => {
  if (editorMode.value === 'sub') return category.value.subs.some((s) => s.name === name) ? '这个子分类已经有了' : ''
  return isCategoryNameTaken(name) ? '已经有同名分类了' : ''
}

const saveCustomList = async (list: CustomCategory[]) => {
  savingCategory.value = true
  const { error } = await updateBookSettings({ customCategories: list })
  savingCategory.value = false
  if (error) toast.error(error.message)
  return !error
}

/** 保存后按 key 找回当前选中的大类（列表变了，下标可能会变） */
const reselect = (key: string, sub?: string | null) => {
  const i = categories.value.findIndex((c) => c.key === key)
  catIndex.value = i >= 0 ? i : 0
  subName.value = sub !== undefined ? sub : (category.value.subs[0]?.name ?? null)
}

const onEditorSave = async ({ name, icon, color }: { name: string; icon: IconName; color: string }) => {
  const list = [...(currentBook.value?.customCategories ?? [])]
  if (editorMode.value === 'category') {
    const key = `c-${Date.now().toString(36)}`
    list.push({ key, name, icon, color, kind: kind.value, subs: [] })
    if (!(await saveCustomList(list))) return
    editorMode.value = null
    reselect(key, null)
    popKey.value++
    // 新建后直接进入详情，方便接着加子分类
    detailOpen.value = true
    toast.success(`已添加分类「${name}」`)
    return
  }
  const parentKey = category.value.key
  const idx = list.findIndex((c) => c.key === parentKey)
  if (idx < 0) return
  list[idx] = { ...list[idx], subs: [...list[idx].subs, { name, icon }] }
  if (!(await saveCustomList(list))) return
  editorMode.value = null
  reselect(parentKey, name)
  toast.success(`已添加子分类「${name}」`)
}

// 自定义大类详情：加子分类、长按删子分类、删整个大类（默认分类没有删除入口）
const detailOpen = ref(false)

const onCatClick = (i: number) => {
  const target = categories.value[i]
  if (i !== catIndex.value) pickCategory(i)
  if (target?.custom) detailOpen.value = true
}

const onDetailPickSub = (name: string) => {
  pickSub(name)
  detailOpen.value = false
}

const deleteCustomCategory = async () => {
  const c = category.value
  if (!c.custom) return
  const ok = await confirmAction({
    title: `删除大类「${c.name}」？`,
    message: `会连同 ${c.subs.length} 个子分类一起删除。已经记过的账单不会被删除。`,
    confirmText: '删除大类',
    danger: true,
  })
  if (!ok) return
  const list = (currentBook.value?.customCategories ?? []).filter((x) => x.key !== c.key)
  if (!(await saveCustomList(list))) return
  detailOpen.value = false
  pickCategory(0)
  toast.success(`已删除「${c.name}」`)
}

const deleteCustomSub = async (name: string) => {
  const parent = category.value
  if (!parent.custom) return
  const ok = await confirmAction({
    title: `删除子分类「${name}」？`,
    message: '已经记过的账单不会被删除。',
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  const list = (currentBook.value?.customCategories ?? []).map((c) =>
    c.key === parent.key ? { ...c, subs: c.subs.filter((s) => s.name !== name) } : c,
  )
  if (!(await saveCustomList(list))) return
  reselect(parent.key, subName.value === name ? undefined : subName.value)
  toast.success(`已删除「${name}」`)
}

// ── 个人 / 共同 ──
const type = ref<RecordType>(editing?.type ?? 'personal')
const payerUid = ref(editing?.type === 'shared' ? editing.payerUid : myUid.value)
/** 我承担的份额 0-10（滑条左端=我） */
const myShare = ref(
  editing?.type === 'shared' ? shareOf(editing, myUid.value) : (currentBook.value?.defaultRatio ?? 5),
)

watch(kind, () => {
  pickCategory(0)
  if (kind.value === 'income') type.value = 'personal'
})
// 请客的人就是付钱的人：我请客 → 我付；TA 请客 → TA 付（不会出现「我付钱却算 TA 请客」）
watch(myShare, (share) => {
  haptic(4)
  if (share === 10) payerUid.value = myUid.value
  else if (share === 0 && partner.value) payerUid.value = partner.value.userId
})
/** 请客时付款人跟着请客的人，另一边不能选 */
const payerLocked = computed(() => myShare.value === 10 || myShare.value === 0)

const setType = (t: RecordType) => {
  if (t === 'shared' && !partner.value) {
    toast.info('TA 用邀请码加入后，就能记共同账了', { title: '还差一个人' })
    return
  }
  type.value = t
}

const sliderStyle = computed(() => {
  const pct = myShare.value * 10
  return {
    background: `linear-gradient(90deg, var(--me) 0%, var(--me) ${pct}%, var(--partner) ${pct}%, var(--partner) 100%)`,
  }
})

// ── 计算器 ──
const expr = ref(editing ? String(editing.amount) : '')
const MAX_LEN = 24

const evaluate = (s: string) => {
  const tokens = s.match(/[+-]?[^+-]+/g) ?? []
  const sum = tokens.reduce((acc, t) => acc + (Number.parseFloat(t) || 0), 0)
  // 输入多少记多少：只去掉浮点误差，保留最多两位小数
  return Math.round(sum * 100) / 100
}
const amount = computed(() => evaluate(expr.value))
const hasOperator = computed(() => /[+-]/.test(expr.value.slice(1)))
const lastNumber = computed(() => expr.value.split(/[+-]/).pop() ?? '')
const isValidAmount = computed(() => amount.value > 0 && amount.value <= MAX_AMOUNT)

const amountText = computed(() => {
  if (!expr.value) return '0'
  if (hasOperator.value) return formatMoney(amount.value).replace(activeCurrencyInfo.value.symbol, '')
  return expr.value
})

const press = (key: string) => {
  haptic(4)
  const s = expr.value
  if (key === '⌫') {
    expr.value = s.slice(0, -1)
    return
  }
  if (key === '=') {
    expr.value = amount.value > 0 ? String(amount.value) : ''
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
  // 数字：限制小数位、整数位，避免前导 0
  const [intPart, decimals] = lastNumber.value.split('.')
  // 输入时最多两位小数
  if (decimals !== undefined && decimals.length >= 2) return
  if (decimals === undefined && intPart.length >= 8) return
  if (lastNumber.value === '0') {
    expr.value = s.slice(0, -1) + key
    return
  }
  expr.value = s + key
}

const keys = ['7', '8', '9', '⌫', '4', '5', '6', '+', '1', '2', '3', '-', '.', '0', '=']

// 电脑上可以直接用键盘输入
const onKeydown = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT') return
  if (/^[0-9.+-]$/.test(e.key)) press(e.key)
  else if (e.key === 'Backspace') press('⌫')
  else if (e.key === 'Enter') save(true)
  else if (e.key === 'Escape') requestClose()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// ── 时间 / 备注 ──
const date = ref(editing?.date ?? todayKey())
const note = ref(editing?.note ?? '')
const dateLabel = computed(() => formatDateLabel(date.value))

// ── 实时说明 ──
const shareText = computed(() => {
  const s = myShare.value
  const a = amount.value
  if (s === 10) return `我请客，${partnerName.value} 不用付钱`
  if (s === 0) return `${partnerName.value} 请客，我不用付钱`
  const mine = (a * s) / 10
  const theirs = a - mine
  const base = s === 5 ? '5:5 平摊' : `我承担 ${s * 10}%，${partnerName.value} 承担 ${(10 - s) * 10}%`
  if (!a) return base
  const debt =
    payerUid.value === myUid.value
      ? `${partnerName.value}那份 ${formatMoney(theirs)} 我先垫`
      : `我那份 ${formatMoney(mine)} ${partnerName.value}先垫`
  return `${base} · ${debt}`
})

/** TA 承担的比平时多（比如记成 TA 请客）才要 TA 确认；否则只提醒 TA 一声 */
const confirmNote = computed(() => {
  const payer = payerUid.value
  const ratio = payer === myUid.value ? myShare.value : 10 - myShare.value
  return needsPartnerConfirm({ type: 'shared', payerUid: payer, ratio }, myUid.value, currentBook.value?.defaultRatio ?? 5)
    ? `${partnerName.value}承担的比平时多，保存后要${partnerName.value}确认了才算`
    : `保存后会告诉${partnerName.value}一声，不用等确认`
})

// ── 校验与保存 ──
const saving = ref(false)
const shake = ref(false)
const savedCount = ref(0)
const justSaved = ref(false)

const rejectAmount = async (message: string) => {
  shake.value = false
  await nextTick()
  shake.value = true
  haptic(30)
  toast.warning(message)
}

const buildPayload = (): NewRecord => {
  const shared = type.value === 'shared'
  // 旧账单可能是「我付钱、TA 请客」，保存时按请客的人改成付款人
  const treater = myShare.value === 10 ? myUid.value : myShare.value === 0 ? partner.value?.userId : undefined
  const payer = shared ? (treater ?? payerUid.value) : myUid.value
  return {
    amount: amount.value,
    kind: kind.value,
    type: type.value,
    payerUid: payer,
    // 存「付款人份额」
    ratio: shared ? (payer === myUid.value ? myShare.value : 10 - myShare.value) : 10,
    // 结清在「结清」页由先垫钱的人标记，这里只保留原来的状态
    settledOnSpot: !!editing?.settledOnSpot,
    category: category.value.name,
    subCategory: subName.value,
    note: note.value.trim() || null,
    date: date.value,
  }
}

const initialPayload = editing ? JSON.stringify(buildPayload()) : ''
const isDirty = computed(() =>
  editing ? JSON.stringify(buildPayload()) !== initialPayload : !!expr.value && amount.value > 0,
)

const save = async (closeAfter: boolean) => {
  if (saving.value) return
  const value = amount.value
  if (!(value > 0)) return rejectAmount(expr.value ? '金额需要大于 0' : '请先输入金额')
  if (value > MAX_AMOUNT) return rejectAmount('金额太大了，请检查一下')
  if (!date.value || date.value > todayKey()) {
    toast.warning('日期不能晚于今天')
    return
  }
  const shared = type.value === 'shared'
  if (shared && !partner.value) {
    toast.info('TA 加入后才能记共同账')
    return
  }
  const payload = buildPayload()
  saving.value = true
  const { error } = editing ? await updateRecord(editing.id, payload) : await addRecord(payload)
  saving.value = false
  if (error) {
    toast.error(error.message, { title: '保存失败' })
    return
  }
  haptic(12)
  savedCount.value++
  if (editing) {
    toast.success('已保存修改')
    emit('close')
  } else if (closeAfter) {
    toast.success(`已记一笔 ${formatMoney(value)}`)
    emit('close')
  } else {
    expr.value = ''
    note.value = ''
    justSaved.value = true
    setTimeout(() => (justSaved.value = false), 1400)
  }
}

const requestClose = async () => {
  if (isDirty.value) {
    const ok = await confirmAction(
      editing
        ? { title: '放弃修改？', message: '刚才的修改不会被保存。', confirmText: '放弃修改', danger: true }
        : {
            title: '放弃这笔记录？',
            message: `已输入的 ${formatMoney(amount.value)} 不会被保存。`,
            confirmText: '放弃',
            danger: true,
          },
    )
    if (!ok) return
  }
  emit('close')
}
</script>

<template>
  <div class="add">
    <!-- 顶部 -->
    <header class="top">
      <button class="close" aria-label="关闭" @click="requestClose"><AppIcon name="close" :size="16" :stroke="2.2" /></button>
      <div class="kind-switch">
        <button :class="{ on: kind === 'expense' }" @click="kind = 'expense'">支出</button>
        <button :class="{ on: kind === 'income' }" @click="kind = 'income'">收入</button>
      </div>
      <span class="book">{{ editing ? '编辑账单' : '默认账本' }}</span>
    </header>

    <!-- 分类区 -->
    <div class="upper">
      <div class="cat-grid">
        <button
          v-for="(c, i) in categories"
          :key="c.key"
          :class="['cat', { on: i === catIndex }]"
          :aria-pressed="i === catIndex"
          @click="onCatClick(i)"
        >
          <span
            :key="i === catIndex ? popKey : -1"
            class="cat-icon"
            :style="
              i === catIndex
                ? { background: c.color, color: '#fff', boxShadow: `0 0 0 3px #fff, 0 0 0 5px ${c.color}66, 0 6px 14px ${c.color}55` }
                : { background: c.color + '24', color: c.color }
            "
          >
            <AppIcon :name="c.icon" :size="22" :stroke="i === catIndex ? 2.1 : 1.8" />
          </span>
          <span class="cat-name" :style="i === catIndex ? { color: c.color } : undefined">{{ c.name }}</span>
        </button>
        <button class="cat add-cat" aria-label="添加分类" @click="editorMode = 'category'">
          <span class="cat-icon dashed"><AppIcon name="plus" :size="20" :stroke="2" /></span>
          <span class="cat-name">添加</span>
        </button>
      </div>

      <transition name="sub" mode="out-in">
        <div v-if="category.subs.length || category.custom" :key="category.key" class="sub-card">
          <button
            v-for="s in category.subs"
            :key="s.name"
            :class="['sub', { on: s.name === subName }]"
            :style="s.name === subName ? { background: category.color + '22', color: 'var(--text)' } : undefined"
            @click="pickSub(s.name)"
          >
            <span class="sub-icon" :style="{ color: category.color }"><AppIcon :name="s.icon" :size="22" /></span>
            <span class="sub-name">{{ s.name }}</span>
            <span v-if="s.name === subName" class="check" :style="{ background: category.color }"><AppIcon name="check" :size="9" :stroke="3.5" /></span>
          </button>
          <button v-if="category.custom" class="sub add-sub" @click="detailOpen = true">
            <span class="sub-icon"><AppIcon name="chevronRight" :size="20" :stroke="2" /></span>
            <span class="sub-name">管理分类</span>
          </button>
        </div>
      </transition>

    </div>

    <!-- 计算器区 -->
    <div class="lower">
      <div :class="['amount-line', { shake }]" @animationend="shake = false">
        <transition name="saved">
          <span v-if="justSaved" class="saved-badge"><AppIcon name="check" :size="12" :stroke="3" />已保存 · 本次 {{ savedCount }} 笔</span>
        </transition>
        <div v-if="kind === 'expense'" class="type-switch">
          <span class="thumb" :class="{ right: type === 'shared' }" />
          <button :class="{ on: type === 'personal' }" @click="setType('personal')">个人</button>
          <button :class="{ on: type === 'shared', locked: !partner }" @click="setType('shared')">
            <span class="type-label">共同<AppIcon v-if="!partner" name="lock" :size="11" :stroke="2" /></span>
          </button>
        </div>
        <span class="amount-right">
          <span class="expr mono">{{ hasOperator ? expr : '' }}</span>
          <span :class="['amount', 'mono', { empty: !isValidAmount, income: kind === 'income' }]">
            <small>{{ activeCurrencyInfo.symbol }}</small>{{ amountText }}
          </span>
        </span>
      </div>

      <transition name="expand">
        <div v-if="kind === 'expense' && type === 'shared'" class="shared-panel">
          <div class="ratio-head">
            <span class="who me">我 <b class="mono">{{ myShare }}</b></span>
            <span class="share-text">{{ shareText }}</span>
            <span class="who partner"><b class="mono">{{ 10 - myShare }}</b> {{ partnerName }}</span>
          </div>
          <input
            v-model.number="myShare"
            type="range"
            min="0"
            max="10"
            step="1"
            class="slider"
            :style="sliderStyle"
            aria-label="AA 比例"
          />
          <div class="ticks">
            <button :class="{ on: myShare === 10 }" @click="myShare = 10">我请客</button>
            <button :class="{ on: myShare === 5 }" @click="myShare = 5">平摊</button>
            <button :class="{ on: myShare === 0 }" @click="myShare = 0">TA请客</button>
          </div>
          <div class="payer-line">
            <span class="hint">{{ payerLocked ? '请客的人付的钱' : '谁付的钱' }}</span>
            <div class="chips">
              <button
                :class="['chip', 'me', { on: payerUid === myUid }]"
                :disabled="payerLocked && payerUid !== myUid"
                @click="payerUid = myUid"
              >
                <i class="dot" />{{ nameOf(myUid) }}
              </button>
              <button
                v-if="partner"
                :class="['chip', 'partner', { on: payerUid === partner.userId }]"
                :disabled="payerLocked && payerUid !== partner.userId"
                @click="payerUid = partner.userId"
              >
                <i class="dot" />{{ partner.displayName }}
              </button>
            </div>
          </div>
          <p class="confirm-note">{{ confirmNote }}</p>
        </div>
      </transition>
      <div class="meta">
        <label class="date">
          <span class="date-label"><AppIcon name="calendar" :size="15" :stroke="2" />{{ dateLabel }}</span>
          <input v-model="date" type="date" :max="todayKey()" aria-label="日期" />
        </label>
        <input v-model="note" class="note" maxlength="40" placeholder="添加备注…" enterkeyhint="done" />
      </div>
      <div class="pad">
        <button
          v-for="k in keys"
          :key="k"
          :class="[
            'key',
            { op: ['+', '-', '=', '⌫'].includes(k), zero: k === '0' },
          ]"
          @click="press(k)"
        >
          <AppIcon v-if="k === '⌫'" name="backspace" :size="22" />
          <template v-else>{{ k }}</template>
        </button>
      </div>
      <div :class="['submit', { single: editing }]">
        <button v-if="!editing" class="again" :disabled="saving" @click="save(false)">保存再记</button>
        <button :class="['done', { idle: !isValidAmount }]" :disabled="saving" @click="save(true)">
          <span v-if="saving" class="spinner" />
          {{ saving ? '保存中' : editing ? '保存修改' : '完成' }}
        </button>
      </div>
    </div>

    <CategoryDetailSheet
      :open="detailOpen && !!category.custom"
      :category="category.custom ? category : null"
      :selected-sub="subName"
      @close="detailOpen = false"
      @pick-sub="onDetailPickSub"
      @add-sub="editorMode = 'sub'"
      @delete-sub="deleteCustomSub"
      @delete-category="deleteCustomCategory"
    />
    <CategoryEditorSheet
      :open="!!editorMode"
      :mode="editorMode ?? 'category'"
      :color="editorMode === 'sub' ? category.color : undefined"
      :parent-name="category.name"
      :validate-name="validateCategoryName"
      :saving="savingCategory"
      @close="editorMode = null"
      @save="onEditorSave"
    />
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
  display: grid;
  place-items: center;
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
  gap: 8px 4px;
  margin-bottom: 10px;
}
.cat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.cat-icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 22px;
  transition: transform 0.15s, background 0.2s, box-shadow 0.2s, filter 0.2s;
  filter: saturate(0.85);
}
.cat:active .cat-icon {
  transform: scale(0.9);
}
.cat.on .cat-icon {
  filter: none;
  animation: pop 0.32s cubic-bezier(0.3, 1.6, 0.5, 1);
}
@keyframes pop {
  0% {
    transform: scale(0.85);
  }
  100% {
    transform: scale(1);
  }
}
.cat,
.sub {
  -webkit-touch-callout: none;
  user-select: none;
  -webkit-user-select: none;
}
.cat-icon.dashed {
  background: transparent;
  border: 1.5px dashed #c7c7cc;
  color: #aeaeb2;
  filter: none;
}
.add-sub {
  color: var(--text-faint);
  border: 1.5px dashed #d1d1d6;
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
.sub {
  position: relative;
  transition: background 0.15s, transform 0.12s;
}
.sub:active {
  transform: scale(0.95);
}
.sub.on {
  font-weight: 600;
}
.sub-name {
  line-height: 1.3;
  text-align: center;
}
.check {
  position: absolute;
  top: 4px;
  right: 6px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  color: #fff;
  display: grid;
  place-items: center;
}
.type-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}
.date-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.sub-enter-active,
.sub-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.sub-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.sub-leave-to {
  opacity: 0;
}
.sub-icon {
  display: grid;
  place-items: center;
  height: 24px;
}
.type-switch {
  position: relative;
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  width: 120px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 999px;
  padding: 2px;
}
.type-switch .thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc(50% - 2px);
  height: calc(100% - 4px);
  border-radius: 999px;
  background: var(--card);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  transition: transform 0.22s cubic-bezier(0.3, 1.2, 0.5, 1);
}
.type-switch .thumb.right {
  transform: translateX(100%);
}
.type-switch button {
  position: relative;
  padding: 5px 0;
  font-size: 13px;
}
.type-switch button.on {
  background: transparent !important;
  box-shadow: none !important;
}
.type-switch button.locked {
  color: var(--text-faint);
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
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: all 0.15s;
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
.chip:active {
  transform: scale(0.95);
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
.ratio-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
  font-size: 13px;
}
.who.me {
  color: var(--me-text);
}
.who.partner {
  color: var(--partner-text);
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
.ticks {
  display: flex;
  justify-content: space-between;
  margin-top: 2px;
}
.ticks button {
  font-size: 11px;
  color: var(--text-faint);
  padding: 2px 4px;
  border-radius: 6px;
}
.ticks button.on {
  color: var(--primary);
  font-weight: 600;
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
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 0 4px;
  min-height: 44px;
}
.amount-right {
  flex: 1;
  min-width: 0;
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: 8px;
}
.shared-panel {
  background: var(--bg);
  border-radius: 14px;
  padding: 10px 12px;
  margin: 4px 0 6px;
}
.shared-panel .ratio-head {
  margin-bottom: 2px;
}
.shared-panel .share-text {
  margin: 0;
  flex: 1;
  text-align: center;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shared-panel .payer-line {
  margin: 8px 0 0;
}
.confirm-note {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--text-faint);
  text-align: center;
}
.expand-enter-active,
.expand-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
.expr {
  font-size: 14px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.amount {
  color: var(--expense);
  font-size: 34px;
  font-weight: 700;
  white-space: nowrap;
  transition: color 0.15s;
}
.amount small {
  font-size: 20px;
  margin-right: 2px;
}
.amount.income {
  color: var(--income);
}
.amount.empty {
  color: var(--expense-soft);
}
.amount.income.empty {
  color: var(--income-soft);
}
.shake {
  animation: shake 0.36s ease;
}
@keyframes shake {
  20%,
  60% {
    transform: translateX(-6px);
  }
  40%,
  80% {
    transform: translateX(6px);
  }
}
.saved-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  position: absolute;
  left: 50%;
  top: -22px;
  transform: translateX(-50%);
  z-index: 1;
  white-space: nowrap;
  font-size: 12px;
  color: var(--success);
  background: rgba(45, 184, 122, 0.12);
  padding: 3px 10px;
  border-radius: 999px;
}
.saved-enter-active,
.saved-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.saved-enter-from,
.saved-leave-to {
  opacity: 0;
  transform: translateX(-50%) scale(0.9);
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
  position: relative;
  display: flex;
  align-items: center;
  background: var(--bg);
  border-radius: 10px;
  padding: 0 12px;
  font-size: 13px;
  white-space: nowrap;
  color: var(--primary);
  font-weight: 600;
}
.date input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  border: none;
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
  gap: 6px;
}
.key {
  display: grid;
  place-items: center;
  height: 42px;
  border-radius: 12px;
  background: var(--bg);
  font-size: 20px;
  font-family: var(--mono);
}
.key {
  transition: background 0.1s, transform 0.08s;
}
.key:active {
  background: #e5e5ea;
  transform: scale(0.96);
}
.key.op {
  color: var(--primary);
  background: var(--primary-soft);
}
.key.off {
  color: var(--text-faint);
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
.submit.single {
  grid-template-columns: 1fr;
}
.submit button {
  height: 46px;
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: opacity 0.15s, transform 0.08s;
}
.done.idle {
  opacity: 0.55;
}
.submit button:active {
  transform: scale(0.98);
}
.spinner {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.submit button:disabled {
  opacity: 0.6;
}
</style>
