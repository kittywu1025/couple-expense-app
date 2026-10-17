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
    <div class="content">
      <div class="steps"><span class="on" /><span /></div>
      <h1>完善资料</h1>
      <p class="lead">填好后就可以创建或加入账本了</p>

      <section>
        <p class="label">昵称<i>*</i></p>
        <div class="name-row">
          <div class="avatar" :style="{ background: tone.bg }">{{ initial }}</div>
          <input
            v-model="nickname"
            :class="{ invalid: tried && !!nameError }"
            :maxlength="NAME_MAX + 4"
            placeholder="输入昵称"
            enterkeyhint="done"
          />
        </div>
        <p class="hint">
          <span :class="{ err: (tried || nickname.length > 0) && !!nameError }">
            {{ (tried || nickname.length > 0) && nameError ? nameError : '对方看到的名字，之后可在「我的」修改' }}
          </span>
          <span>{{ nickname.trim().length }}/{{ NAME_MAX }}</span>
        </p>
      </section>

      <section>
        <p class="label">性别<i>*</i></p>
        <GenderPicker v-model="gender" />
        <p class="hint">提交后不可修改</p>
      </section>

      <section>
        <div class="color-row">
          <p class="label">我的颜色</p>
          <ColorPicker
            class="swatches"
            :model-value="color"
            :taken="takenColor"
            @update:model-value="pickedColor = $event"
            @blocked="toast.info('对方已选择该颜色，请重新选择')"
          />
        </div>
        <p class="hint">
          已选 <b :style="{ color: swatchOf(color).text }">{{ swatchOf(color).name }}</b>
          <template v-if="!pickedColor">· 按性别默认，点色块可更换</template>
        </p>
      </section>
    </div>

    <footer class="footer">
      <button class="primary" :disabled="saving" @click="submit">{{ saving ? '保存中…' : '下一步' }}</button>
      <button class="logout" @click="signOut">换个账号登录</button>
    </footer>
  </div>
</template>

<style scoped>
.profile {
  max-width: 440px;
  margin: 0 auto;
  min-height: 100vh;
  min-height: 100dvh;
}
.content {
  padding: calc(20px + env(safe-area-inset-top, 0px)) 20px calc(130px + env(safe-area-inset-bottom, 0px));
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
  margin: 14px 0 2px;
  font-size: 24px;
}
.lead {
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--text-soft);
}
section {
  margin-bottom: 20px;
}
.label {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.label i {
  font-style: normal;
  color: var(--danger);
  margin-left: 2px;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.avatar {
  width: 46px;
  height: 46px;
  flex-shrink: 0;
  border-radius: 50%;
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 20px;
  font-weight: 700;
  transition: background 0.2s;
}
.name-row input {
  flex: 1;
  min-width: 0;
  height: 46px;
  border-radius: 12px;
  border: 1.5px solid transparent;
  background: var(--card);
  padding: 0 14px;
  font-size: 16px;
  outline: none;
}
.name-row input:focus {
  border-color: var(--primary);
}
.name-row input.invalid {
  border-color: var(--danger);
}
.hint {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 6px 2px 0;
  font-size: 12px;
  color: var(--text-faint);
}
.hint b {
  font-weight: 600;
  margin: 0 2px;
}
.hint .err {
  color: var(--danger);
}
.color-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.color-row .label {
  margin: 0;
  flex-shrink: 0;
}
.swatches {
  flex: 1;
  min-width: 0;
}
.color-row + .hint {
  justify-content: flex-start;
}
.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  max-width: 440px;
  margin: 0 auto;
  padding: 10px 20px calc(10px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(to top, var(--bg) 75%, rgba(245, 245, 247, 0));
  display: flex;
  flex-direction: column;
  gap: 2px;
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
.primary:active {
  transform: scale(0.99);
}
.logout {
  color: var(--text-faint);
  font-size: 13px;
  padding: 8px;
}
</style>
