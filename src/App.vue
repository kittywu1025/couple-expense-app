<script setup lang="ts">
import { computed, ref } from 'vue'
import TabBar from './components/TabBar.vue'
import AuthPage from './pages/AuthPage.vue'
import AddExpensePage from './pages/AddExpensePage.vue'
import BookSetupPage from './pages/BookSetupPage.vue'
import CalendarPage from './pages/CalendarPage.vue'
import HomePage from './pages/HomePage.vue'
import RecordsPage from './pages/RecordsPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import StatsPage from './pages/StatsPage.vue'
import { applyPwaUpdate, dismissPwaUpdate, usePwaUpdate } from './composables/usePwaUpdate'
import { useBooks } from './composables/useBooks'
import { useSupabaseAuth } from './composables/useSupabaseAuth'
import { useRuntimeStatus } from './composables/useRuntimeStatus'

const { authUser, authLoading, isSupabaseEnabled } = useSupabaseAuth()
const { appError, syncWarning, clearAppError } = useRuntimeStatus()
const { needsBookSetup } = useBooks()
const { updateAvailable } = usePwaUpdate()

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
const flashMessage = ref('')
let flashTimer: ReturnType<typeof setTimeout> | null = null

const setFlashMessage = (message: string) => {
  flashMessage.value = message
  if (flashTimer) clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    flashMessage.value = ''
  }, 2400)
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
  setFlashMessage(message)
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
  setFlashMessage('记录已删除。')
}

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
      <div v-if="updateAvailable" class="update-toast" role="status" aria-live="polite">
        <div>
          <strong>发现新版本</strong>
          <p>刷新后即可使用最新界面。</p>
        </div>
        <div class="update-toast-actions">
          <button class="text-button" type="button" @click="dismissPwaUpdate">稍后</button>
          <button class="primary-button compact-button" type="button" @click="applyPwaUpdate">
            立即刷新
          </button>
        </div>
      </div>

      <div v-if="flashMessage" class="flash-message">{{ flashMessage }}</div>
      <div v-if="syncWarning && !needsBookSetup" class="warning-message">{{ syncWarning }}</div>
      <div v-if="appError" class="error-message error-banner">
        <div>
          <strong>页面运行出现问题</strong>
          <p>{{ appError }}</p>
        </div>
        <button class="secondary-button" type="button" @click="clearAppError">关闭提示</button>
      </div>

      <main class="page-stack">
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
</template>
