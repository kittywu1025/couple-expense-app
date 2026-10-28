<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import BottomSheet from '../components/BottomSheet.vue'
import EmptyState from '../components/EmptyState.vue'
import DiscussionThread from '../components/DiscussionThread.vue'
import DisputeSheet from '../components/DisputeSheet.vue'
import PushPage from '../components/PushPage.vue'
import { useBooks } from '../composables/useBooks'
import { useLoans } from '../composables/useLoans'
import { confirmAction, haptic, loansPageOpen } from '../composables/useUi'
import { toast } from '../composables/useToast'
import type { CurrencyCode, Loan, LoanRepayment } from '../types'
import { CURRENCIES, currencyInfo } from '../utils/currency'
import { canRespond, confirmLabel, disputedByPartner } from '../utils/confirm'
import { formatDateLabel, formatMoney, todayKey } from '../utils/format'

const { myUid, partner, nameOf, currentBook } = useBooks()
const { loans, progress, addLoan, removeLoan, requestDeleteLoan, cancelDeleteLoan, addRepayment, removeRepayment, respondLoans, respondRepayments, replyLoan, replyRepayment } =
  useLoans()
const partnerName = computed(() => partner.value?.displayName ?? 'TA')

const prog = (l: Loan) => progress.value.get(l.id) ?? { repaid: 0, pending: 0, remaining: l.amount, settled: false, items: [] }

// 还没还清的放上面；对方还没确认的借款不算进汇总
const active = computed(() => loans.value.filter((l) => !prog(l).settled))
const settled = computed(() => loans.value.filter((l) => prog(l).settled))
/** 按货币分开加，不换算：¥100,000 · $200 */
const sumRemaining = (list: Loan[]) => {
  const byCur = new Map<string, number>()
  for (const l of list.filter((x) => x.confirmStatus === 'confirmed')) {
    byCur.set(l.currency, (byCur.get(l.currency) ?? 0) + prog(l).remaining)
  }
  const parts = [...byCur.entries()].filter(([, v]) => v > 0).map(([c, v]) => formatMoney(v, c))
  return parts.length ? parts : [formatMoney(0)]
}
const lentOut = computed(() => sumRemaining(active.value.filter((l) => l.lenderUid === myUid.value)))
const borrowed = computed(() => sumRemaining(active.value.filter((l) => l.borrowerUid === myUid.value)))
const showSettled = ref(false)

/**
 * 互相抵消：同一种货币里，我借 TA 的和 TA 借我的可以对冲。
 * 只算两个人都确认过、还没还完的（等确认的还款先扣掉，免得重复抵）。
 */
const offsets = computed(() => {
  const open = active.value
    .filter((l) => l.confirmStatus === 'confirmed')
    .map((l) => ({ loan: l, avail: Math.round((prog(l).remaining - prog(l).pending) * 100) / 100 }))
    .filter((x) => x.avail > 0)
    // 先抵最早的那笔
    .sort((a, b) => a.loan.date.localeCompare(b.loan.date) || a.loan.createdAt.localeCompare(b.loan.createdAt))
  const currencies = [...new Set(open.map((x) => x.loan.currency))]
  return currencies
    .map((currency) => {
      const iOwe = open.filter((x) => x.loan.currency === currency && x.loan.borrowerUid === myUid.value)
      const theyOwe = open.filter((x) => x.loan.currency === currency && x.loan.lenderUid === myUid.value)
      const a = iOwe.reduce((s, x) => s + x.avail, 0)
      const b = theyOwe.reduce((s, x) => s + x.avail, 0)
      const amount = Math.min(a, b)
      // 从最早的借款开始，一笔笔扣到 amount 为止
      const allocate = (list: typeof open) => {
        let left = amount
        return list.flatMap((x) => {
          const take = Math.min(left, x.avail)
          left = Math.round((left - take) * 100) / 100
          return take > 0 ? [{ loanId: x.loan.id, amount: take }] : []
        })
      }
      return { currency, iOwe: a, theyOwe: b, amount, net: b - a, parts: amount > 0 ? [...allocate(iOwe), ...allocate(theyOwe)] : [] }
    })
    .filter((o) => o.amount > 0)
})
const netText = (o: { net: number; currency: string }) =>
  o.net > 0
    ? `${partnerName.value}还欠我 ${formatMoney(o.net, o.currency)}`
    : o.net < 0
      ? `我还欠${partnerName.value} ${formatMoney(-o.net, o.currency)}`
      : '正好两清'

const offsetting = ref(false)
const runOffset = async (o: (typeof offsets.value)[number]) => {
  const ok = await confirmAction({
    title: `互相抵消 ${formatMoney(o.amount, o.currency)}？`,
    message: `会给双方的借款各记一笔 ${formatMoney(o.amount, o.currency)} 的还款（备注「互相抵消」），${partnerName.value}确认后生效。抵消后${netText(o)}。`,
    confirmText: '抵消',
  })
  if (!ok) return
  offsetting.value = true
  const today = todayKey()
  for (const p of o.parts) {
    const { error } = await addRepayment(p.loanId, { amount: p.amount, date: today, note: '互相抵消' })
    if (error) {
      offsetting.value = false
      toast.error(error.message)
      return
    }
  }
  offsetting.value = false
  haptic()
  toast.success(`已记下抵消，等${partnerName.value}确认`)
}

const title = (l: Loan) => (l.lenderUid === myUid.value ? `借给${nameOf(l.borrowerUid)}` : `向${nameOf(l.lenderUid)}借`)
const pct = (l: Loan) => Math.min(100, Math.round(((l.amount - prog(l).remaining) / l.amount) * 100))

// ── 新增借款 ──
const editorOpen = ref(false)
const direction = ref<'out' | 'in'>('in')
const amountText = ref('')
/** 默认账本货币，可以选外币 */
const currency = ref<CurrencyCode>('JPY')
const date = ref(todayKey())
const note = ref('')
const tried = ref(false)
const saving = ref(false)
const amount = computed(() => Math.round(Number.parseFloat(amountText.value) * 100) / 100)

const openNew = () => {
  if (!partner.value) {
    toast.info('TA 加入账本后才能记借款')
    return
  }
  direction.value = 'in'
  amountText.value = ''
  currency.value = currentBook.value?.currency ?? 'JPY'
  date.value = todayKey()
  note.value = ''
  tried.value = false
  editorOpen.value = true
}

const saveLoan = async () => {
  tried.value = true
  if (!(amount.value > 0) || saving.value || !partner.value) return
  const other = partner.value.userId
  saving.value = true
  const { error } = await addLoan({
    lenderUid: direction.value === 'out' ? myUid.value : other,
    borrowerUid: direction.value === 'out' ? other : myUid.value,
    amount: amount.value,
    currency: currency.value,
    date: date.value,
    note: note.value.trim() || null,
  })
  saving.value = false
  if (error) {
    toast.error(error.message)
    return
  }
  haptic()
  editorOpen.value = false
  toast.success('已记下')
}

// ── 借款详情 ──
const detailId = ref<string | null>(null)
const detail = computed(() => loans.value.find((l) => l.id === detailId.value) ?? null)
const repayText = ref('')
const repayDate = ref(todayKey())
const repaySaving = ref(false)

const openDetail = (l: Loan) => {
  detailId.value = l.id
  repayText.value = ''
  repayDate.value = todayKey()
}

const saveRepayment = async (all = false) => {
  const l = detail.value
  if (!l || repaySaving.value) return
  const left = prog(l).remaining - prog(l).pending
  const value = all ? left : Math.round(Number.parseFloat(repayText.value) * 100) / 100
  if (!(value > 0)) {
    toast.info('填一下这次还了多少')
    return
  }
  if (value > left + 0.001) {
    toast.info(`最多还剩 ${formatMoney(left, l.currency)} 没还`)
    return
  }
  repaySaving.value = true
  const { error } = await addRepayment(l.id, { amount: value, date: repayDate.value, note: null })
  repaySaving.value = false
  if (error) {
    toast.error(error.message)
    return
  }
  haptic()
  repayText.value = ''
  toast.success(`已记下 ${formatMoney(value, l.currency)}，等${partnerName.value}确认`)
}

const confirmLoan = async (l: Loan) => {
  const { error } = await respondLoans([l.id], 'confirmed')
  if (error) toast.error(error.message)
  else toast.success('已确认')
}
const confirmRepay = async (r: LoanRepayment) => {
  const { error } = await respondRepayments([r.id], 'confirmed')
  if (error) toast.error(error.message)
  else toast.success('已确认收到')
}

// ── 有疑问 / 回复：写一句留言 ──
const talking = ref<{ kind: 'loan' | 'repayment'; item: Loan | LoanRepayment; mode: 'dispute' | 'reply' } | null>(null)
const talkSaving = ref(false)
const talkingCurrency = computed(() => {
  const t = talking.value
  if (!t) return undefined
  return t.kind === 'loan' ? (t.item as Loan).currency : loans.value.find((l) => l.id === (t.item as LoanRepayment).loanId)?.currency
})
const sendTalk = async ({ text }: { text: string }) => {
  const t = talking.value
  if (!t || talkSaving.value) return
  talkSaving.value = true
  const id = t.item.id
  const { error } =
    t.mode === 'dispute'
      ? t.kind === 'loan'
        ? await respondLoans([id], 'disputed', text)
        : await respondRepayments([id], 'disputed', text)
      : t.kind === 'loan'
        ? await replyLoan(id, text)
        : await replyRepayment(id, text)
  talkSaving.value = false
  if (error) {
    toast.error(error.message)
    return
  }
  haptic()
  toast.success(t.mode === 'dispute' ? '已经告诉 TA 了' : '已回复，等 TA 再确认')
  talking.value = null
}
const lastWord = (r: LoanRepayment) => {
  const e = r.discussion[r.discussion.length - 1]
  return e ? `${e.by === myUid.value ? '我' : nameOf(e.by)}：${e.text}` : ''
}

// ── 删除借款：一个人申请，另一个人同意才删 ──
const onRequestDelete = async (l: Loan) => {
  const ok = await confirmAction({
    title: '申请删除这笔借款？',
    message: `${partnerName.value}同意后才会删除，还款记录也会一起删掉。`,
    confirmText: '申请删除',
    danger: true,
  })
  if (!ok) return
  const { error } = await requestDeleteLoan(l.id)
  if (error) toast.error(error.message)
  else toast.success(`已申请，等${partnerName.value}同意`)
}
const onCancelDelete = async (l: Loan, mine: boolean) => {
  const { error } = await cancelDeleteLoan(l.id)
  if (error) toast.error(error.message)
  else toast.success(mine ? '已撤回删除申请' : `已告诉${partnerName.value}先不删`)
}
const onApproveDelete = async (l: Loan) => {
  const ok = await confirmAction({
    title: '同意删除这笔借款？',
    message: '删除后两个人都看不到，还款记录也会一起删掉，无法恢复。',
    confirmText: '同意删除',
    danger: true,
  })
  if (!ok) return
  const { error } = await removeLoan(l.id)
  if (error) {
    toast.error(error.message)
    return
  }
  detailId.value = null
  toast.success('已删除')
}

const onDeleteRepay = async (r: LoanRepayment) => {
  const ok = await confirmAction({ title: '删除这笔还款？', message: formatMoney(r.amount), confirmText: '删除', danger: true })
  if (!ok) return
  const { error } = await removeRepayment(r.id)
  if (error) toast.error(error.message)
  else toast.success('已删除')
}

const canDeleteRepay = (l: Loan, r: LoanRepayment) =>
  l.lenderUid === myUid.value || (r.createdBy === myUid.value && r.confirmStatus !== 'confirmed')
</script>

<template>
  <!-- push 过渡需要单根元素 -->
  <div>
  <PushPage title="借款" back-label="返回" @back="loansPageOpen = false">
    <template #right>
      <button class="add" aria-label="记一笔借款" @click="openNew"><AppIcon name="plus" :size="22" :stroke="2.2" /></button>
    </template>

    <section v-if="loans.length" class="summary">
      <div>
        <span>我借出去还没还</span>
        <b v-for="t in lentOut" :key="t" class="mono">{{ t }}</b>
      </div>
      <div>
        <span>我借的还没还</span>
        <b v-for="t in borrowed" :key="t" class="mono">{{ t }}</b>
      </div>
      <small>和每月的共同开销分开算；还款要对方确认后才扣</small>
    </section>

    <section v-if="!loans.length" class="empty">
      <EmptyState
        icon="wallet"
        title="还没有借款"
        desc="大一点的钱借来借去，记下来、两个人都确认，以后还了多少一清二楚"
        action="记一笔借款"
        @action="openNew"
      />
    </section>

    <section v-if="active.length" class="group">
      <button v-for="l in active" :key="l.id" class="loan" @click="openDetail(l)">
        <span class="line">
          <span class="name">
            <i :class="['dot', l.lenderUid === myUid ? 'me' : 'partner']" />{{ title(l) }}
          </span>
          <span class="mono amount">{{ formatMoney(l.amount, l.currency) }}</span>
        </span>
        <span class="bar"><i :style="{ width: pct(l) + '%' }" /></span>
        <span class="line meta">
          <span>{{ formatDateLabel(l.date) }}<template v-if="l.note"> · {{ l.note }}</template></span>
          <span>
            <em v-if="l.deleteRequestedBy" class="status disputed">{{ l.deleteRequestedBy === myUid ? '申请删除中' : 'TA 想删除' }}</em>
            <em v-else-if="l.confirmStatus !== 'confirmed'" :class="['status', l.confirmStatus]">{{ confirmLabel(l, myUid) }}</em>
            还剩 <b class="mono">{{ formatMoney(prog(l).remaining, l.currency) }}</b><template v-if="prog(l).pending"> · {{ formatMoney(prog(l).pending, l.currency) }} 等确认</template>
          </span>
        </span>
      </button>
    </section>

    <!-- 互相抵消：两边都有没还完的借款时出现 -->
    <section v-for="o in offsets" :key="o.currency" class="offset">
      <div class="offset-rows">
        <span>我借{{ partnerName }}的 <b class="mono">{{ formatMoney(o.iOwe, o.currency) }}</b></span>
        <span>{{ partnerName }}借我的 <b class="mono">{{ formatMoney(o.theyOwe, o.currency) }}</b></span>
      </div>
      <p class="offset-net">相互抵消后，{{ netText(o) }}</p>
      <button class="offset-btn" :disabled="offsetting" @click="runOffset(o)">
        <AppIcon name="swap" :size="16" :stroke="2.2" />{{ offsetting ? '处理中…' : `一键抵消 ${formatMoney(o.amount, o.currency)}` }}
      </button>
    </section>

    <template v-if="settled.length">
      <button class="toggle" @click="showSettled = !showSettled">
        已还清 {{ settled.length }} 笔
        <AppIcon :name="showSettled ? 'minus' : 'plus'" :size="14" :stroke="2.2" />
      </button>
      <section v-if="showSettled" class="group done">
        <button v-for="l in settled" :key="l.id" class="loan" @click="openDetail(l)">
          <span class="line">
            <span class="name"><AppIcon name="check" :size="14" :stroke="2.4" />{{ title(l) }}</span>
            <span class="mono amount">{{ formatMoney(l.amount, l.currency) }}</span>
          </span>
          <span class="line meta"><span>{{ formatDateLabel(l.date) }}<template v-if="l.note"> · {{ l.note }}</template></span><span>已还清</span></span>
        </button>
      </section>
    </template>
  </PushPage>

  <!-- 新增借款 -->
  <BottomSheet :open="editorOpen" @close="editorOpen = false">
    <h3 class="sheet-title">记一笔借款</h3>
    <div class="form">
      <div class="seg wide">
        <button :class="{ on: direction === 'in' }" @click="direction = 'in'">我向{{ partnerName }}借</button>
        <button :class="{ on: direction === 'out' }" @click="direction = 'out'">我借给{{ partnerName }}</button>
      </div>
      <label class="field">
        <span>金额</span>
        <select v-model="currency" class="cur" aria-label="货币">
          <option v-for="c in CURRENCIES" :key="c.code" :value="c.code">{{ c.symbol }} {{ c.name }}</option>
        </select>
        <input v-model="amountText" inputmode="decimal" placeholder="0" class="mono" />
      </label>
      <p v-if="tried && !(amount > 0)" class="err">金额需要大于 0</p>
      <label class="field">
        <span>日期</span>
        <input v-model="date" type="date" :max="todayKey()" />
      </label>
      <label class="field">
        <span>备注</span>
        <input v-model="note" maxlength="50" placeholder="借来做什么（可不填）" />
      </label>
      <p class="hint">记了就算，{{ partnerName }}那边也能看到；以后要删得{{ partnerName }}同意</p>
    </div>
    <button class="save" :disabled="saving" @click="saveLoan">
      <AppIcon v-if="!saving" name="check" :size="18" :stroke="2.4" />{{ saving ? '保存中…' : '保存' }}
    </button>
  </BottomSheet>

  <!-- 借款详情 + 还款 -->
  <BottomSheet :open="!!detail" @close="detailId = null">
    <template v-if="detail">
      <div class="hero">
        <p class="cat">{{ title(detail) }}</p>
        <p class="big mono">{{ formatMoney(detail.amount, detail.currency) }}</p>
        <p class="left">
          <template v-if="prog(detail).settled">已经还清啦</template>
          <template v-else>还剩 <b class="mono">{{ formatMoney(prog(detail).remaining, detail.currency) }}</b></template>
          <template v-if="prog(detail).pending"> · {{ formatMoney(prog(detail).pending, detail.currency) }} 等确认</template>
        </p>
      </div>

      <dl class="rows">
        <div><dt>借出</dt><dd>{{ nameOf(detail.lenderUid) }}</dd></div>
        <div><dt>借入</dt><dd>{{ nameOf(detail.borrowerUid) }}</dd></div>
        <div><dt>日期</dt><dd>{{ formatDateLabel(detail.date) }}</dd></div>
        <div v-if="detail.note"><dt>备注</dt><dd>{{ detail.note }}</dd></div>
        <div><dt>确认</dt><dd :class="['status', detail.confirmStatus]">{{ confirmLabel(detail, myUid) }}</dd></div>
      </dl>

      <div v-if="canRespond(detail, myUid)" class="respond">
        <p>{{ nameOf(detail.lenderUid) }} 借给 {{ nameOf(detail.borrowerUid) }} {{ formatMoney(detail.amount, detail.currency) }}，对吗？</p>
        <div>
          <button class="ask" @click="talking = { kind: 'loan', item: detail, mode: 'dispute' }">有疑问</button>
          <button class="ok" @click="confirmLoan(detail)">确认</button>
        </div>
      </div>

      <section v-if="detail.discussion.length" class="talk">
        <DiscussionThread :entries="detail.discussion" />
        <button v-if="disputedByPartner(detail, myUid)" class="talk-reply" @click="talking = { kind: 'loan', item: detail, mode: 'reply' }">
          回复 TA
        </button>
      </section>

      <h4 class="sub-title">还款记录</h4>
      <p v-if="!prog(detail).items.length" class="none">还没有还款</p>
      <div v-for="r in prog(detail).items" :key="r.id" class="repay">
        <span class="grow">
          <b class="mono">{{ formatMoney(r.amount, detail.currency) }}</b>
          <small>{{ formatDateLabel(r.date) }} · {{ nameOf(r.createdBy) }}记<template v-if="r.note"> · {{ r.note }}</template></small>
          <small v-if="r.discussion.length" class="said">{{ lastWord(r) }}</small>
        </span>
        <template v-if="canRespond(r, myUid)">
          <button class="mini ask" @click="talking = { kind: 'repayment', item: r, mode: 'dispute' }">有疑问</button>
          <button class="mini ok" @click="confirmRepay(r)">收到了</button>
        </template>
        <button v-else-if="disputedByPartner(r, myUid)" class="mini ask" @click="talking = { kind: 'repayment', item: r, mode: 'reply' }">
          回复
        </button>
        <em v-else :class="['status', r.confirmStatus]">{{ confirmLabel(r, myUid) }}</em>
        <button v-if="canDeleteRepay(detail, r)" class="x" aria-label="删除这笔还款" @click="onDeleteRepay(r)">
          <AppIcon name="close" :size="14" :stroke="2.2" />
        </button>
      </div>

      <div v-if="prog(detail).remaining - prog(detail).pending > 0 && detail.confirmStatus === 'confirmed'" class="repay-form">
        <label class="field">
          <span>还了</span>
          <b class="symbol">{{ currencyInfo(detail.currency).symbol }}</b>
          <input v-model="repayText" inputmode="decimal" placeholder="0" class="mono" />
        </label>
        <label class="field">
          <span>日期</span>
          <input v-model="repayDate" type="date" :max="todayKey()" />
        </label>
        <div class="repay-btns">
          <button class="ghost" :disabled="repaySaving" @click="saveRepayment(true)">剩下的全还了</button>
          <button class="primary" :disabled="repaySaving" @click="saveRepayment()">记一笔还款</button>
        </div>
        <p class="hint">还款也要对方确认，确认后才从「还剩」里扣掉</p>
      </div>

      <div v-if="detail.deleteRequestedBy && detail.deleteRequestedBy !== myUid" class="del-req">
        <p>{{ nameOf(detail.deleteRequestedBy) }} 想删除这笔借款</p>
        <div>
          <button class="ask" @click="onCancelDelete(detail, false)">先不删</button>
          <button class="danger" @click="onApproveDelete(detail)">同意删除</button>
        </div>
      </div>
      <div v-else-if="detail.deleteRequestedBy" class="del-req mine">
        <p>已申请删除，等 {{ partnerName }} 同意</p>
        <button class="ask" @click="onCancelDelete(detail, true)">撤回申请</button>
      </div>
      <button v-else class="delete" @click="onRequestDelete(detail)">申请删除这笔借款</button>
    </template>
  </BottomSheet>

  <DisputeSheet
    :open="!!talking"
    :mode="talking?.mode ?? 'dispute'"
    :label="talking?.kind === 'loan' ? '借款' : '还款'"
    :quick-options="talking?.kind === 'repayment' ? ['还没收到', '金额不对', '日期不对'] : ['金额不对', '日期不对', '借的方向反了', '没有这笔']"
    :amount="talking?.item.amount ?? 0"
    :currency="talkingCurrency"
    :discussion="talking?.mode === 'dispute' ? talking.item.discussion : undefined"
    :saving="talkSaving"
    @close="talking = null"
    @submit="sendTalk"
  />
  </div>
</template>

<style scoped>
.add {
  color: var(--primary);
  padding: 6px;
  display: grid;
  place-items: center;
}
.summary {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 12px;
  background: var(--card);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 14px;
}
.summary div {
  display: flex;
  flex-direction: column;
}
.summary span {
  font-size: 12px;
  color: var(--text-soft);
}
.summary b {
  font-size: 22px;
  margin-top: 2px;
}
.summary small {
  grid-column: 1 / -1;
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-faint);
}
.empty {
  background: var(--card);
  border-radius: var(--radius);
  padding: 8px 0;
}
.group {
  background: var(--card);
  border-radius: var(--radius);
  padding: 0 14px;
  margin-bottom: 14px;
}
.loan {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 12px 0;
  text-align: left;
}
.loan + .loan {
  border-top: 1px solid var(--line);
}
.line {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 15px;
  font-weight: 500;
}
.amount {
  font-weight: 600;
}
.meta {
  font-size: 12px;
  color: var(--text-faint);
}
.meta b {
  color: var(--text);
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
.bar {
  height: 6px;
  border-radius: 999px;
  background: var(--bg);
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: #34b38a;
}
.status {
  font-style: normal;
  font-size: 12px;
  margin-right: 6px;
  color: var(--text-soft);
}
.status.pending {
  color: #d97800;
}
.status.disputed {
  color: var(--danger);
}
.offset {
  background: var(--card);
  border-radius: var(--radius);
  padding: 14px;
  margin-bottom: 14px;
  box-shadow: inset 0 0 0 1.5px var(--primary-soft);
}
.offset-rows {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  color: var(--text-soft);
}
.offset-rows b {
  color: var(--text);
}
.offset-net {
  margin: 8px 0 10px;
  font-size: 15px;
  font-weight: 600;
}
.offset-btn {
  width: 100%;
  height: 44px;
  border-radius: 12px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0 4px 8px;
  font-size: 13px;
  color: var(--text-soft);
}
.done {
  opacity: 0.7;
}
.sheet-title {
  margin: 0 0 12px;
  text-align: center;
  font-size: 16px;
}
.form,
.repay-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.seg {
  display: flex;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 12px;
  padding: 3px;
}
.seg button {
  flex: 1;
  height: 36px;
  border-radius: 10px;
  font-size: 14px;
  color: var(--text-soft);
}
.seg button.on {
  background: var(--card);
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
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
  width: 40px;
  flex-shrink: 0;
  font-size: 14px;
  color: var(--text-soft);
}
.field input {
  flex: 1;
  min-width: 0;
  height: 44px;
  border: none;
  background: transparent;
  font-size: 16px;
  outline: none;
  text-align: right;
}
.cur {
  margin-left: auto;
  flex: 0 0 auto !important;
  width: auto;
  font-size: 14px !important;
  color: var(--text-soft);
  border: none;
  background: transparent;
  text-align: left !important;
}
.summary b + b {
  font-size: 15px;
  margin-top: 0;
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
button:disabled {
  opacity: 0.6;
}
.hero {
  text-align: center;
  padding: 8px 0 14px;
}
.cat {
  margin: 0;
  font-size: 14px;
  color: var(--text-soft);
}
.big {
  margin: 4px 0;
  font-size: 30px;
  font-weight: 700;
}
.left {
  margin: 0;
  font-size: 13px;
  color: var(--text-soft);
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
  padding: 10px 0;
  font-size: 14px;
}
.rows div + div {
  border-top: 1px solid var(--line);
}
dt {
  color: var(--text-soft);
}
dd {
  margin: 0;
  text-align: right;
}
.respond {
  margin-top: 12px;
  padding: 12px;
  border-radius: 14px;
  background: var(--primary-soft);
}
.respond p {
  margin: 0 0 10px;
  font-size: 13px;
}
.respond div {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.respond button {
  height: 40px;
  border-radius: 12px;
  font-weight: 600;
}
.ask {
  background: rgba(0, 0, 0, 0.06);
  color: var(--text-soft);
}
.ok {
  background: var(--primary);
  color: #fff;
}
.talk {
  margin-top: 12px;
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--bg);
}
.talk-reply {
  width: 100%;
  height: 38px;
  margin-top: 10px;
  border-radius: 12px;
  background: var(--card);
  color: var(--primary);
  font-weight: 600;
}
.said {
  color: var(--text-soft) !important;
}
.sub-title {
  margin: 18px 4px 6px;
  font-size: 14px;
}
.none {
  margin: 0 4px 8px;
  font-size: 13px;
  color: var(--text-faint);
}
.repay {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 4px;
  border-bottom: 1px solid var(--line);
}
.grow {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.grow small {
  font-size: 12px;
  color: var(--text-faint);
}
.mini {
  height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
}
.x {
  color: var(--text-faint);
  padding: 4px;
}
.repay-form {
  margin-top: 12px;
}
.repay-btns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.repay-btns button {
  height: 44px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 14px;
}
.ghost {
  background: var(--primary-soft);
  color: var(--primary);
}
.primary {
  background: var(--primary);
  color: #fff;
}
.del-req {
  margin-top: 16px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 59, 48, 0.07);
  text-align: center;
}
.del-req p {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--danger);
}
.del-req div {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.del-req button {
  height: 40px;
  border-radius: 12px;
  font-weight: 600;
}
.del-req.mine button {
  width: 100%;
}
.del-req .danger {
  background: var(--danger);
  color: #fff;
}
.delete {
  width: 100%;
  margin-top: 16px;
  padding: 12px;
  font-size: 14px;
  color: var(--danger);
}
</style>
