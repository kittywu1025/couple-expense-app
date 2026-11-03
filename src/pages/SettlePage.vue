<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import CategoryIcon from '../components/CategoryIcon.vue'
import EmptyState from '../components/EmptyState.vue'
import PushPage from '../components/PushPage.vue'
import { useBooks } from '../composables/useBooks'
import { nudgeReadyAt, useRecords } from '../composables/useRecords'
import { confirmAction, haptic, settlePageOpen } from '../composables/useUi'
import { toast } from '../composables/useToast'
import type { LedgerRecord } from '../types'
import { recordColor, recordIcon } from '../utils/categories'
import { formatDateLabel, formatMoney, toDateKey } from '../utils/format'
import { amountSplitText, isAgreed, isAmountSplit, isTreat, otherPart } from '../utils/settlement'

/**
 * 结清（像报销）：AA 账单里没付钱那位的那份，给了之后由先垫钱的人勾选「已收到」。
 * 没付钱的那位也可以先勾「我给了」告诉对方，对方确认收到或说没收到。
 * 已收到的照常算各自承担，但不再进月末差额。只看两个人都确认过的 AA。
 */
const { myUid, partner, nameOf } = useBooks()
const { records, loadRecords, setSettled, setPaidClaim, bouncedClaims, dismissBounced, nudgeClaims } = useRecords()
const partnerName = computed(() => partner.value?.displayName ?? 'TA')

/** 没付钱那位的那份 */
const theirPart = (r: LedgerRecord) => otherPart(r)

const aa = computed(() =>
  records.value.filter((r) => r.kind === 'expense' && r.type === 'shared' && isAgreed(r) && !isTreat(r)),
)
/** TA 说已经给了的排在前面 */
const claimedFirst = (list: LedgerRecord[]) => [...list].sort((a, b) => Number(!!b.paidClaimedAt) - Number(!!a.paidClaimedAt))
/** 我先垫的：TA 那份等我收 */
const toReceive = computed(() => claimedFirst(aa.value.filter((r) => r.payerUid === myUid.value && !r.settledOnSpot)))
/** TA 先垫的：我那份等 TA 收 */
const toPay = computed(() => claimedFirst(aa.value.filter((r) => r.payerUid !== myUid.value && !r.settledOnSpot)))
/** TA 说给了、等我确认收到的 */
const claimedToMe = computed(() => toReceive.value.filter((r) => r.paidClaimedAt))
/** 我说给了、等 TA 确认的 */
const claimedByMe = computed(() => toPay.value.filter((r) => r.paidClaimedAt))
// ── 提醒 TA：说了「我给了」12 小时 TA 还没确认，可以提醒一次，之后每 12 小时一次 ──
const now = ref(Date.now())
const clock = setInterval(() => (now.value = Date.now()), 60_000)
onBeforeUnmount(() => clearInterval(clock))
const nudgeable = computed(() => claimedByMe.value.filter((r) => nudgeReadyAt(r) <= now.value))
const nudgeHours = computed(() => {
  const next = Math.min(...claimedByMe.value.map(nudgeReadyAt))
  return Math.max(1, Math.ceil((next - now.value) / 3_600_000))
})
const nudging = ref(false)
const nudge = async () => {
  if (nudging.value) return
  nudging.value = true
  const { error } = await nudgeClaims(nudgeable.value.map((r) => r.id))
  nudging.value = false
  now.value = Date.now()
  if (error) toast.error(error.message)
  else toast.success(`已提醒${partnerName.value}，TA 下次打开时会看到`)
}

/** 还没说给了的，才能勾「我给了」 */
const payable = computed(() => toPay.value.filter((r) => !r.paidClaimedAt))
const settled = computed(() =>
  aa.value
    .filter((r) => r.settledOnSpot)
    .sort((a, b) => (b.settledAt ?? '').localeCompare(a.settledAt ?? '') || b.date.localeCompare(a.date)),
)
const sum = (list: LedgerRecord[]) => list.reduce((s, r) => s + theirPart(r), 0)

/** TA 退回来的「我给了」（没收到 / 改了金额），在「我该给 TA」里标出来 */
const bounced = computed(() => toPay.value.filter((r) => bouncedClaims.value.some((b) => b.id === r.id)))
const isBounced = (r: LedgerRecord) => bounced.value.some((b) => b.id === r.id)

type Tab = 'receive' | 'pay' | 'done'
const tab = ref<Tab>(!claimedToMe.value.length && bounced.value.length ? 'pay' : 'receive')

/**
 * 动手前先拉一下最新的：TA 可能刚改了金额、撤回了「我给了」或者已经点了收到。
 * 选中的几笔有变化就停下来让我再看一眼，免得按旧金额结清。
 */
const fingerprint = (ids: string[]) =>
  ids
    .map((id) => records.value.find((r) => r.id === id))
    .map((r) => (r ? `${r.id}:${r.amount}:${r.ratio}:${r.payerUid}:${r.confirmStatus}:${!!r.settledOnSpot}:${!!r.paidClaimedAt}` : 'gone'))
    .join('|')
const stillSame = async (ids: string[]) => {
  const before = fingerprint(ids)
  await loadRecords()
  if (fingerprint(ids) === before) return true
  toast.error(`${partnerName.value}刚改过这几笔，再看一下`)
  return false
}

// ── 多选：「TA 该给我」勾已收到，「我该给 TA」勾我给了；换 tab 清空 ──
const picked = ref<string[]>([])
const pickable = computed(() => (tab.value === 'receive' ? toReceive.value : tab.value === 'pay' ? payable.value : []))
watch(pickable, (list) => {
  picked.value = picked.value.filter((id) => list.some((r) => r.id === id))
})
watch(tab, () => {
  picked.value = []
})
const toggle = (id: string) => {
  picked.value = picked.value.includes(id) ? picked.value.filter((x) => x !== id) : [...picked.value, id]
}
const allPicked = computed(() => pickable.value.length > 0 && picked.value.length === pickable.value.length)
const toggleAll = () => {
  picked.value = allPicked.value ? [] : pickable.value.map((r) => r.id)
}
const pickedTotal = computed(() => sum(pickable.value.filter((r) => picked.value.includes(r.id))))

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
  if (!(await stillSame(picked.value))) {
    saving.value = false
    return
  }
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

/** 我该给 TA：勾选后告诉 TA「我给了」，等 TA 确认收到 */
const markPaid = async () => {
  if (!picked.value.length || saving.value) return
  const ok = await confirmAction({
    title: `给了${partnerName.value} ${formatMoney(pickedTotal.value)}？`,
    message: `会告诉${partnerName.value}你给了这 ${picked.value.length} 笔，TA 确认收到后就算结清。`,
    confirmText: '告诉 TA',
  })
  if (!ok) return
  saving.value = true
  const count = picked.value.length
  if (!(await stillSame(picked.value))) {
    saving.value = false
    return
  }
  const { error } = await setPaidClaim(picked.value, true)
  saving.value = false
  if (error) {
    toast.error(error.message)
    return
  }
  haptic()
  toast.success(`已告诉${partnerName.value}，等 TA 确认收到 ${count} 笔`)
  picked.value = []
}
const withdrawClaim = async (r: LedgerRecord) => {
  const { error } = await setPaidClaim([r.id], false)
  if (error) toast.error(error.message)
  else toast.success('已撤回')
}

/** TA 说给了：一键确认收到，或者说没收到 */
const confirmClaims = async () => {
  if (saving.value) return
  saving.value = true
  const ids = claimedToMe.value.map((r) => r.id)
  if (!(await stillSame(ids))) {
    saving.value = false
    return
  }
  const count = ids.length
  const { error } = await setSettled(ids, true)
  saving.value = false
  if (error) {
    toast.error(error.message)
    return
  }
  haptic()
  toast.success(`已结清 ${count} 笔`)
}
const rejectClaims = async () => {
  const ok = await confirmAction({
    title: '没收到？',
    message: `这 ${claimedToMe.value.length} 笔会回到「还没给」，${partnerName.value}给了之后可以再告诉你。`,
    confirmText: '没收到',
  })
  if (!ok) return
  const { error } = await setPaidClaim(claimedToMe.value.map((r) => r.id), false)
  if (error) toast.error(error.message)
  else toast.success(`已告诉${partnerName.value}还没收到`)
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

// ── 算总账：两边都有没结清的，月末一次算净额，不用一笔笔勾 ──
/** 正数：TA 净给我；负数：我净给 TA */
const net = computed(() => sum(toReceive.value) - sum(toPay.value))
const netText = computed(() =>
  Math.abs(net.value) < 0.005
    ? '两边刚好抵平'
    : net.value > 0
      ? `${partnerName.value}给我 ${formatMoney(net.value)}`
      : `我给${partnerName.value} ${formatMoney(-net.value)}`,
)
const settleAll = async () => {
  if (saving.value) return
  const ok = await confirmAction({
    title: Math.abs(net.value) < 0.005 ? '两边抵平，全部结清？' : net.value > 0 ? `收到${partnerName.value} ${formatMoney(net.value)} 了？` : `给了${partnerName.value} ${formatMoney(-net.value)}？`,
    message: `${partnerName.value}该给我 ${formatMoney(sum(toReceive.value))}，我该给${partnerName.value} ${formatMoney(sum(toPay.value))}，合在一起算是${netText.value}。我这边 ${toReceive.value.length} 笔直接结清；我该给的 ${toPay.value.length} 笔告诉 TA，TA 点一下确认收到就全部结清。`,
    confirmText: '算总账',
  })
  if (!ok) return
  saving.value = true
  const receiveIds = toReceive.value.map((r) => r.id)
  const payIds = payable.value.map((r) => r.id)
  if (!(await stillSame([...receiveIds, ...toPay.value.map((r) => r.id)]))) {
    saving.value = false
    return
  }
  const text = netText.value
  const a = await setSettled(receiveIds, true)
  const b = a.error || !payIds.length ? { error: null } : await setPaidClaim(payIds, true)
  saving.value = false
  const error = a.error ?? b.error
  if (error) {
    toast.error(error.message)
    return
  }
  haptic()
  picked.value = []
  toast.success(`已算总账，${text}，等 TA 确认收到`)
}

/**
 * TA 那边算了总账：TA 把 TA 先垫的都结清了，同时说给了我先垫的。
 * 确认的时候告诉我实际是净给了多少，不然「TA 说给了 ¥3,704」看着对不上。
 */
const mergedByThem = computed(() => {
  const times = claimedToMe.value.map((r) => new Date(r.paidClaimedAt!).getTime())
  if (!times.length) return null
  const near = settled.value.filter(
    (r) => r.payerUid !== myUid.value && r.settledAt && times.some((t) => Math.abs(new Date(r.settledAt!).getTime() - t) < 120_000),
  )
  if (!near.length) return null
  const diff = sum(claimedToMe.value) - sum(near)
  return {
    off: sum(near),
    text: Math.abs(diff) < 0.005 ? '两边刚好抵平' : diff > 0 ? `${partnerName.value}实际给你 ${formatMoney(diff)}` : `你实际给${partnerName.value} ${formatMoney(-diff)}`,
  }
})

const title = (r: LedgerRecord) => r.note || r.subCategory || r.category
const settledDay = (r: LedgerRecord) => (r.settledAt ? formatDateLabel(toDateKey(new Date(r.settledAt))) : '')
</script>

<template>
  <PushPage title="结清" back-label="返回" @back="settlePageOpen = false">
    <section class="summary">
      <button :class="{ on: tab === 'receive' }" @click="tab = 'receive'">
        <span>{{ partnerName }}还没给我</span>
        <b class="mono">{{ formatMoney(sum(toReceive)) }}</b>
        <small>{{ toReceive.length }} 笔<template v-if="claimedToMe.length"> · <em>{{ claimedToMe.length }} 笔 TA 说给了</em></template></small>
      </button>
      <button :class="{ on: tab === 'pay' }" @click="tab = 'pay'">
        <span>我还没给{{ partnerName }}</span>
        <b class="mono">{{ formatMoney(sum(toPay)) }}</b>
        <small>{{ toPay.length }} 笔<template v-if="claimedByMe.length"> · {{ claimedByMe.length }} 笔等 TA 确认</template></small>
      </button>
    </section>
    <p class="tip">AA 的那份给了之后，给钱的人勾「我给了」告诉对方，先垫钱的人确认收到就算结清；结清的照常算各自花了多少，只是不再进月末差额。</p>

    <div v-if="toReceive.length && toPay.length" class="total">
      <p>
        <span>两边合在一起算</span>
        <b>{{ netText }}</b>
      </p>
      <button :disabled="saving" @click="settleAll">算总账</button>
    </div>

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
      <div v-else-if="claimedToMe.length" class="claim">
        <p>
          <b>{{ partnerName }} 说已经给了 {{ claimedToMe.length }} 笔</b>
          <span class="mono">{{ formatMoney(sum(claimedToMe)) }}</span>
        </p>
        <p v-if="mergedByThem" class="claim-sub">TA 算了总账：你该给 TA 的 {{ formatMoney(mergedByThem.off) }} 已经扣掉，{{ mergedByThem.text }}</p>
        <div class="claim-actions">
          <button class="ghost" @click="rejectClaims">没收到</button>
          <button class="solid" :disabled="saving" @click="confirmClaims">确认收到</button>
        </div>
      </div>
      <section v-if="toReceive.length" class="group">
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
            <span class="sub">
              <em v-if="r.paidClaimedAt" class="tag">TA 说给了</em>{{ formatDateLabel(r.date) }} · 共 {{ formatMoney(r.amount) }} · {{ isAmountSplit(r) ? amountSplitText(r, myUid, partnerName) : `${partnerName}承担 ${(10 - r.ratio) * 10}%` }}
            </span>
          </span>
        </button>
      </section>
    </template>

    <!-- 我该给 TA：勾「我给了」告诉 TA，TA 确认收到才算结清 -->
    <template v-else-if="tab === 'pay'">
      <section v-if="!toPay.length" class="empty">
        <EmptyState icon="check" title="都结清啦" :desc="`没有欠着${partnerName}的 AA 了`" />
      </section>
      <template v-else>
        <div v-if="bounced.length" class="claim">
          <p>
            <b>{{ partnerName }} 没确认收到 {{ bounced.length }} 笔</b>
            <span class="mono">{{ formatMoney(sum(bounced)) }}</span>
          </p>
          <p class="claim-sub">可能是没收到，或者 TA 改了金额 / 比例。看一下，给了之后再告诉 TA</p>
          <div class="claim-actions">
            <button class="ghost" @click="dismissBounced">知道了</button>
          </div>
        </div>
        <div v-if="claimedByMe.length" class="nudge">
          <span>{{ claimedByMe.length }} 笔等 {{ partnerName }} 确认收到</span>
          <button v-if="nudgeable.length" :disabled="nudging" @click="nudge">提醒 TA</button>
          <small v-else>{{ nudgeHours }} 小时后可以提醒 TA</small>
        </div>
        <p class="hint">给了{{ partnerName }}之后勾上，点「我给了」告诉 TA，TA 确认收到就结清了</p>
        <section class="group">
          <button v-if="payable.length" class="select-all" @click="toggleAll">
            <i :class="['box', { on: allPicked }]"><AppIcon v-if="allPicked" name="check" :size="12" :stroke="3" /></i>
            全选
          </button>
          <template v-for="r in toPay" :key="r.id">
            <div v-if="r.paidClaimedAt" class="item static">
              <i class="box sent"><AppIcon name="check" :size="12" :stroke="3" /></i>
              <CategoryIcon :name="recordIcon(r.category, r.subCategory)" :color="recordColor(r.category)" :size="34" />
              <span class="info">
                <span class="line"><span class="name">{{ title(r) }}</span><b class="mono">{{ formatMoney(theirPart(r)) }}</b></span>
                <span class="sub"><em class="tag">等 TA 确认收到</em>{{ formatDateLabel(r.date) }} · {{ nameOf(r.payerUid) }}先垫</span>
              </span>
              <button class="undo" @click="withdrawClaim(r)">撤回</button>
            </div>
            <button v-else class="item" @click="toggle(r.id)">
              <i :class="['box', { on: picked.includes(r.id) }]">
                <AppIcon v-if="picked.includes(r.id)" name="check" :size="12" :stroke="3" />
              </i>
              <CategoryIcon :name="recordIcon(r.category, r.subCategory)" :color="recordColor(r.category)" :size="34" />
              <span class="info">
                <span class="line"><span class="name">{{ title(r) }}</span><b class="mono">{{ formatMoney(theirPart(r)) }}</b></span>
                <span class="sub">
                  <em v-if="isBounced(r)" class="tag">TA 没确认收到</em>{{ formatDateLabel(r.date) }} · 共 {{ formatMoney(r.amount) }} · {{ nameOf(r.payerUid) }}先垫
                </span>
              </span>
            </button>
          </template>
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

    <div v-if="tab !== 'done' && picked.length" class="bar">
      <span>已选 {{ picked.length }} 笔 · <b class="mono">{{ formatMoney(pickedTotal) }}</b></span>
      <button :disabled="saving" @click="tab === 'receive' ? markReceived() : markPaid()">
        {{ saving ? '保存中…' : tab === 'receive' ? '已收到' : '我给了' }}
      </button>
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
.total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  padding: 12px 12px 12px 14px;
  border-radius: var(--radius);
  background: var(--card);
}
.total p {
  display: flex;
  flex-direction: column;
  margin: 0;
}
.total span {
  font-size: 12px;
  color: var(--text-soft);
}
.total b {
  font-size: 15px;
}
.total button {
  flex-shrink: 0;
  height: 38px;
  padding: 0 18px;
  border-radius: 12px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
}
.total button:disabled {
  opacity: 0.6;
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
.summary em,
.tag {
  font-style: normal;
  color: #e08600;
}
.tag {
  margin-right: 6px;
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 11px;
  background: rgba(255, 149, 0, 0.12);
}
.box.sent {
  background: #c7c7cc;
  border-color: #c7c7cc;
}
.claim {
  margin-bottom: 12px;
  padding: 12px 14px;
  border-radius: var(--radius);
  background: var(--card);
  box-shadow: inset 0 0 0 1.5px rgba(255, 149, 0, 0.35);
}
.claim p {
  display: flex;
  justify-content: space-between;
  margin: 0 0 10px;
  font-size: 14px;
}
.nudge {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
  padding: 10px 14px;
  border-radius: var(--radius);
  background: var(--card);
  font-size: 13px;
}
.nudge button {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
}
.nudge small {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-faint);
}
.claim-sub {
  margin: -6px 0 10px;
  font-size: 12px;
  color: var(--text-soft);
}
.claim-actions {
  display: flex;
  gap: 8px;
}
.claim-actions button {
  flex: 1;
  height: 38px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
}
.claim-actions .ghost {
  background: var(--bg);
  color: var(--text-soft);
}
.claim-actions .solid {
  background: var(--primary);
  color: #fff;
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
