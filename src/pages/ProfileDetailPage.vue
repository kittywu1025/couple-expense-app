<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import BottomSheet from '../components/BottomSheet.vue'
import ColorPicker from '../components/ColorPicker.vue'
import { useBooks } from '../composables/useBooks'
import { useSupabaseAuth } from '../composables/useSupabaseAuth'
import { closeProfilePage, confirmAction } from '../composables/useUi'
import { toast } from '../composables/useToast'
import type { MemberColor } from '../types'
import { swatchOf } from '../utils/palette'

const { me, partner, tones, updateMyColor, updateMyName } = useBooks()
const { authUser, authDisplayName, authGender, updateProfile, signOut } = useSupabaseAuth()

const myName = computed(() => me.value?.displayName || authDisplayName.value)
const initial = computed(() => myName.value.slice(0, 1).toUpperCase())
const mySwatch = computed(() => swatchOf(tones.value.me))
const partnerName = computed(() => partner.value?.displayName ?? 'TA')
const appVersion = __APP_VERSION__.split('-')[0]

const formatDay = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

// ── 昵称 ──
const NAME_MAX = 12
const nameSheetOpen = ref(false)
const nameDraft = ref('')
const nameInput = ref<HTMLInputElement | null>(null)
const savingName = ref(false)
const nameError = computed(() => {
  const v = nameDraft.value.trim()
  if (!v) return '昵称不能为空'
  if (v.length > NAME_MAX) return `最多 ${NAME_MAX} 个字`
  return ''
})

const openNameSheet = async () => {
  nameDraft.value = myName.value
  nameSheetOpen.value = true
  await nextTick()
  setTimeout(() => nameInput.value?.focus(), 280)
}

const saveName = async () => {
  if (nameError.value || savingName.value) return
  const next = nameDraft.value.trim()
  if (next === myName.value) {
    nameSheetOpen.value = false
    return
  }
  savingName.value = true
  const profile = await updateProfile({ nickname: next })
  const member = profile.error ? profile : await updateMyName(next)
  savingName.value = false
  if (member.error) {
    toast.error(member.error.message)
    return
  }
  nameSheetOpen.value = false
  toast.success('昵称已更新')
}

const genderLabel = computed(() => (me.value?.gender ?? authGender.value) === 'male' ? '男生' : (me.value?.gender ?? authGender.value) === 'female' ? '女生' : '未设置')

// ── 标识颜色 ──
const colorOpen = ref(false)
const onColor = async (c: MemberColor) => {
  if (c === tones.value.me) return
  const { error } = await updateMyColor(c)
  if (error) {
    toast.error(error.message)
    return
  }
  await updateProfile({ color: c })
  toast.success(`已换成「${swatchOf(c).name}」`)
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
  else closeProfilePage()
}
</script>

<template>
  <div class="page">
    <header class="nav">
      <button class="back" aria-label="返回" @click="closeProfilePage">
        <AppIcon name="chevronLeft" :size="22" :stroke="2.2" />我的
      </button>
      <h1>个人资料</h1>
      <span />
    </header>

    <div class="body">
      <section class="hero">
        <div class="avatar" :style="{ background: mySwatch.color }">{{ initial }}</div>
        <p class="name">{{ myName }}</p>
        <p class="sub">{{ authUser?.email }}</p>
      </section>

      <h2 class="section-title">基本资料</h2>
      <section class="group">
        <button class="row" @click="openNameSheet">
          <span class="label">昵称</span>
          <span class="value">{{ myName }}</span>
          <AppIcon name="chevronRight" :size="16" class="chev" />
        </button>
        <div class="row">
          <span class="label">性别</span>
          <span class="value">
            {{ genderLabel }}
            <small class="locked"><AppIcon name="lock" :size="11" :stroke="2" />不可修改</small>
          </span>
        </div>
        <button class="row" :aria-expanded="colorOpen" @click="colorOpen = !colorOpen">
          <span class="label">标识颜色</span>
          <span class="value color-value">
            <i class="swatch" :style="{ background: mySwatch.color }" />{{ mySwatch.name }}
          </span>
          <AppIcon name="chevronRight" :size="16" :class="['chev', { open: colorOpen }]" />
        </button>
        <transition name="expand">
          <div v-if="colorOpen" class="row color-row">
            <ColorPicker
              :model-value="tones.me"
              :taken="partner ? tones.partner : null"
              :taken-label="partner?.displayName"
              @update:model-value="onColor"
              @blocked="toast.info('对方已选择该颜色，请重新选择')"
            />
            <p class="hint">账单圆点、头像、AA 滑条都会用这个颜色，不能和 {{ partnerName }} 一样。</p>
          </div>
        </transition>
      </section>

      <h2 class="section-title">共同记账</h2>
      <section class="group">
        <div class="row">
          <span class="label">记账伙伴</span>
          <span v-if="partner" class="value">
            <i class="swatch" :style="{ background: swatchOf(tones.partner).color }" />{{ partner.displayName }}
          </span>
          <span v-else class="value faint">等待 TA 用邀请码加入</span>
        </div>
        <div class="row">
          <span class="label">加入账本</span>
          <span class="value">{{ formatDay(me?.joinedAt) }}</span>
        </div>
      </section>

      <h2 class="section-title">账号</h2>
      <section class="group">
        <div class="row">
          <span class="label">登录方式</span>
          <span class="value"><b class="google">G</b>Google</span>
        </div>
        <div class="row">
          <span class="label">邮箱</span>
          <span class="value ellipsis">{{ authUser?.email ?? '—' }}</span>
        </div>
        <div class="row">
          <span class="label">注册时间</span>
          <span class="value">{{ formatDay(authUser?.created_at) }}</span>
        </div>
      </section>

      <section class="group">
        <button class="row center danger" @click="onSignOut">退出登录</button>
      </section>

      <p class="version">两个人的账本 · v{{ appVersion }}</p>
    </div>

    <BottomSheet :open="nameSheetOpen" @close="nameSheetOpen = false">
      <h3 class="sheet-title">修改昵称</h3>
      <p class="sheet-tip">对方在账单和结算里看到的就是这个名字</p>
      <div :class="['field', { invalid: !!nameError && nameDraft.length > 0 }]">
        <input
          ref="nameInput"
          v-model="nameDraft"
          :maxlength="NAME_MAX + 4"
          placeholder="输入昵称"
          enterkeyhint="done"
          @keyup.enter="saveName"
        />
        <button v-if="nameDraft" class="clear" aria-label="清空" @click="nameDraft = ''">
          <AppIcon name="close" :size="12" :stroke="2.6" />
        </button>
      </div>
      <p class="counter">
        <span class="err">{{ nameDraft.length ? nameError : '' }}</span>
        <span :class="{ over: nameDraft.trim().length > NAME_MAX }">{{ nameDraft.trim().length }}/{{ NAME_MAX }}</span>
      </p>
      <button class="save" :disabled="!!nameError || savingName" @click="saveName">
        {{ savingName ? '保存中…' : '保存' }}
      </button>
    </BottomSheet>
  </div>
</template>

<style scoped>
.page {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: var(--bg);
  overflow-y: auto;
}
.nav {
  position: sticky;
  top: 0;
  z-index: 1;
  display: grid;
  grid-template-columns: 80px 1fr 80px;
  align-items: center;
  padding: calc(8px + env(safe-area-inset-top, 0px)) 8px 8px;
  background: rgba(245, 245, 247, 0.9);
  backdrop-filter: blur(16px);
}
.nav h1 {
  margin: 0;
  text-align: center;
  font-size: 17px;
}
.back {
  display: flex;
  align-items: center;
  color: var(--primary);
  font-size: 16px;
  padding: 6px 4px;
}
.body {
  max-width: 560px;
  margin: 0 auto;
  padding: 8px 16px calc(32px + env(safe-area-inset-bottom, 0px));
}
.hero {
  text-align: center;
  padding: 12px 0 8px;
}
.avatar {
  width: 80px;
  height: 80px;
  margin: 0 auto 10px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 34px;
  font-weight: 700;
  transition: background 0.2s;
}
.name {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
}
.sub {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text-faint);
}
.section-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-soft);
  margin: 22px 6px 8px;
}
.group {
  background: var(--card);
  border-radius: var(--radius);
  overflow: hidden;
}
.group:last-of-type {
  margin-top: 22px;
}
.row {
  width: 100%;
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  font-size: 15px;
  text-align: left;
  position: relative;
}
.row + .row::before {
  content: '';
  position: absolute;
  top: 0;
  left: 16px;
  right: 0;
  border-top: 1px solid var(--line);
}
button.row:active {
  background: #f2f2f5;
}
.label {
  flex-shrink: 0;
}
.value {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  color: var(--text-soft);
}
.ellipsis {
  display: block;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.faint {
  color: var(--text-faint);
}
.chev {
  color: var(--text-faint);
  transition: transform 0.2s;
}
.chev.open {
  transform: rotate(90deg);
}
.locked {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 11px;
  color: var(--text-faint);
  background: var(--bg);
  padding: 2px 6px;
  border-radius: 999px;
}
.swatch {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.color-row {
  flex-direction: column;
  align-items: stretch;
}
.hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-faint);
}
.google {
  font-weight: 800;
  background: conic-gradient(#ea4335 0 25%, #fbbc05 0 50%, #34a853 0 75%, #4285f4 0);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.center {
  justify-content: center;
}
.danger {
  color: var(--danger);
}
.version {
  text-align: center;
  font-size: 11px;
  color: var(--text-faint);
  margin: 20px 0 0;
}
.expand-enter-active,
.expand-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
.sheet-title {
  margin: 0;
  text-align: center;
  font-size: 16px;
}
.sheet-tip {
  margin: 4px 0 14px;
  text-align: center;
  font-size: 12px;
  color: var(--text-faint);
}
.field {
  position: relative;
}
.field input {
  width: 100%;
  height: 48px;
  border-radius: 12px;
  border: 1.5px solid transparent;
  background: var(--bg);
  padding: 0 40px 0 14px;
  font-size: 16px;
  outline: none;
  transition: border-color 0.15s;
}
.field input:focus {
  border-color: var(--primary);
}
.field.invalid input {
  border-color: var(--danger);
}
.clear {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #c7c7cc;
  color: #fff;
  display: grid;
  place-items: center;
}
.counter {
  display: flex;
  justify-content: space-between;
  margin: 6px 2px 14px;
  font-size: 12px;
  color: var(--text-faint);
}
.err,
.over {
  color: var(--danger);
}
.save {
  width: 100%;
  height: 48px;
  border-radius: 14px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  font-size: 16px;
}
.save:disabled {
  opacity: 0.5;
}
</style>
