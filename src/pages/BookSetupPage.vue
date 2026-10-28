<script setup lang="ts">
import { ref } from 'vue'
import BottomSheet from '../components/BottomSheet.vue'
import ColorPicker from '../components/ColorPicker.vue'
import type { MemberColor } from '../types'
import { useBooks } from '../composables/useBooks'
import { authColor, authDisplayName, authGender, useSupabaseAuth } from '../composables/useSupabaseAuth'
import { MEMBER_COLORS, defaultColorFor, swatchOf } from '../utils/palette'
import { toast } from '../composables/useToast'
import AppIcon from '../components/AppIcon.vue'
import { clearPendingInvite, pendingInvite } from '../composables/useInvite'

const { createBook, joinBook, takenColorsForInvite, bookActionLoading } = useBooks()
const { signOut, updateProfile } = useSupabaseAuth()
// 通过邀请链接来的，邀请码已经填好
const invited = !!pendingInvite.value
const code = ref(pendingInvite.value ?? '')

// 性别在注册时已选好（ProfileSetupPage），这里直接带上
const requireGender = () => {
  if (authGender.value) return authGender.value
  toast.warning('请先完成注册资料')
  return null
}

const onCreate = async () => {
  const g = requireGender()
  if (!g) return
  const { error } = await createBook(g, authColor.value ?? defaultColorFor(g))
  if (error) toast.error(error.message)
  else {
    clearPendingInvite()
    toast.success('账本已创建，去「我的」里把邀请链接发给 TA 吧')
  }
}

const onJoin = async () => {
  if (code.value.trim().length !== 6) {
    toast.warning('邀请码是 6 位')
    return
  }
  const g = requireGender()
  if (!g) return
  await tryJoin(authColor.value ?? defaultColorFor(g))
}

// ── 撞色：先加入的人优先，后加入的人重选 ──
const conflictOpen = ref(false)
const takenColor = ref<MemberColor | null>(null)
const retryColor = ref<MemberColor | null>(null)

const tryJoin = async (color: MemberColor) => {
  const g = authGender.value
  if (!g) return
  const { error } = await joinBook(code.value, g, color)
  if (!error) {
    conflictOpen.value = false
    clearPendingInvite()
    toast.success('已加入账本，一起记账吧')
    return
  }
  if (error.message.includes('对方已选择该颜色')) {
    const taken = await takenColorsForInvite(code.value)
    takenColor.value = taken[0] ?? color
    retryColor.value = MEMBER_COLORS.find((c) => !taken.includes(c.key))?.key ?? null
    conflictOpen.value = true
    return
  }
  toast.error(error.message)
}

const confirmRetry = async () => {
  if (!retryColor.value) return
  await updateProfile({ color: retryColor.value })
  await tryJoin(retryColor.value)
}
</script>

<template>
  <div class="setup">
    <header>
      <p class="hi">你好，{{ authDisplayName }}</p>
      <h1>开始共同记账</h1>
    </header>

    <section class="card">
      <div class="emoji"><AppIcon name="book" :size="22" /></div>
      <h2>创建新账本</h2>
      <p>创建后会生成 6 位邀请码，发给 TA 即可加入</p>
      <button class="primary" :disabled="bookActionLoading" @click="onCreate">{{ bookActionLoading ? '请稍候…' : '创建账本' }}</button>
    </section>

    <section :class="['card', { invited }]">
      <p v-if="invited" class="invited-tip">你收到了一个邀请，邀请码已经帮你填好了</p>
      <div class="emoji"><AppIcon name="link" :size="22" /></div>
      <h2>加入 TA 的账本</h2>
      <input
        v-model="code"
        class="code"
        maxlength="6"
        placeholder="输入邀请码"
        autocapitalize="characters"
        @keyup.enter="onJoin"
      />
      <button class="outline" :disabled="bookActionLoading" @click="onJoin">{{ bookActionLoading ? '请稍候…' : '加入' }}</button>
    </section>

    <button class="logout" @click="signOut">退出登录</button>

    <BottomSheet :open="conflictOpen" @close="conflictOpen = false">
      <h3 class="sheet-title">对方已选择该颜色，请重新选择</h3>
      <p class="sheet-tip">
        TA 先加入，已经用了「{{ takenColor ? swatchOf(takenColor).name : '' }}」。换一个颜色就能加入，之后也可以在「我的」里改。
      </p>
      <ColorPicker
        :model-value="retryColor"
        :taken="takenColor"
        @update:model-value="retryColor = $event"
        @blocked="toast.info('对方已选择该颜色，请重新选择')"
      />
      <button class="primary sheet-btn" :disabled="!retryColor || bookActionLoading" @click="confirmRetry">
        用「{{ retryColor ? swatchOf(retryColor).name : '' }}」加入
      </button>
    </BottomSheet>
  </div>
</template>

<style scoped>
.setup {
  max-width: 440px;
  margin: 0 auto;
  min-height: 100vh;
  padding: calc(48px + env(safe-area-inset-top, 0px)) 20px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.hi {
  margin: 0;
  color: var(--text-soft);
}
h1 {
  margin: 4px 0 8px;
  font-size: 26px;
}
.card {
  background: var(--card);
  border-radius: var(--radius);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.emoji {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--primary-soft);
  color: var(--primary);
  display: grid;
  place-items: center;
}
h2 {
  margin: 0;
  font-size: 18px;
}
.card p {
  margin: 0;
  color: var(--text-soft);
  font-size: 14px;
}
.code {
  height: 52px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--bg);
  text-align: center;
  font-family: var(--mono);
  font-size: 22px;
  letter-spacing: 8px;
  text-transform: uppercase;
  outline: none;
}
.code:focus {
  border-color: var(--primary);
}
.primary,
.outline {
  height: 48px;
  border-radius: 12px;
  font-weight: 600;
}
.primary {
  background: var(--primary);
  color: #fff;
}
.outline {
  background: var(--primary-soft);
  color: var(--primary);
}
button:disabled {
  opacity: 0.6;
}
.setup > header {
  order: -2;
}
.card.invited {
  order: -1;
  box-shadow: 0 0 0 2px var(--primary);
}
.invited-tip {
  margin: 0 0 4px;
  padding: 6px 10px;
  border-radius: 10px;
  background: var(--primary-soft);
  color: var(--primary) !important;
  font-size: 13px;
  font-weight: 600;
}
.logout {
  margin-top: auto;
  color: var(--text-faint);
  font-size: 14px;
  padding: 12px;
}
.sheet-title {
  margin: 0;
  text-align: center;
  font-size: 16px;
}
.sheet-tip {
  margin: 6px 0 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-soft);
  line-height: 1.6;
}
.sheet-btn {
  width: 100%;
  margin-top: 18px;
}
</style>
