<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import TabBar from './components/TabBar.vue'
import ToastViewport from './components/ToastViewport.vue'
import AuthPage from './pages/AuthPage.vue'
import AddExpensePage from './pages/AddExpensePage.vue'
import BookSetupPage from './pages/BookSetupPage.vue'
import CalendarPage from './pages/CalendarPage.vue'
import HomePage from './pages/HomePage.vue'
import RecordsPage from './pages/RecordsPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import StatsPage from './pages/StatsPage.vue'
import { applyPwaUpdate, checkForPwaUpdate, dismissPwaUpdate, usePwaUpdate } from './composables/usePwaUpdate'
import { useBooks } from './composables/useBooks'
import { useExpenses } from './composables/useExpenses'
import { useSupabaseAuth } from './composables/useSupabaseAuth'
import { toast } from './composables/useToast'

const { authUser, authLoading, isSupabaseEnabled } = useSupabaseAuth()
const { needsBookSetup } = useBooks()
const { refreshExpenses } = useExpenses()
const { updateAvailable, updateMessage, isApplyingUpdate } = usePwaUpdate()

const tabs = [
  { key: 'home', label: '首页', icon: '⌂' },
  { key: 'records', label: '记录', icon: '≣' },
  { key: 'stats', label: '统计', icon: '◔' },
  { key: 'settings', label: '设置', icon: '⚙' },
]

const activeTab = ref('home')
const visibleTab = computed(() => (activeTab.value === 'calendar' ? 'home' : activeTab.value))
const editingExpenseId = ref<string | null>(null)
const afterSaveTab = ref<'home' | 'records'>('home')
const pullState = ref<'idle' | 'pulling' | 'ready' | 'refreshing' | 'done'>('idle')
const pullDistance = ref(0)
const touchStartY = ref(0)
const isTrackingPull = ref(false)

if (typeof window !== 'undefined' && window.sessionStorage.getItem('pwa-updated') === '1') {
  window.sessionStorage.removeItem('pwa-updated')
  toast.success('已更新到最新版本。')
}

const openNewExpense = (returnTab: 'home' | 'records' = 'home') => {
  editingExpenseId.value = null
  afterSaveTab.value = returnTab
  activeTab.value = 'add'
}

const openEditExpense = (expenseId: string, returnTab: 'home' | 'records' = 'records') => {
  editingExpenseId.value = expenseId
  afterSaveTab.value = returnTab
  activeTab.value = 'add'
}

const handleSaved = (message: string) => {
  toast.success(message)
  editingExpenseId.value = null
  activeTab.value = afterSaveTab.value
}

const handleCancelForm = () => {
  editingExpenseId.value = null
  activeTab.value = afterSaveTab.value
}

const handleTabChange = (tab: string) => {
  editingExpenseId.value = null
  activeTab.value = tab
}

const handleDeleteSuccess = () => {
  toast.success('已删除这笔记录。')
}

const pullMessage = computed(() => {
  if (pullState.value === 'refreshing') return '正在刷新'
  if (pullState.value === 'done') return '已是最新'
  if (pullState.value === 'ready') return '松开刷新'
  if (pullState.value === 'pulling') return '下拉刷新'
  return ''
})

const resetPullState = () => {
  pullDistance.value = 0
  isTrackingPull.value = false
  if (pullState.value !== 'refreshing') {
    pullState.value = 'idle'
  }
}

const finishPullState = (message: '已是最新' | '已更新') => {
  pullState.value = 'done'
  toast.info(message)
  window.setTimeout(() => {
    if (pullState.value === 'done') {
      pullState.value = 'idle'
    }
  }, 900)
}

const handleRefresh = async () => {
  pullState.value = 'refreshing'
  pullDistance.value = 72
  await refreshExpenses()
  await checkForPwaUpdate()
  finishPullState('已是最新')
}

const handleTouchStart = (event: TouchEvent) => {
  if (window.scrollY > 0 || pullState.value === 'refreshing' || activeTab.value === 'add') {
    resetPullState()
    return
  }

  touchStartY.value = event.touches[0]?.clientY || 0
  isTrackingPull.value = true
}

const handleTouchMove = (event: TouchEvent) => {
  if (!isTrackingPull.value || window.scrollY > 0) return

  const currentY = event.touches[0]?.clientY || 0
  const distance = Math.max(0, currentY - touchStartY.value)
  if (distance <= 0) {
    resetPullState()
    return
  }

  pullDistance.value = Math.min(distance * 0.45, 84)
  pullState.value = pullDistance.value >= 54 ? 'ready' : 'pulling'
}

const handleTouchEnd = async () => {
  if (!isTrackingPull.value) return
  isTrackingPull.value = false

  if (pullState.value === 'ready') {
    await handleRefresh()
    return
  }

  resetPullState()
}

watch(
  [updateAvailable, updateMessage, isApplyingUpdate],
  ([visible, message, applying]) => {
    if (!visible) {
      toast.dismiss('pwa-update')
      return
    }

    toast.info(message, {
      id: 'pwa-update',
      title: '发现新版本',
      duration: 0,
      actions: [
        {
          label: '稍后',
          kind: 'text',
          onClick: () => dismissPwaUpdate(),
        },
        {
          label: applying ? '正在刷新' : '立即刷新',
          kind: 'primary',
          disabled: applying,
          onClick: () => applyPwaUpdate(),
        },
      ],
    })
  },
  { immediate: true }
)

</script>

<template>
  <div class="app-shell" v-if="authLoading">
    <div class="page-card centered-card">
      <p class="section-kicker">正在加载</p>
      <h2>检查同步状态中</h2>
    </div>
  </div>

  <div class="app-shell" v-else>
    <AuthPage v-if="isSupabaseEnabled && !authUser" />

    <template v-else>
      <div
        v-if="pullMessage"
        class="pull-refresh-indicator"
        :style="{ transform: `translate(-50%, ${Math.min(pullDistance, 72) - 72}px)` }"
      >
        {{ pullMessage }}
      </div>

      <main
        class="page-stack"
        @touchstart.passive="handleTouchStart"
        @touchmove.passive="handleTouchMove"
        @touchend="handleTouchEnd"
        @touchcancel="resetPullState"
      >
        <BookSetupPage v-if="needsBookSetup" />
        <HomePage
          v-else-if="activeTab === 'home'"
          @add="openNewExpense('home')"
          @edit="openEditExpense($event, 'home')"
          @open-calendar="handleTabChange('calendar')"
          @open-settings="handleTabChange('settings')"
        />
        <CalendarPage
          v-else-if="activeTab === 'calendar'"
          @back="handleTabChange('home')"
          @edit="openEditExpense($event, 'home')"
        />
        <AddExpensePage
          v-else-if="activeTab === 'add'"
          :expense-id="editingExpenseId"
          @saved="handleSaved"
          @cancel="handleCancelForm"
        />
        <RecordsPage
          v-else-if="activeTab === 'records'"
          @edit="openEditExpense($event, 'records')"
          @deleted="handleDeleteSuccess"
        />
        <StatsPage v-else-if="activeTab === 'stats'" />
        <SettingsPage v-else-if="activeTab === 'settings'" />
      </main>

      <TabBar
        v-if="!needsBookSetup"
        :tabs="tabs"
        :active-tab="visibleTab"
        @change="handleTabChange"
      />
    </template>
  </div>

  <ToastViewport />
</template>
