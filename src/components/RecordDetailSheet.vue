<script setup lang="ts">
import { computed, ref } from 'vue'
import BottomSheet from './BottomSheet.vue'
import CategoryIcon from './CategoryIcon.vue'
import DiscussionThread from './DiscussionThread.vue'
import DisputeSheet from './DisputeSheet.vue'
import type { LedgerRecord } from '../types'
import { recordColor, recordIcon } from '../utils/categories'
import { formatFullDate, formatMoney } from '../utils/format'
import { isTreat, shareOf, treaterOf } from '../utils/settlement'
import { useBooks } from '../composables/useBooks'
import { canModify, useRecords } from '../composables/useRecords'
import { confirmAction, haptic, openEditSheet } from '../composables/useUi'
import AppIcon from './AppIcon.vue'
import { toast } from '../composables/useToast'
import { canRespond, confirmLabel, disputedByPartner, pendingProposal } from '../utils/confirm'

const props = defineProps<{ record: LedgerRecord | null }>()
const emit = defineEmits<{ close: [] }>()

const { myUid, nameOf, otherUid } = useBooks()
const { deleteRecord, respondRecords, replyRecord, updateRecord } = useRecords()
const deleting = ref(false)
const editable = computed(() => (r.value ? canModify(r.value, myUid.value) : false))

const r = computed(() => props.record)

const splitText = computed(() => {
  const rec = r.value
  if (!rec || rec.type === 'personal') return '个人'
  if (isTreat(rec)) return `${nameOf(treaterOf(rec, otherUid))} 请客`
  const mine = shareOf(rec, myUid.value)
  return `AA ${mine}:${10 - mine}（我:TA）${rec.settledOnSpot ? ' · 已结清' : ''}`
})

const responding = ref(false)
const onConfirm = async () => {
  const rec = r.value
  if (!rec) return
  responding.value = true
  const { error } = await respondRecords([rec.id], 'confirmed')
  responding.value = false
  if (error) {
    toast.error(error.message)
    return
  }
  haptic()
  toast.success('已确认')
}

// ── 有疑问 / 回复：弹窗写留言（有疑问时还能提议比例） ──
const sheetMode = ref<'dispute' | 'reply' | null>(null)
const onSubmitMessage = async (msg: { text: string; ratio: number | null }) => {
  const rec = r.value
  if (!rec || !sheetMode.value) return
  responding.value = true
  const { error } =
    sheetMode.value === 'dispute' ? await respondRecords([rec.id], 'disputed', msg) : await replyRecord(rec.id, msg.text)
  responding.value = false
  if (error) {
    toast.error(error.message)
    return
  }
  haptic()
  toast.success(sheetMode.value === 'dispute' ? '已经告诉 TA 了' : '已回复，等 TA 再确认')
  sheetMode.value = null
}

/** 对方有疑问并提议了比例：记账人可以一键按这个比例改，改完直接算确认 */
const proposal = computed(() => (r.value ? pendingProposal(r.value, myUid.value) : null))
const proposalText = computed(() => {
  const rec = r.value
  if (!rec || proposal.value === null) return ''
  const mine = rec.payerUid === myUid.value ? proposal.value : 10 - proposal.value
  return mine === 10 ? '我全出' : mine === 0 ? 'TA 全出' : `${mine}:${10 - mine}`
})
const acceptProposal = async () => {
  const rec = r.value
  if (!rec || proposal.value === null) return
  responding.value = true
  const { amount, kind, type, payerUid, category, subCategory, note, date } = rec
  const { error } = await updateRecord(rec.id, { amount, kind, type, payerUid, ratio: proposal.value, category, subCategory, note, date })
  responding.value = false
  if (error) {
    toast.error(error.message)
    return
  }
  haptic()
  toast.success('已按 TA 说的改好了')
}

const onEdit = () => {
  const rec = r.value
  if (!rec) return
  emit('close')
  openEditSheet(rec)
}

const onDelete = async () => {
  const rec = r.value
  if (!rec) return
  const ok = await confirmAction({
    title: '删除这笔账单？',
    message: `${rec.subCategory || rec.category} ${formatMoney(rec.amount)}，删除后两个人都看不到，且无法恢复。`,
    confirmText: '删除',
    danger: true,
  })
  if (!ok) return
  deleting.value = true
  const { error } = await deleteRecord(rec.id)
  deleting.value = false
  if (error) {
    toast.error(error.message, { title: '删除失败' })
    return
  }
  haptic()
  toast.success('已删除')
  emit('close')
}
</script>

<template>
  <BottomSheet :open="!!record" @close="emit('close')">
    <template v-if="r">
      <div class="hero">
        <CategoryIcon :name="recordIcon(r.category, r.subCategory)" :color="recordColor(r.category)" :size="56" />
        <p class="cat">{{ r.category }}<template v-if="r.subCategory"> · {{ r.subCategory }}</template></p>
        <p :class="['amount', { income: r.kind === 'income' }]">
          {{ r.kind === 'income' ? '+' : '-' }}{{ formatMoney(r.amount) }}
        </p>
      </div>

      <dl class="rows">
        <div><dt>日期</dt><dd>{{ formatFullDate(r.date) }}</dd></div>
        <div>
          <dt>付款人</dt>
          <dd><i :class="['dot', r.payerUid === myUid ? 'me' : 'partner']" />{{ nameOf(r.payerUid) }}</dd>
        </div>
        <div><dt>类型</dt><dd>{{ splitText }}</dd></div>
        <div v-if="r.type === 'shared'">
          <dt>确认</dt>
          <dd :class="['confirm', r.confirmStatus]">
            {{ confirmLabel(r, myUid) }}
            <small v-if="r.confirmStatus !== 'confirmed'">确认前先全算 {{ nameOf(r.payerUid) }} 的</small>
          </dd>
        </div>
        <div v-if="r.note"><dt>备注</dt><dd class="note">{{ r.note }}</dd></div>
        <div><dt>记录人</dt><dd>{{ nameOf(r.createdBy) }}</dd></div>
      </dl>

      <section v-if="r.discussion.length" class="talk">
        <h4>{{ disputedByPartner(r, myUid) ? 'TA 有疑问' : '沟通记录' }}</h4>
        <DiscussionThread :entries="r.discussion" :record="r" />
        <div v-if="disputedByPartner(r, myUid)" class="talk-actions">
          <button v-if="proposal !== null" class="accept" :disabled="responding" @click="acceptProposal">
            按 TA 说的改成 {{ proposalText }}
          </button>
          <button class="reply" :disabled="responding" @click="sheetMode = 'reply'">回复 TA</button>
        </div>
        <p v-if="disputedByPartner(r, myUid)" class="talk-hint">也可以直接「编辑」改，改完会再请 TA 确认</p>
      </section>

      <!-- 底部固定：删除（左）/ 编辑（右），内容再长也不会被挤到看不见 -->
      <div class="actions">
        <template v-if="canRespond(r, myUid)">
          <p class="readonly">{{ nameOf(r.lastEditedBy) }} 把这笔记成了共同的，确认后才算两个人的</p>
          <button class="ask" :disabled="responding" @click="sheetMode = 'dispute'">有疑问</button>
          <button class="confirm-btn" :disabled="responding" @click="onConfirm">
            <AppIcon name="check" :size="16" :stroke="2.4" />确认
          </button>
        </template>
        <p v-if="!editable" class="readonly">这是 {{ nameOf(r.payerUid) }} 的个人记录，只能看，不能修改</p>
        <button class="delete" :disabled="deleting || !editable" @click="onDelete">
          <AppIcon name="close" :size="16" :stroke="2.2" />{{ deleting ? '删除中…' : '删除' }}
        </button>
        <button class="edit" :disabled="deleting || !editable" @click="onEdit">
          <AppIcon name="pencil" :size="16" :stroke="2" />编辑
        </button>
      </div>
    </template>
  </BottomSheet>

  <DisputeSheet
    :open="!!r && !!sheetMode"
    :mode="sheetMode ?? 'dispute'"
    :label="r ? r.note || r.subCategory || r.category : ''"
    :amount="r?.amount ?? 0"
    :record="r"
    :discussion="sheetMode === 'reply' ? undefined : r?.discussion"
    :saving="responding"
    @close="sheetMode = null"
    @submit="onSubmitMessage"
  />
</template>

<style scoped>
.hero {
  text-align: center;
  padding: 16px 0;
  border-radius: 16px;
  margin-bottom: 12px;
}
.cat {
  margin: 8px 0 2px;
  font-size: 14px;
  color: var(--text-soft);
}
.amount {
  margin: 0;
  font-family: var(--mono);
  font-size: 30px;
  font-weight: 700;
  color: var(--expense);
}
.amount.income {
  color: var(--income);
}
.rows {
  margin: 0;
  background: var(--bg);
  border-radius: 14px;
  padding: 2px 14px;
}
.rows div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 11px 0;
  font-size: 14px;
}
.rows div + div {
  border-top: 1px solid var(--line);
}
dt {
  color: var(--text-soft);
  flex-shrink: 0;
}
dd {
  margin: 0;
  text-align: right;
  display: flex;
  align-items: center;
  gap: 6px;
}
.note {
  word-break: break-all;
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
.readonly {
  grid-column: 1 / -1;
  margin: 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-faint);
}
.actions {
  position: sticky;
  bottom: calc(-16px - env(safe-area-inset-bottom, 0px));
  z-index: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 14px -16px calc(-16px - env(safe-area-inset-bottom, 0px));
  padding: 12px 16px calc(16px + env(safe-area-inset-bottom, 0px));
  background: var(--card);
  box-shadow: 0 -8px 16px -12px rgba(0, 0, 0, 0.15);
}
.actions button {
  height: 48px;
  border-radius: 14px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.actions button:active {
  transform: scale(0.98);
}
.actions button:disabled {
  opacity: 0.45;
}
.delete {
  background: #fff0f3;
  color: #f0547a;
}
.talk {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--bg);
}
.talk h4 {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--text-soft);
}
.talk-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
.talk-actions button {
  flex: 1;
  height: 40px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
}
.accept {
  background: var(--primary);
  color: #fff;
}
.reply {
  background: var(--card);
  color: var(--primary);
}
.talk-hint {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--text-faint);
  text-align: center;
}
.confirm small {
  display: block;
  font-size: 11px;
  color: var(--text-faint);
}
.confirm.pending {
  color: #d97800;
}
.confirm.disputed {
  color: var(--danger);
}
.ask {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-soft);
}
.confirm-btn {
  background: #34b38a;
  color: #fff;
}
.edit {
  background: var(--primary);
  color: #fff;
}
</style>
