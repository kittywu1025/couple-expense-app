<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TabBar from './components/TabBar.vue'
import type { TabKey } from './types'
import ToastViewport from './components/ToastViewport.vue'
import ConfirmHost from './components/ConfirmHost.vue'
import AuthPage from './pages/AuthPage.vue'
import BookSetupPage from './pages/BookSetupPage.vue'
import ProfileSetupPage from './pages/ProfileSetupPage.vue'
import ProfileDetailPage from './pages/ProfileDetailPage.vue'
import FixedExpensesPage from './pages/FixedExpensesPage.vue'
import AboutPage from './pages/AboutPage.vue'
import CalendarPage from './pages/CalendarPage.vue'
import BookSettingsPage from './pages/BookSettingsPage.vue'
import MonthRecap from './components/MonthRecap.vue'
import InviteSheet from './components/InviteSheet.vue'
import AppIcon from './components/AppIcon.vue'
import { usePullToRefresh } from './composables/usePullToRefresh'
import { clearPendingInvite, pendingInvite } from './composables/useInvite'
import SettlementRulesPage from './pages/SettlementRulesPage.vue'
import { useFixedExpenses } from './composables/useFixedExpenses'
// 本机偏好（金额配色等）在启动时就要生效
import './composables/usePrefs'
import HomePage from './pages/HomePage.vue'
import StatsPage from './pages/StatsPage.vue'
import MePage from './pages/MePage.vue'
import AddRecordPage from './pages/AddRecordPage.vue'
import { useSupabaseAuth } from './composables/useSupabaseAuth'
import { useBooks } from './composables/useBooks'
import { useRecords } from './composables/useRecords'
import { applyPwaUpdate, dismissPwaUpdate, usePwaUpdate } from './composables/usePwaUpdate'
import { toast } from './composables/useToast'
import { isDemoMode } from './lib/demo'
import {
  aboutPageOpen,
  addSheetOpen,
  bookSettingsOpen,
  calendarPageOpen,
  closeAddSheet,
  editingRecord,
  fixedPageOpen,
  openAddSheet,
  profilePageOpen,
  rulesPageOpen,
} from './composables/useUi'

const { authUser, authLoading, authGender, isSupabaseEnabled } = useSupabaseAuth()
const { currentBook, booksLoading, loadBook, me } = useBooks()
const { loadRecords } = useRecords()
const { updateAvailable, updateMessage } = usePwaUpdate()

const activeTab = ref<TabKey>('home')

// 新注册（还没选性别）的用户先完善资料；老账本里已有性别的成员直接放行
const needsProfile = computed(() => !authGender.value && !me.value?.gender)

const screen = computed(() => {
  if (isDemoMode) return !currentBook.value ? 'loading' : needsProfile.value ? 'profile' : 'app'
  if (!isSupabaseEnabled) return 'unconfigured'
  if (authLoading.value) return 'loading'
  if (!authUser.value) return 'auth'
  if (booksLoading.value && !currentBook.value) return 'loading'
  if (needsProfile.value) return 'profile'
  if (!currentBook.value) return 'setup'
  return 'app'
})

// 离开主界面（退出账本 / 退出登录）时把二级页、弹窗都收起，重新进来不会停在半路
watch(screen, (next) => {
  if (next === 'app') return
  profilePageOpen.value = false
  fixedPageOpen.value = false
  aboutPageOpen.value = false
  rulesPageOpen.value = false
  calendarPageOpen.value = false
  bookSettingsOpen.value = false
  closeAddSheet()
  activeTab.value = 'home'
})

// 已经在账本里又点了别人的邀请链接：一个人只能在一个账本，提示一下就好
watch(
  () => screen.value === 'app' && !!pendingInvite.value,
  (stale) => {
    if (!stale) return
    clearPendingInvite()
    toast.info('你已经在一个账本里了，邀请链接就不用了')
  },
  { immediate: true },
)

// 进入账本、回到前台时检查到期的固定扣款，自动记账
const { generateDue } = useFixedExpenses()
const runFixedExpenses = async () => {
  const count = await generateDue()
  if (count) toast.success(`已自动记入 ${count} 笔固定扣款`)
}
watch(
  () => (screen.value === 'app' ? currentBook.value?.id : null),
  (id) => {
    if (id) runFixedExpenses()
  },
  { immediate: true },
)

// 回到前台时刷新，拿到对方新记的账
const refreshOnVisible = () => {
  if (document.visibilityState !== 'visible' || screen.value !== 'app') return
  loadBook().then(loadRecords).then(runFixedExpenses)
}
onMounted(() => document.addEventListener('visibilitychange', refreshOnVisible))

// 首页、统计页下拉刷新：重新拉账本、账单，顺便检查固定扣款
const pullEnabled = computed(() => screen.value === 'app' && activeTab.value !== 'me')
const pull = usePullToRefresh(pullEnabled, async () => {
  await loadBook()
  await loadRecords()
  await runFixedExpenses()
  toast.success('已经是最新的了')
})
const pullLabel = computed(() =>
  pull.refreshing.value ? '正在刷新…' : pull.distance.value >= 64 ? '松手刷新' : '下拉刷新',
)
onBeforeUnmount(() => document.removeEventListener('visibilitychange', refreshOnVisible))

if (typeof window !== 'undefined' && window.sessionStorage.getItem('pwa-updated') === '1') {
  window.sessionStorage.removeItem('pwa-updated')
  toast.success('已更新到最新版本。')
}

watch(updateAvailable, (visible) => {
  if (!visible) {
    toast.dismiss('pwa-update')
    return
  }
  toast.info(updateMessage.value, {
    id: 'pwa-update',
    title: '有新版本',
    duration: 0,
    dismissible: false,
    actions: [
      { label: '稍后', kind: 'text', onClick: () => dismissPwaUpdate() },
      { label: '立即更新', kind: 'primary', onClick: () => applyPwaUpdate() },
    ],
  })
})
</script>

<template>
  <ToastViewport />
  <ConfirmHost />

  <div v-if="screen === 'unconfigured'" class="center">
    <p>请在 <code>.env.local</code> 中配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。</p>
  </div>
  <div v-else-if="screen === 'loading'" class="center">
    <div class="spinner" />
  </div>
  <AuthPage v-else-if="screen === 'auth'" />
  <ProfileSetupPage v-else-if="screen === 'profile'" />
  <BookSetupPage v-else-if="screen === 'setup'" />

  <template v-else>
    <div
      class="pull"
      :style="{
        height: pull.distance.value + 'px',
        opacity: Math.min(1, pull.distance.value / 40),
        transition: pull.pulling.value ? 'none' : 'height 0.25s ease, opacity 0.25s ease',
      }"
      aria-live="polite"
    >
      <span :class="['pull-icon', { spin: pull.refreshing.value }]" :style="{ transform: pull.refreshing.value ? undefined : `rotate(${pull.distance.value * 4}deg)` }">
        <AppIcon name="swap" :size="16" :stroke="2.2" />
      </span>
      <span>{{ pullLabel }}</span>
    </div>
    <main
      class="main"
      :style="{
        transform: pull.distance.value ? `translateY(${pull.distance.value}px)` : undefined,
        transition: pull.pulling.value ? 'none' : 'transform 0.25s ease',
      }"
    >
      <!-- 页面有多个根节点，Transition 需要包一层单根元素 -->
      <transition name="tab" mode="out-in">
        <div :key="activeTab">
          <HomePage v-if="activeTab === 'home'" />
          <StatsPage v-else-if="activeTab === 'stats'" />
          <MePage v-else />
        </div>
      </transition>
    </main>
    <TabBar v-model="activeTab" @add="openAddSheet" />
    <MonthRecap :show-trigger="activeTab === 'home'" />
    <InviteSheet />
    <transition name="push">
      <ProfileDetailPage v-if="profilePageOpen" />
    </transition>
    <transition name="push">
      <FixedExpensesPage v-if="fixedPageOpen" />
    </transition>
    <transition name="push">
      <AboutPage v-if="aboutPageOpen" />
    </transition>
    <transition name="push">
      <CalendarPage v-if="calendarPageOpen" />
    </transition>
    <transition name="push">
      <BookSettingsPage v-if="bookSettingsOpen" />
    </transition>
    <transition name="push">
      <SettlementRulesPage v-if="rulesPageOpen" />
    </transition>
    <transition name="slide-up">
      <AddRecordPage v-if="addSheetOpen" :key="editingRecord?.id ?? 'new'" :record="editingRecord" @close="closeAddSheet" />
    </transition>
  </template>
</template>

<style scoped>
.pull {
  position: fixed;
  top: env(safe-area-inset-top, 0px);
  left: 0;
  right: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  overflow: hidden;
  font-size: 12px;
  color: var(--text-faint);
  pointer-events: none;
}
.pull-icon {
  display: grid;
  place-items: center;
  color: var(--primary);
}
.pull-icon.spin {
  animation: spin 0.8s linear infinite;
}
.main {
  max-width: 560px;
  margin: 0 auto;
  padding: calc(16px + env(safe-area-inset-top, 0px)) 16px calc(96px + env(safe-area-inset-bottom, 0px));
}
.center {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  text-align: center;
  color: var(--text-soft);
}
.spinner {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid var(--primary-soft);
  border-top-color: var(--primary);
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.tab-enter-active,
.tab-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}
.tab-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.tab-leave-to {
  opacity: 0;
}
.push-enter-active,
.push-leave-active {
  transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.push-enter-from,
.push-leave-to {
  transform: translateX(100%);
}
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.28s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
