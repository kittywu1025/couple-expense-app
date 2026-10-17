<script setup lang="ts">
import { computed, ref } from 'vue'
import GenderPicker from '../components/GenderPicker.vue'
import ColorPicker from '../components/ColorPicker.vue'
import { useBooks } from '../composables/useBooks'
import { authDisplayName, useSupabaseAuth } from '../composables/useSupabaseAuth'
import { confirmAction } from '../composables/useUi'
import { toast } from '../composables/useToast'
import type { Gender, MemberColor } from '../types'
import { defaultColorFor, firstFreeColor, swatchOf } from '../utils/palette'

const { updateProfile, signOut } = useSupabaseAuth()
const { me, partner, updateMyGender, updateMyColor, updateMyName } = useBooks()

const NAME_MAX = 12
const nickname = ref(authDisplayName.value.slice(0, NAME_MAX))
const nameError = computed(() => {
  const v = nickname.value.trim()
  if (!v) return '请填写昵称'
  if (v.length > NAME_MAX) return `最多 ${NAME_MAX} 个字`
  return ''
})

const gender = ref<Gender | null>(null)
/** 没手动选过颜色时，跟着性别给默认色（女樱花粉 / 男天空蓝） */
const pickedColor = ref<MemberColor | null>(null)
const takenColor = computed(() => partner.value?.color ?? null)
const color = computed<MemberColor>(
  () => pickedColor.value ?? firstFreeColor(defaultColorFor(gender.value), takenColor.value),
)
const saving = ref(false)
const tried = ref(false)
const initial = computed(() => (nickname.value.trim() || authDisplayName.value).slice(0, 1).toUpperCase())
const tone = computed(() => ({ bg: gender.value || pickedColor.value ? swatchOf(color.value).color : '#C7C7CC' }))

const submit = async () => {
  tried.value = true
  if (nameError.value) {
    toast.warning(nameError.value)
    return
  }
  if (!gender.value) {
    toast.warning('请选择性别')
    return
  }
  const ok = await confirmAction({
    title: `确认性别为「${gender.value === 'female' ? '女生' : '男生'}」？`,
    message: '性别提交后不可修改，昵称和颜色之后都可以在「我的」里改。',
    confirmText: '确认提交',
  })
  if (!ok) return

  saving.value = true
  const name = nickname.value.trim()
  const { error } = await updateProfile({ nickname: name, gender: gender.value, color: color.value })
  // 已经在账本里的话（老用户补资料），同步到成员信息
  if (!error && me.value) {
    await updateMyName(name)
    if (!me.value.gender) await updateMyGender(gender.value)
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
      <h1>完善资料</h1>
      <p>填好后就可以创建或加入账本了</p>
    </header>

    <section class="card center">
      <div class="avatar" :style="{ background: tone.bg }">{{ initial }}</div>
      <p class="from">已用 Google 账号登录</p>
    </section>

    <section class="card">
      <h2>昵称 <small>必填</small></h2>
      <p class="tip">对方在账单和结算里看到的名字，之后可以在「我的」里修改。</p>
      <div :class="['field', { invalid: tried && !!nameError }]">
        <input v-model="nickname" :maxlength="NAME_MAX + 4" placeholder="输入昵称" enterkeyhint="next" />
      </div>
      <p class="counter">
        <span class="err">{{ tried || nickname.length ? nameError : '' }}</span>
        <span>{{ nickname.trim().length }}/{{ NAME_MAX }}</span>
      </p>
    </section>

    <section class="card">
      <h2>性别 <small>必填</small></h2>
      <p class="tip warn">提交后不可修改，请确认后再选。</p>
      <GenderPicker v-model="gender" />
    </section>

    <section class="card">
      <h2>我的颜色 <span class="color-name" :style="{ color: swatchOf(color).text }">{{ swatchOf(color).name }}</span></h2>
      <p class="tip">账单上用这个颜色标记你。选性别后自动给默认色，可以换成其他颜色；两个人不能选同一个颜色。</p>
      <ColorPicker
        :model-value="color"
        :taken="takenColor"
        @update:model-value="pickedColor = $event"
        @blocked="toast.info('对方已选择该颜色，请重新选择')"
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
.card.center {
  text-align: center;
}
.field input {
  width: 100%;
  height: 46px;
  border-radius: 12px;
  border: 1.5px solid transparent;
  background: var(--bg);
  padding: 0 14px;
  font-size: 16px;
  outline: none;
}
.field input:focus {
  border-color: var(--primary);
}
.field.invalid input {
  border-color: var(--danger);
}
.counter {
  display: flex;
  justify-content: space-between;
  margin: 6px 2px 0;
  font-size: 12px;
  color: var(--text-faint);
}
.err {
  color: var(--danger);
}
.tip.warn {
  color: #e8590c;
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
