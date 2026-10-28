<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import BottomSheet from './BottomSheet.vue'
import DiscussionThread from './DiscussionThread.vue'
import type { DiscussionEntry, LedgerRecord } from '../types'
import { useBooks } from '../composables/useBooks'
import { formatMoney } from '../utils/format'
import { shareOf } from '../utils/settlement'

/**
 * 「有疑问」/「回复 TA」弹窗：写一句话；共同支出还可以直接提议比例（我 : TA）。
 */
const props = defineProps<{
  open: boolean
  mode: 'dispute' | 'reply'
  /** 弹窗标题里显示的是哪一笔 */
  label: string
  amount: number
  /** 借款可能是外币 */
  currency?: string
  /** 只有共同支出账单才能提议比例 */
  record?: LedgerRecord | null
  /** 不是账单时的快捷原因（借款 / 还款） */
  quickOptions?: string[]
  discussion?: DiscussionEntry[]
  saving?: boolean
}>()
const emit = defineEmits<{ close: []; submit: [{ text: string; ratio: number | null }] }>()

const { myUid, partner } = useBooks()
const partnerName = computed(() => partner.value?.displayName ?? 'TA')

const TEXT_MAX = 100
const text = ref('')
const proposing = ref(false)
/** 我承担的份额（滑条左边是我） */
const myShare = ref(5)
const tried = ref(false)

// 付钱的人至少承担一成：不会提议成「我付钱却算 TA 请客」
const iPaid = computed(() => props.record?.payerUid === myUid.value)
const shareMin = computed(() => (iPaid.value ? 1 : 0))
const shareMax = computed(() => (iPaid.value ? 10 : 9))

const canPropose = computed(() => props.mode === 'dispute' && props.record?.type === 'shared' && props.record.kind === 'expense')
/** 快捷原因：多选，再点一次取消；账单和借款 / 还款的选项不一样 */
const quick = computed(() =>
  props.record ? ['金额不对', '不是共同的', '比例不对', '日期不对', '没有这笔'] : props.quickOptions ?? ['金额不对', '日期不对', '没有这笔'],
)
const picked = ref<string[]>([])

watch(
  () => props.open,
  (open) => {
    if (!open) return
    text.value = ''
    picked.value = []
    tried.value = false
    proposing.value = false
    myShare.value = Math.min(shareMax.value, Math.max(shareMin.value, props.record ? shareOf(props.record, myUid.value) : 5))
  },
)

const pick = (q: string) => {
  const on = picked.value.includes(q)
  // 保持按钮的顺序，发出去的文字读起来顺
  picked.value = quick.value.filter((x) => (x === q ? !on : picked.value.includes(x)))
  if (q === '比例不对' && canPropose.value) proposing.value = !on
}
/** 发出去的一句话：选中的原因 + 自己写的 */
const message = computed(() => [...picked.value, text.value.trim()].filter(Boolean).join('，'))

const sliderStyle = computed(() => {
  const pct = myShare.value * 10
  return { background: `linear-gradient(90deg, var(--me) 0%, var(--me) ${pct}%, var(--partner) ${pct}%, var(--partner) 100%)` }
})
const shareText = computed(() => {
  if (myShare.value === 10) return '我全出'
  if (myShare.value === 0) return `${partnerName.value} 全出`
  return myShare.value === 5 ? '平摊' : `我 ${myShare.value * 10}% · ${partnerName.value} ${(10 - myShare.value) * 10}%`
})

const error = computed(() => {
  if (text.value.trim().length > TEXT_MAX) return `最多 ${TEXT_MAX} 个字`
  if (!message.value && !proposing.value) return props.mode === 'reply' ? '写点什么再发吧' : '说说哪里不对，或者提议一个比例'
  return ''
})

const submit = () => {
  tried.value = true
  if (error.value || props.saving) return
  const r = props.record
  const ratio =
    proposing.value && r
      ? // 存「付款人份额」，和账单一致
        r.payerUid === myUid.value
        ? myShare.value
        : 10 - myShare.value
      : null
  emit('submit', { text: message.value || `提议改成 ${shareText.value}`, ratio })
}
</script>

<template>
  <BottomSheet :open="open" @close="emit('close')">
    <h3 class="title">{{ mode === 'dispute' ? '这笔有疑问' : '回复 TA' }}</h3>
    <p class="target">{{ label }} · <b class="mono">{{ formatMoney(amount, currency) }}</b></p>

    <DiscussionThread v-if="discussion?.length" :entries="discussion" :record="record" class="thread" />

    <div v-if="mode === 'dispute'" class="quick">
      <button v-for="q in quick" :key="q" :class="{ on: picked.includes(q) }" :aria-pressed="picked.includes(q)" @click="pick(q)">
        <AppIcon v-if="picked.includes(q)" name="check" :size="12" :stroke="2.6" />{{ q }}
      </button>
    </div>

    <textarea
      v-model="text"
      :maxlength="TEXT_MAX + 10"
      rows="3"
      :placeholder="mode === 'dispute' ? (picked.length ? '还想补充点什么（可不填）' : '比如：这顿不是说好你请吗～') : '比如：那天是我们一起吃的呀'"
    />
    <p class="count">{{ text.trim().length }}/{{ TEXT_MAX }}</p>

    <template v-if="canPropose">
      <button :class="['propose-toggle', { on: proposing }]" @click="proposing = !proposing">
        <AppIcon :name="proposing ? 'check' : 'plus'" :size="15" :stroke="2.4" />提议一个比例
      </button>
      <div v-if="proposing" class="ratio">
        <div class="ratio-head">
          <span class="who me">我 <b class="mono">{{ myShare }}</b></span>
          <span class="share">{{ shareText }}</span>
          <span class="who partner"><b class="mono">{{ 10 - myShare }}</b> {{ partnerName }}</span>
        </div>
        <input v-model.number="myShare" type="range" :min="shareMin" :max="shareMax" step="1" class="slider" :style="sliderStyle" aria-label="提议的比例" />
        <p class="hint">TA 一键就能按这个比例改好；付钱的人不能一分不出<template v-if="!iPaid">（想说是 TA 请客的话，就拉到「TA 全出」）</template></p>
      </div>
    </template>

    <p v-if="tried && error" class="err">{{ error }}</p>
    <button class="send" :disabled="saving" @click="submit">
      {{ saving ? '发送中…' : mode === 'dispute' ? '告诉 TA' : '回复并请 TA 再确认' }}
    </button>
  </BottomSheet>
</template>

<style scoped>
.title {
  margin: 0;
  text-align: center;
  font-size: 16px;
}
.target {
  margin: 4px 0 12px;
  text-align: center;
  font-size: 13px;
  color: var(--text-soft);
}
.thread {
  margin-bottom: 12px;
}
.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.quick button {
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 13px;
  background: var(--bg);
  color: var(--text-soft);
}
.quick button {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border: 1.5px solid transparent;
}
.quick button.on {
  background: var(--primary-soft);
  color: var(--primary);
  border-color: var(--primary);
  font-weight: 600;
}
textarea {
  width: 100%;
  box-sizing: border-box;
  border: none;
  border-radius: 12px;
  background: var(--bg);
  padding: 12px 14px;
  font: inherit;
  font-size: 16px;
  resize: none;
  outline: none;
}
.count {
  margin: 2px 4px 8px;
  text-align: right;
  font-size: 11px;
  color: var(--text-faint);
}
.propose-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--primary);
  background: var(--primary-soft);
}
.propose-toggle.on {
  background: var(--primary);
  color: #fff;
}
.ratio {
  margin-top: 8px;
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
.hint {
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--text-faint);
}
.err {
  margin: 8px 4px 0;
  font-size: 12px;
  color: var(--danger);
}
.send {
  width: 100%;
  height: 48px;
  margin-top: 14px;
  border-radius: 14px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  font-size: 16px;
}
.send:disabled {
  opacity: 0.6;
}
.mono {
  font-family: var(--mono);
}
</style>
