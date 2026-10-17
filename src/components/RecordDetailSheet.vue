<script setup lang="ts">
import { computed, ref } from 'vue'
import BottomSheet from './BottomSheet.vue'
import CategoryIcon from './CategoryIcon.vue'
import type { LedgerRecord } from '../types'
import { recordColor, recordIcon } from '../utils/categories'
import { formatFullDate, formatMoney } from '../utils/format'
import { debtOf, isTreat, shareOf, treaterOf } from '../utils/settlement'
import { useBooks } from '../composables/useBooks'
import { useRecords } from '../composables/useRecords'
import { confirmAction, haptic, openEditSheet } from '../composables/useUi'
import AppIcon from './AppIcon.vue'
import { toast } from '../composables/useToast'

const props = defineProps<{ record: LedgerRecord | null }>()
const emit = defineEmits<{ close: [] }>()

const { myUid, nameOf, otherUid } = useBooks()
const { deleteRecord } = useRecords()
const deleting = ref(false)

const r = computed(() => props.record)

const splitText = computed(() => {
  const rec = r.value
  if (!rec || rec.type === 'personal') return '个人'
  if (isTreat(rec)) return `${nameOf(treaterOf(rec, otherUid))} 请客`
  const mine = shareOf(rec, myUid.value)
  return `AA ${mine}:${10 - mine}（我:TA）`
})

const debtText = computed(() => {
  const rec = r.value
  if (!rec || rec.kind !== 'expense') return ''
  const debt = debtOf(rec)
  if (!debt) return ''
  const debtor = otherUid(rec.payerUid)
  // 不说「欠 / 应付」，只说各自那份由谁先垫
  return `${nameOf(debtor)}的那份 ${formatMoney(debt)}，${nameOf(rec.payerUid)}先垫了`
})

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
        <div v-if="debtText"><dt>分摊</dt><dd>{{ debtText }}</dd></div>
        <div v-if="r.note"><dt>备注</dt><dd class="note">{{ r.note }}</dd></div>
        <div><dt>记录人</dt><dd>{{ nameOf(r.createdBy) }}</dd></div>
      </dl>

      <div class="actions">
        <button class="delete" :disabled="deleting" @click="onDelete">
          <AppIcon name="close" :size="16" :stroke="2.2" />{{ deleting ? '删除中…' : '删除' }}
        </button>
        <button class="edit" :disabled="deleting" @click="onEdit">
          <AppIcon name="pencil" :size="16" :stroke="2" />编辑
        </button>
      </div>
    </template>
  </BottomSheet>
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
.actions {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 10px;
  margin-top: 14px;
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
  opacity: 0.6;
}
.delete {
  background: #fff0f3;
  color: #f0547a;
}
.edit {
  background: var(--primary);
  color: #fff;
}
</style>
