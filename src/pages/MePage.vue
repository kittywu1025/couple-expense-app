<script setup lang="ts">
import { computed, ref } from 'vue'
import { seedTestData } from '../dev/seed'
import { useBooks } from '../composables/useBooks'
import { useSupabaseAuth } from '../composables/useSupabaseAuth'
import { toast } from '../composables/useToast'
import { confirmAction, openFixedPage, openProfilePage } from '../composables/useUi'
import { useFixedExpenses } from '../composables/useFixedExpenses'
import { formatMoney } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'
import type { Gender } from '../types'
import { CURRENCIES, isCurrencyCode } from '../utils/currency'

const {
  currentBook,
  members,
  me,
  partner,
  myUid,
  updateBookSettings,
  leaveBook,
  bookActionLoading,
} = useBooks()
const { authDisplayName, authUser } = useSupabaseAuth()

const myName = computed(() => me.value?.displayName || authDisplayName.value)
const initial = computed(() => myName.value.slice(0, 1).toUpperCase())
const { items: fixedItems } = useFixedExpenses()
const activeFixed = computed(() => fixedItems.value.filter((f) => !f.paused))
const fixedSummary = computed(() =>
  activeFixed.value.length
    ? `${activeFixed.value.length} 项 · 每月 ${formatMoney(activeFixed.value.reduce((s, f) => s + f.amount, 0))}`
    : '未设置',
)

// 仅开发模式（npm run dev）显示，正式版不会出现
const isDev = import.meta.env.DEV
const seeding = ref(false)
const onSeed = async () => {
  const ok = await confirmAction({
    title: '插入测试数据？',
    message: '会生成 yuri（女生 · 樱花粉）和 remo（男生 · 天空蓝）最近 30 天约 20 笔记录。连真实账本时会写进数据库。',
    confirmText: '插入',
  })
  if (!ok) return
  seeding.value = true
  const { error } = await seedTestData()
  seeding.value = false
  if (error) toast.error(error.message)
  else toast.success('已插入测试数据')
}

const settleDays = Array.from({ length: 28 }, (_, i) => i + 1)

const copyCode = async () => {
  if (!currentBook.value) return
  try {
    await navigator.clipboard.writeText(currentBook.value.inviteCode)
    toast.success('邀请码已复制')
  } catch {
    toast.info(`邀请码：${currentBook.value.inviteCode}`)
  }
}

const onSettleDay = async (e: Event) => {
  const { error } = await updateBookSettings({ settleDay: Number((e.target as HTMLSelectElement).value) })
  if (error) toast.error(error.message)
  else toast.success('结算日已更新，统计将按新周期计算')
}

const genderLabel = (g: Gender | null) => (g === 'female' ? '女生' : g === 'male' ? '男生' : '未设置')

const onCurrency = async (e: Event) => {
  const code = (e.target as HTMLSelectElement).value
  if (!isCurrencyCode(code)) return
  const { error } = await updateBookSettings({ currency: code })
  if (error) toast.error(error.message)
  else toast.success('货币已切换')
}

const changeRatio = async (delta: number) => {
  if (!currentBook.value) return
  const next = Math.min(10, Math.max(0, currentBook.value.defaultRatio + delta))
  if (next === currentBook.value.defaultRatio) return
  const { error } = await updateBookSettings({ defaultRatio: next })
  if (error) toast.error(error.message)
}

const onLeave = async () => {
  const ok = await confirmAction({
    title: '退出这个账本？',
    message: partner.value
      ? '退出后你将看不到这个账本的记录，需要重新输入邀请码才能加入。'
      : '你是账本里唯一的成员，退出后账本和所有记录都会被删除，无法恢复。',
    confirmText: '退出账本',
    danger: true,
  })
  if (!ok) return
  const { error } = await leaveBook()
  if (error) toast.error(error.message)
}

</script>

<template>
  <button class="profile card" aria-label="查看个人资料" @click="openProfilePage">
    <div class="avatar me">{{ initial }}</div>
    <div class="profile-text">
      <h1>{{ myName }}</h1>
      <p v-if="partner">与 <b>{{ partner.displayName }}</b> 共同记账中</p>
      <p v-else>等待 TA 用邀请码加入</p>
      <p class="email">{{ authUser?.email }}</p>
    </div>
    <span class="profile-more">个人资料<AppIcon name="chevronRight" :size="16" /></span>
  </button>

  <h2 class="section-title">账本成员</h2>
  <section class="card group">
    <div v-for="m in members" :key="m.id" class="row">
      <span :class="['avatar', 'sm', m.userId === myUid ? 'me' : 'partner']">{{ m.displayName.slice(0, 1).toUpperCase() }}</span>
      <span class="grow">{{ m.displayName }}<small v-if="m.userId === myUid">（我）</small></span>
      <small :class="['gender', m.gender ?? 'none']">{{ genderLabel(m.gender) }}</small>
    </div>
    <button v-if="members.length < 2" class="row" @click="copyCode">
      <span class="avatar sm empty"><AppIcon name="plus" :size="18" /></span>
      <span class="grow">邀请码 <b class="mono code">{{ currentBook?.inviteCode }}</b></span>
      <small class="link">复制</small>
    </button>
  </section>

  <h2 class="section-title">记账</h2>
  <section class="card group">
    <button class="row" @click="openFixedPage">
      <span class="row-icon"><AppIcon name="calendar" :size="18" :stroke="2" /></span>
      <span class="grow">固定扣款</span>
      <small class="faint">{{ fixedSummary }}</small>
      <AppIcon name="chevronRight" :size="16" class="chev" />
    </button>
  </section>

  <h2 class="section-title">账本设置</h2>
  <section class="card group">
    <label class="row">
      <span class="grow">结算日</span>
      <select :value="currentBook?.settleDay" :disabled="bookActionLoading" @change="onSettleDay">
        <option v-for="d in settleDays" :key="d" :value="d">每月 {{ d }} 日</option>
      </select>
    </label>
    <label class="row">
      <span class="grow">
        记账货币
        <small class="hint">只改变显示单位，不会换算已有金额</small>
      </span>
      <select :value="currentBook?.currency" :disabled="bookActionLoading" @change="onCurrency">
        <option v-for="c in CURRENCIES" :key="c.code" :value="c.code">{{ c.symbol }} {{ c.name }}</option>
      </select>
    </label>
    <div class="row">
      <span class="grow">默认 AA 比例 <small class="faint">（我:TA）</small></span>
      <div class="stepper">
        <button :disabled="bookActionLoading" @click="changeRatio(-1)"><AppIcon name="minus" :size="16" :stroke="2.2" /></button>
        <span class="mono">{{ currentBook?.defaultRatio }}:{{ 10 - (currentBook?.defaultRatio ?? 5) }}</span>
        <button :disabled="bookActionLoading" @click="changeRatio(1)"><AppIcon name="plus" :size="16" :stroke="2.2" /></button>
      </div>
    </div>
  </section>

  <section class="card group actions">
    <button class="row danger" :disabled="bookActionLoading" @click="onLeave">退出账本</button>
  </section>

  <section v-if="isDev" class="card group dev">
    <button class="row" :disabled="seeding" @click="onSeed">
      <AppIcon name="sparkles" :size="18" />
      <span class="grow">{{ seeding ? '插入中…' : '插入测试数据' }}</span>
      <small class="faint">仅开发模式</small>
    </button>
  </section>
</template>

<style scoped>
.card {
  background: var(--card);
  border-radius: var(--radius);
}
.profile {
  width: 100%;
  text-align: left;
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
}
.profile h1 {
  margin: 0;
  font-size: 20px;
}
.profile p {
  margin: 2px 0 0;
  color: var(--text-soft);
  font-size: 14px;
}
.profile b {
  color: var(--partner);
}
.profile .email {
  font-size: 12px;
  color: var(--text-faint);
}
.avatar {
  width: 60px;
  height: 60px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 26px;
  font-weight: 700;
}
.avatar.sm {
  width: 34px;
  height: 34px;
  font-size: 15px;
}
.avatar.me {
  background: var(--me);
}
.avatar.partner {
  background: var(--partner);
}
.avatar.empty {
  background: var(--bg);
  color: var(--text-faint);
}
.section-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-soft);
  margin: 20px 6px 8px;
}
.group {
  overflow: hidden;
}
.row {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  min-height: 52px;
  font-size: 15px;
  text-align: left;
}
.row + .row {
  border-top: 1px solid var(--line);
}
.grow {
  flex: 1;
}
.hint {
  display: block;
  font-size: 11px;
  color: var(--text-faint);
}
.profile:active {
  background: #f7f7f9;
}
.profile-text {
  flex: 1;
  min-width: 0;
}
.profile-more {
  position: absolute;
  top: 16px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 12px;
  color: var(--text-faint);
}
.gender {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
}
.gender.female,
.gender.male {
  background: var(--bg);
  color: var(--text-soft);
}
.gender.none {
  background: var(--bg);
  color: var(--text-faint);
}
.faint {
  color: var(--text-faint);
}
.link {
  color: var(--primary);
}
.code {
  letter-spacing: 2px;
  color: var(--primary);
}
.mono {
  font-family: var(--mono);
}
select {
  border: none;
  background: var(--bg);
  border-radius: 8px;
  padding: 6px 10px;
  font: inherit;
  color: var(--primary);
}
.stepper {
  display: flex;
  align-items: center;
  gap: 10px;
}
.stepper button {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 18px;
  line-height: 1;
}
.stepper button:disabled {
  opacity: 0.5;
}
.actions {
  margin-top: 24px;
}
.actions .row {
  justify-content: center;
}
.row-icon {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--primary-soft);
  color: var(--primary);
  display: grid;
  place-items: center;
}
.chev {
  color: var(--text-faint);
}
.dev {
  margin-top: 12px;
  border: 1.5px dashed #d1d1d6;
  background: transparent;
}
.dev .row {
  color: var(--primary);
}
.danger {
  color: var(--danger);
}
</style>
