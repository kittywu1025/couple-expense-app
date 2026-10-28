<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import CategoryIcon from '../components/CategoryIcon.vue'
import EmptyState from '../components/EmptyState.vue'
import PushPage from '../components/PushPage.vue'
import { useBooks } from '../composables/useBooks'
import { useRecords } from '../composables/useRecords'
import { confirmAction, haptic, settlePageOpen } from '../composables/useUi'
import { toast } from '../composables/useToast'
import type { LedgerRecord } from '../types'
import { recordColor, recordIcon } from '../utils/categories'
import { formatDateLabel, formatMoney, toDateKey } from '../utils/format'
import { isAgreed, isTreat } from '../utils/settlement'

/**
 * 结清（像报销）：AA 账单里没付钱那位的那份，给了之后由先垫钱的人勾选「已收到」。
 * 已收到的照常算各自承担，但不再进月末差额。只看两个人都确认过的 AA。
 */
const { myUid, partner, nameOf } = useBooks()
const { records, setSettled } = useRecords()
const partnerName = computed(() => partner.value?.displayName ?? 'TA')

/** 没付钱那位的那份 */
const theirPart = (r: LedgerRecord) => (r.amount * (10 - r.ratio)) / 10

const aa = computed(() =>
  records.value.filter((r) => r.kind === 'expense' && r.type === 'shared' && isAgreed(r) && !isTreat(r)),
)
/** 我先垫的：TA 那份等我收 */
const toReceive = computed(() => aa.value.filter((r) => r.payerUid === myUid.value && !r.settledOnSpot))
/** TA 先垫的：我那份等 TA 收 */
const toPay = computed(() => aa.value.filter((r) => r.payerUid !== myUid.value && !r.settledOnSpot))
const settled = computed(() =>
  aa.value
    .filter((r) => r.settledOnSpot)
    .sort((a, b) => (b.settledAt ?? '').localeCompare(a.settledAt ?? '') || b.date.localeCompare(a.date)),
)
const sum = (list: LedgerRecord[]) => list.reduce((s, r) => s + theirPart(r), 0)

type Tab = 'receive' | 'pay' | 'done'
const tab = ref<Tab>('receive')

// ── 多选（只有「TA 该给我」能选） ──
const picked = ref<string[]>([])
watch(toReceive, (list) => {
  picked.value = picked.value.filter((id) => list.some((r) => r.id === id))
})
const toggle = (id: string) => {
  picked.value = picked.value.includes(id) ? picked.value.filter((x) => x !== id) : [...picked.value, id]
}
const allPicked = computed(() => toReceive.value.length > 0 && picked.value.length === toReceive.value.length)
const toggleAll = () => {
  picked.value = allPicked.value ? [] : toReceive.value.map((r) => r.id)
}
const pickedTotal = computed(() => sum(toReceive.value.filter((r) => picked.value.includes(r.id))))

const saving = ref(false)
const markReceived = async () => {
  if (!picked.value.length || saving.value) return
  const ok = await confirmAction({
    title: `收到 ${formatMoney(pickedTotal.value)} 了？`,
    message: `${picked.value.length} 笔里 ${partnerName.value} 的那份会记为已收到，不再进月末差额。`,
    confirmText: '已收到',
  })
  if (!ok) return
  saving.value = true
  // 结清后列表会变，先记下笔数
  const count = picked.value.length
  const { error } = await setSettled(picked.value, true)
  saving.value = false
  if (error) {
    toast.error(error.message)
    return
  }
  haptic()
  toast.success(`已结清 ${count} 笔`)
  picked.value = []
}

const undo = async (r: LedgerRecord) => {
  const ok = await confirmAction({
    title: '撤销结清？',
    message: `${r.note || r.subCategory || r.category} 里 ${partnerName.value} 的那份会回到「还没给」，重新算进月末差额。`,
    confirmText: '撤销',
  })
  if (!ok) return
  const { error } = await setSettled([r.id], false)
  if (error) toast.error(error.message)
  else toast.success('已撤销')
}

const title = (r: LedgerRecord) => r.note || r.subCategory || r.category
const settledDay = (r: LedgerRecord) => (r.settledAt ? formatDateLabel(toDateKey(new Date(r.settledAt))) : '')
</script>

<template>
  <PushPage title="结清" back-label="返回" @back="settlePageOpen = false">
    <section class="summary">
      <button :class="{ on: tab === 'receive' }" @click="tab = 'receive'">
        <span>{{ partnerName }}还没给我</span>
        <b class="mono">{{ formatMoney(sum(toReceive)) }}</b>
        <small>{{ toReceive.length }} 笔</small>
      </button>
      <button :class="{ on: tab === 'pay' }" @click="tab = 'pay'">
        <span>我还没给{{ partnerName }}</span>
        <b class="mono">{{ formatMoney(sum(toPay)) }}</b>
        <small>{{ toPay.length }} 笔</small>
      </button>
    </section>
    <p class="tip">AA 的那份给了之后，由先垫钱的人在这里勾「已收到」；结清的照常算各自花了多少，只是不再进月末差额。</p>

    <div class="tabs">
      <button :class="{ on: tab === 'receive' }" @click="tab = 'receive'">{{ partnerName }}该给我</button>
      <button :class="{ on: tab === 'pay' }" @click="tab = 'pay'">我该给{{ partnerName }}</button>
      <button :class="{ on: tab === 'done' }" @click="tab = 'done'">已结清 {{ settled.length || '' }}</button>
    </div>

    <!-- TA 该给我：可多选，标记已收到 -->
    <template v-if="tab === 'receive'">
      <section v-if="!toReceive.length" class="empty">
        <EmptyState icon="check" title="都结清啦" :desc="`没有等${partnerName}给你的 AA 了`" />
      </section>
      <section v-else class="group">
        <button class="select-all" @click="toggleAll">
          <i :class="['box', { on: allPicked }]"><AppIcon v-if="allPicked" name="check" :size="12" :stroke="3" /></i>
          全选
        </button>
        <button v-for="r in toReceive" :key="r.id" class="item" @click="toggle(r.id)">
          <i :class="['box', { on: picked.includes(r.id) }]">
            <AppIcon v-if="picked.includes(r.id)" name="check" :size="12" :stroke="3" />
          </i>
          <CategoryIcon :name="recordIcon(r.category, r.subCategory)" :color="recordColor(r.category)" :size="34" />
          <span class="info">
            <span class="line"><span class="name">{{ title(r) }}</span><b class="mono">{{ formatMoney(theirPart(r)) }}</b></span>
            <span class="sub">{{ formatDateLabel(r.date) }} · 共 {{ formatMoney(r.amount) }} · {{ partnerName }}承担 {{ (10 - r.ratio) * 10 }}%</span>
          </span>
        </button>
      </section>
    </template>

    <!-- 我该给 TA：只能看，TA 收到后由 TA 勾 -->
    <template v-else-if="tab === 'pay'">
      <section v-if="!toPay.length" class="empty">
        <EmptyState icon="check" title="都结清啦" :desc="`没有欠着${partnerName}的 AA 了`" />
      </section>
      <template v-else>
        <p class="hint">给了 {{ partnerName }} 之后，请 TA 在 TA 的「结清」里勾「已收到」</p>
        <section class="group">
          <div v-for="r in toPay" :key="r.id" class="item static">
            <CategoryIcon :name="recordIcon(r.category, r.subCategory)" :color="recordColor(r.category)" :size="34" />
            <span class="info">
              <span class="line"><span class="name">{{ title(r) }}</span><b class="mono">{{ formatMoney(theirPart(r)) }}</b></span>
              <span class="sub">{{ formatDateLabel(r.date) }} · 共 {{ formatMoney(r.amount) }} · {{ nameOf(r.payerUid) }}先垫</span>
            </span>
          </div>
        </section>
      </template>
    </template>

    <!-- 已结清 -->
    <template v-else>
      <section v-if="!settled.length" class="empty">
        <EmptyState icon="receipt" title="还没有结清过" desc="结清的 AA 会在这里留个记录" />
      </section>
      <section v-else class="group">
        <div v-for="r in settled" :key="r.id" class="item static">
          <CategoryIcon :name="recordIcon(r.category, r.subCategory)" :color="recordColor(r.category)" :size="34" />
          <span class="info">
            <span class="line"><span class="name">{{ title(r) }}</span><b class="mono">{{ formatMoney(theirPart(r)) }}</b></span>
            <span class="sub">
              {{ formatDateLabel(r.date) }} · {{ r.payerUid === myUid ? `${partnerName}给我` : `我给${partnerName}` }}
              <template v-if="settledDay(r)"> · {{ settledDay(r) }}收到</template>
            </span>
          </span>
          <button v-if="r.payerUid === myUid" class="undo" @click="undo(r)">撤销</button>
        </div>
      </section>
    </template>

    <div v-if="tab === 'receive' && picked.length" class="bar">
      <span>已选 {{ picked.length }} 笔 · <b class="mono">{{ formatMoney(pickedTotal) }}</b></span>
      <button :disabled="saving" @click="markReceived">{{ saving ? '保存中…' : '已收到' }}</button>
    </div>
  </PushPage>
</template>

<style scoped>
.summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.summary button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 14px;
  border-radius: var(--radius);
  background: var(--card);
  border: 1.5px solid transparent;
  text-align: left;
}
.summary button.on {
  border-color: var(--primary-soft);
}
.summary span {
  font-size: 12px;
  color: var(--text-soft);
}
.summary b {
  font-size: 20px;
  margin: 2px 0;
}
.summary small {
  font-size: 11px;
  color: var(--text-faint);
}
.tip {
  margin: 8px 4px 12px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-faint);
}
.tabs {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  background: rgba(0, 0, 0, 0.05);
  border-radius: 10px;
  padding: 2px;
  margin-bottom: 12px;
}
.tabs button {
  padding: 7px 0;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-soft);
}
.tabs button.on {
  background: var(--card);
  color: var(--primary);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
.empty {
  background: var(--card);
  border-radius: var(--radius);
  padding: 8px 0;
}
.hint {
  margin: 0 4px 8px;
  font-size: 12px;
  color: var(--text-soft);
}
.group {
  background: var(--card);
  border-radius: var(--radius);
  padding: 0 14px;
  margin-bottom: 90px;
}
.select-all {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 0;
  font-size: 13px;
  color: var(--text-soft);
  border-bottom: 1px solid var(--line);
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 0;
  text-align: left;
}
.item + .item {
  border-top: 1px solid var(--line);
}
.box {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 6px;
  border: 1.5px solid #c7c7cc;
  color: #fff;
}
.box.on {
  background: var(--primary);
  border-color: var(--primary);
}
.info {
  flex: 1;
  min-width: 0;
}
.line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 14px;
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sub {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-faint);
}
.undo {
  flex-shrink: 0;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-soft);
  background: var(--bg);
}
.bar {
  position: fixed;
  left: 50%;
  bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  width: min(528px, calc(100% - 32px));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 10px 10px 16px;
  border-radius: 16px;
  background: var(--card);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  font-size: 14px;
}
.bar button {
  height: 40px;
  padding: 0 20px;
  border-radius: 12px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
}
.bar button:disabled {
  opacity: 0.6;
}
.mono {
  font-family: var(--mono);
}
</style>
