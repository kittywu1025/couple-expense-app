<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import TabBar from './components/TabBar.vue'
import type { TabKey } from './types'
import ToastViewport from './components/ToastViewport.vue'
import ConfirmHost from './components/ConfirmHost.vue'
import AuthPage from './pages/AuthPage.vue'
import BookSetupPage from './pages/BookSetupPage.vue'
import ProfileSetupPage from './pages/ProfileSetupPage.vue'
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
import { addSheetOpen, closeAddSheet, editingRecord, openAddSheet } from './composables/useUi'

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

// 回到前台时刷新，拿到对方新记的账
const refreshOnVisible = () => {
  if (document.visibilityState !== 'visible' || screen.value !== 'app') return
  loadBook().then(loadRecords)
}
onMounted(() => document.addEventListener('visibilitychange', refreshOnVisible))
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
    <main class="main">
      <HomePage v-if="activeTab === 'home'" />
      <StatsPage v-else-if="activeTab === 'stats'" />
      <MePage v-else />
    </main>
    <TabBar v-model="activeTab" @add="openAddSheet" />
    <transition name="slide-up">
      <AddRecordPage v-if="addSheetOpen" :key="editingRecord?.id ?? 'new'" :record="editingRecord" @close="closeAddSheet" />
    </transition>
  </template>
</template>

<style scoped>
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
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.28s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
}
</style>
