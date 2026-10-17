<script setup lang="ts">
import { computed, ref } from 'vue'
import GenderPicker from '../components/GenderPicker.vue'
import ColorPicker from '../components/ColorPicker.vue'
import { useBooks } from '../composables/useBooks'
import { authDisplayName, useSupabaseAuth } from '../composables/useSupabaseAuth'
import { toast } from '../composables/useToast'
import type { Gender, MemberColor } from '../types'
import { defaultColorFor, firstFreeColor, swatchOf } from '../utils/palette'

const { updateProfile, signOut } = useSupabaseAuth()
const { me, partner, updateMyGender, updateMyColor } = useBooks()

const gender = ref<Gender | null>(null)
/** 没手动选过颜色时，跟着性别给默认色 */
const pickedColor = ref<MemberColor | null>(null)
const takenColor = computed(() => partner.value?.color ?? null)
const color = computed<MemberColor>(
  () => pickedColor.value ?? firstFreeColor(defaultColorFor(gender.value), takenColor.value),
)
const saving = ref(false)
const initial = computed(() => authDisplayName.value.slice(0, 1).toUpperCase())

const tone = computed(() => ({ bg: gender.value || pickedColor.value ? swatchOf(color.value).color : '#C7C7CC' }))

const submit = async () => {
  if (!gender.value) {
    toast.warning('请选择性别')
    return
  }
  saving.value = true
  const { error } = await updateProfile({ gender: gender.value, color: color.value })
  // 已经在账本里的话，顺便同步到成员信息
  if (!error && me.value) {
    await updateMyGender(gender.value)
    if (color.value !== takenColor.value) await updateMyColor(color.value)
  }
  saving.value = false
  if (error) toast.error(error.message, { title: '注册失败' })
  else toast.success('注册完成')
}
</script>

<template>
  <div class="profile">
    <div class="steps"><span class="on" /><span /></div>
    <header>
      <h1>完善注册资料</h1>
      <p>选好后就可以创建或加入账本了</p>
    </header>

    <section class="card">
      <div class="avatar" :style="{ background: tone.bg }">{{ initial }}</div>
      <p class="name">{{ authDisplayName }}</p>
      <p class="from">来自 Google 账号</p>
    </section>

    <section class="card">
      <h2>性别 <small>必填</small></h2>
      <p class="tip">之后可以在「我的」里修改。</p>
      <GenderPicker v-model="gender" />
    </section>

    <section class="card">
      <h2>我的颜色 <span class="color-name" :style="{ color: swatchOf(color).text }">{{ swatchOf(color).name }}</span></h2>
      <p class="tip">账单上用这个颜色标记你。默认女生粉、男生蓝，也可以随便换；两个人不能选同一个颜色。</p>
      <ColorPicker
        :model-value="color"
        :taken="takenColor"
        @update:model-value="pickedColor = $event"
        @blocked="toast.info('这个颜色对方在用了，换一个吧')"
      />
    </section>

    <button class="primary" :disabled="saving" @click="submit">{{ saving ? '保存中…' : '下一步' }}</button>
    <button class="logout" @click="signOut">换个账号登录</button>
  </div>
</template>

<style scoped>
.profile {
  max-width: 440px;
  margin: 0 auto;
  min-height: 100vh;
  padding: calc(40px + env(safe-area-inset-top, 0px)) 20px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.steps {
  display: flex;
  gap: 6px;
}
.steps span {
  width: 24px;
  height: 4px;
  border-radius: 999px;
  background: #e0e0e5;
}
.steps span.on {
  background: var(--primary);
}
h1 {
  margin: 8px 0 4px;
  font-size: 26px;
}
header p {
  margin: 0;
  color: var(--text-soft);
}
.card {
  background: var(--card);
  border-radius: var(--radius);
  padding: 20px;
}
.card:first-of-type {
  text-align: center;
}
.color-name {
  font-size: 13px;
  font-weight: 600;
  margin-left: 6px;
}
.avatar {
  width: 64px;
  height: 64px;
  margin: 0 auto 10px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 28px;
  font-weight: 700;
  transition: background 0.2s;
}
.name {
  margin: 0;
  font-weight: 600;
  font-size: 17px;
}
.from {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-faint);
}
h2 {
  margin: 0;
  font-size: 16px;
}
h2 small {
  font-size: 11px;
  font-weight: 500;
  color: var(--danger);
  margin-left: 4px;
}
.tip {
  margin: 6px 0 14px;
  font-size: 13px;
  color: var(--text-soft);
  line-height: 1.6;
}
.primary {
  height: 50px;
  border-radius: 14px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  font-size: 16px;
}
.primary:disabled {
  opacity: 0.6;
}
.logout {
  color: var(--text-faint);
  font-size: 14px;
  padding: 8px;
}
</style>
