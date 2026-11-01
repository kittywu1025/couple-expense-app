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
import LoansPage from './pages/LoansPage.vue'
import SettlePage from './pages/SettlePage.vue'
import { useLoans } from './composables/useLoans'
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
import { formatMoney } from './utils/format'
import { otherPart } from './utils/settlement'
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
  confirmAction,
  editingRecord,
  fixedPageOpen,
  loansPageOpen,
  openAddSheet,
  settlePageOpen,
  profilePageOpen,
  rulesPageOpen,
} from './composables/useUi'

const { authUser, authLoading, authGender, isSupabaseEnabled } = useSupabaseAuth()
const { currentBook, booksLoading, loadBook, me, partner } = useBooks()
const partnerName = computed(() => partner.value?.displayName ?? 'TA')
const { loadRecords } = useRecords()
const { load: loadLoans } = useLoans()
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
  loansPageOpen.value = false
  settlePageOpen.value = false
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

// 进入账本、回到前台时检查到期的固定收支，自动记账
const { generateDue } = useFixedExpenses()
const { records: allRecords } = useRecords()
const runFixedExpenses = async () => {
  const before = new Set(allRecords.value.map((r) => r.id))
  const count = await generateDue()
  if (!count) return
  // 只提和我有关的固定扣款；固定收入（不管是谁这边生成的）由下面的「到账啦」提醒
  const uid = authUser.value?.id
  const expenses = allRecords.value.filter(
    (r) => !before.has(r.id) && r.kind === 'expense' && (r.type === 'shared' || r.payerUid === uid),
  ).length
  if (expenses) toast.success(`已自动记入 ${expenses} 笔固定扣款`)
}

// 工资这类固定收入到账：最近 3 天自动记下、我还没看过的，提醒一声（对方那边先生成的也会提醒）
const incomeSeenKey = computed(() => `couple-expense-income-seen:${currentBook.value?.id ?? ''}:${authUser.value?.id ?? ''}`)
watch(
  () => (screen.value === 'app' ? { list: allRecords.value, uid: authUser.value?.id } : null),
  (cur) => {
    if (!cur?.uid) return
    let seen: string[] = []
    try {
      seen = JSON.parse(localStorage.getItem(incomeSeenKey.value) ?? '[]')
    } catch {
      // 读不到就当没看过
    }
    const since = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10)
    const fresh = cur.list.filter(
      (r) => r.kind === 'income' && r.payerUid === cur.uid && r.note?.endsWith('（固定收入）') && r.date >= since && !seen.includes(r.id),
    )
    if (!fresh.length) return
    for (const r of fresh) {
      toast.success(`已记入 ${formatMoney(r.amount)}，金额不一样的话点进去改`, { title: `${r.note?.replace('（固定收入）', '')}到账啦` })
    }
    try {
      localStorage.setItem(incomeSeenKey.value, JSON.stringify([...seen, ...fresh.map((r) => r.id)].slice(-50)))
    } catch {
      // 存不了最多下次再提醒一次
    }
  },
  { immediate: true },
)
watch(
  () => (screen.value === 'app' ? currentBook.value?.id : null),
  (id) => {
    if (id) runFixedExpenses()
  },
  { immediate: true },
)

// TA 点了「提醒 TA」：打开网页时弹一次窗（同一次提醒只弹一次，记在这台手机上）
const nudgeKey = computed(() => `couple-expense-nudge-seen:${currentBook.value?.id ?? ''}:${authUser.value?.id ?? ''}`)
let nudgeShowing = false
watch(
  () => (screen.value === 'app' ? { list: allRecords.value, uid: authUser.value?.id } : null),
  async (cur) => {
    const list = cur?.list
    if (!list || nudgeShowing) return
    let seen = ''
    try {
      seen = localStorage.getItem(nudgeKey.value) ?? ''
    } catch {
      // 存不了就每次打开都提醒
    }
    const uid = authUser.value?.id
    const nudged = list.filter((r) => r.payerUid === uid && r.paidClaimedAt && r.paidNudgedAt && !r.settledOnSpot)
    const latest = nudged.reduce((m, r) => (r.paidNudgedAt! > m ? r.paidNudgedAt! : m), '')
    if (!latest || latest <= seen) return
    nudgeShowing = true
    try {
      localStorage.setItem(nudgeKey.value, latest)
    } catch {
      // 同上
    }
    const total = nudged.reduce((s, r) => s + otherPart(r), 0)
    const ok = await confirmAction({
      title: `${partnerName.value} 提醒你确认收到`,
      message: `TA 说已经给了你 ${nudged.length} 笔 AA，共 ${formatMoney(total)}。收到了的话去「结清」点一下确认收到。`,
      confirmText: '去确认',
    })
    nudgeShowing = false
    if (ok) settlePageOpen.value = true
  },
  { immediate: true },
)

// 回到前台时刷新，拿到对方新记的账
const refreshOnVisible = () => {
  if (document.visibilityState !== 'visible' || screen.value !== 'app') return
  loadBook().then(() => Promise.all([loadRecords(), loadLoans()])).then(runFixedExpenses)
}
onMounted(() => document.addEventListener('visibilitychange', refreshOnVisible))

// 首页、统计页下拉刷新：重新拉账本、账单，顺便检查固定扣款
const pullEnabled = computed(() => screen.value === 'app' && activeTab.value !== 'me')
const pull = usePullToRefresh(pullEnabled, async () => {
  await loadBook()
  await Promise.all([loadRecords(), loadLoans()])
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
      <LoansPage v-if="loansPageOpen" />
    </transition>
    <transition name="push">
      <SettlePage v-if="settlePageOpen" />
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
