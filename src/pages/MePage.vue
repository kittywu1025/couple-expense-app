<script setup lang="ts">
import { computed, ref } from 'vue'
import { seedTestData } from '../dev/seed'
import { previewRecap } from '../composables/useMonthRecap'
import { HOME_CARDS, homeCardPref } from '../composables/usePrefs'
import { useBooks } from '../composables/useBooks'
import { useSupabaseAuth } from '../composables/useSupabaseAuth'
import { toast } from '../composables/useToast'
import { aboutPageOpen, bookSettingsOpen, confirmAction, inviteSheetOpen, openFixedPage, openProfilePage } from '../composables/useUi'
import { useFixedExpenses } from '../composables/useFixedExpenses'
import { formatMoneyShort } from '../utils/format'
import AppIcon from '../components/AppIcon.vue'

const { members, me, partner, myUid, leaveBook, bookActionLoading } = useBooks()
const { authDisplayName, signOut } = useSupabaseAuth()

const myName = computed(() => me.value?.displayName || authDisplayName.value)
const initial = (name: string) => name.slice(0, 1).toUpperCase()

const { visibleItems: fixedItems } = useFixedExpenses()
const activeFixed = computed(() => fixedItems.value.filter((f) => !f.paused))
const fixedSummary = computed(() =>
  activeFixed.value.length
    ? `${activeFixed.value.length} 项 · 每月 ${formatMoneyShort(activeFixed.value.reduce((s, f) => s + f.amount, 0))}`
    : '未设置',
)


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

const onSignOut = async () => {
  const ok = await confirmAction({
    title: '退出登录？',
    message: '账单都保存在云端，重新登录即可看到。',
    confirmText: '退出登录',
  })
  if (!ok) return
  const { error } = await signOut()
  if (error) toast.error('退出登录失败，请稍后重试')
}

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
</script>

<template>
  <!-- 一级：用户卡片（点进个人资料） -->
  <button class="card profile" aria-label="查看个人资料" @click="openProfilePage">
    <span class="avatar me">{{ initial(myName) }}</span>
    <span class="profile-text">
      <b>{{ myName }}</b>
      <small v-if="partner">与 <em>{{ partner.displayName }}</em> 共同记账中</small>
      <small v-else>等待 TA 用邀请码加入</small>
    </span>
    <AppIcon name="chevronRight" :size="18" class="chev" />
  </button>

  <!-- 一级：账本成员，紧凑一行 -->
  <section class="card members">
    <span class="label">账本成员</span>
    <span class="people">
      <span v-for="m in members" :key="m.id" class="person">
        <i :class="['avatar', 'sm', m.userId === myUid ? 'me' : 'partner']">{{ initial(m.displayName) }}</i>
        {{ m.displayName }}
      </span>
      <button v-if="members.length < 2" class="invite" @click="inviteSheetOpen = true">
        <AppIcon name="plus" :size="14" :stroke="2.4" />邀请 TA
      </button>
    </span>
  </section>

  <!-- 一级：常用 -->
  <section class="card group">
    <button class="row" @click="openFixedPage">
      <span class="row-icon"><AppIcon name="calendar" :size="18" :stroke="2" /></span>
      <span class="grow">固定扣款</span>
      <small class="faint">{{ fixedSummary }}</small>
      <AppIcon name="chevronRight" :size="16" class="chev" />
    </button>
    <label class="row">
      <span class="row-icon"><AppIcon name="home" :size="18" :stroke="2" /></span>
      <span class="grow">首页默认卡片</span>
      <select v-model="homeCardPref">
        <option v-for="c in HOME_CARDS" :key="c.key" :value="c.key">{{ c.label }}</option>
      </select>
    </label>
  </section>

  <!-- 二级菜单 -->
  <section class="card group">
    <button class="row" @click="bookSettingsOpen = true">
      <span class="row-icon"><AppIcon name="book" :size="18" :stroke="2" /></span>
      <span class="grow">账本设置</span>
      <small class="faint">结算日 · AA · 分类</small>
      <AppIcon name="chevronRight" :size="16" class="chev" />
    </button>
    <button class="row" @click="aboutPageOpen = true">
      <span class="row-icon"><AppIcon name="heart" :size="18" :stroke="2" /></span>
      <span class="grow">关于</span>
      <small class="faint">算法说明 · 反馈</small>
      <AppIcon name="chevronRight" :size="16" class="chev" />
    </button>
  </section>

  <section v-if="isDev" class="card group dev">
    <button class="row" :disabled="seeding" @click="onSeed">
      <AppIcon name="sparkles" :size="18" />
      <span class="grow">{{ seeding ? '插入中…' : '插入测试数据' }}</span>
      <small class="faint">仅开发模式</small>
    </button>
    <button class="row" @click="previewRecap">
      <AppIcon name="gift" :size="18" />
      <span class="grow">预览月末回顾</span>
      <small class="faint">仅开发模式</small>
    </button>
  </section>

  <!-- 底部：和上面分开 -->
  <section class="exits">
    <button class="exit leave" :disabled="bookActionLoading" @click="onLeave">退出账本</button>
    <button class="exit logout" @click="onSignOut">退出登录</button>
  </section>
</template>

<style scoped>
.card {
  background: var(--card);
  border-radius: var(--radius);
  margin-bottom: 12px;
}
.profile {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 18px 16px;
  text-align: left;
}
.profile:active {
  background: #f7f7f9;
}
.profile-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.profile-text b {
  font-size: 19px;
}
.profile-text small {
  font-size: 13px;
  color: var(--text-soft);
}
.profile-text em {
  font-style: normal;
  font-weight: 600;
  color: var(--partner-text);
}
.avatar {
  width: 56px;
  height: 56px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 24px;
  font-weight: 700;
  font-style: normal;
}
.avatar.sm {
  width: 26px;
  height: 26px;
  font-size: 12px;
}
.avatar.me {
  background: var(--me);
}
.avatar.partner {
  background: var(--partner);
}
.members {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 16px;
}
.label {
  font-size: 14px;
  color: var(--text-soft);
  flex-shrink: 0;
}
.people {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.person {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
}
.invite {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 12px;
}
.group {
  overflow: hidden;
}
.row {
  width: 100%;
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  font-size: 15px;
  text-align: left;
  position: relative;
}
.row + .row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 58px;
  right: 0;
  border-top: 1px solid var(--line);
}
button.row:active {
  background: #f2f2f5;
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
.grow {
  flex: 1;
}
.faint {
  color: var(--text-faint);
  font-size: 12px;
}
.chev {
  color: var(--text-faint);
  flex-shrink: 0;
}
select {
  border: none;
  background: var(--bg);
  border-radius: 8px;
  padding: 6px 10px;
  font: inherit;
  font-size: 13px;
  color: var(--primary);
}
.mono {
  font-family: var(--mono);
  letter-spacing: 1px;
}
.dev {
  border: 1.5px dashed #d1d1d6;
  background: transparent;
}
.dev .row {
  color: var(--primary);
}
.exits {
  margin-top: 28px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.exit {
  height: 48px;
  border-radius: var(--radius);
  background: var(--card);
  font-size: 15px;
}
.exit:active {
  opacity: 0.8;
}
.leave {
  color: #f08c00;
  font-weight: 600;
}
.logout {
  color: var(--text-faint);
}
</style>
