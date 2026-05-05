<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSupabaseAuth } from '../composables/useSupabaseAuth'
import { toast } from '../composables/useToast'
import { toUserMessage } from '../utils/userMessage'

type AuthMode = 'login' | 'register' | 'otp'

const mode = ref<AuthMode>('login')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const submitting = ref(false)
const showExistingAccountModal = ref(false)

const { signInWithEmail, signInWithPassword, signUpWithPassword } = useSupabaseAuth()

const modeCopy: Record<AuthMode, { title: string; subtitle: string; submitLabel: string; loadingLabel: string }> = {
  login: {
    title: '登录账号',
    subtitle: '输入邮箱和密码，继续使用你们的共同账本。',
    submitLabel: '登录',
    loadingLabel: '登录中...',
  },
  register: {
    title: '注册账号',
    subtitle: '创建邮箱密码账号，之后可以直接登录，不用每次收邮件。',
    submitLabel: '注册账号',
    loadingLabel: '注册中...',
  },
  otp: {
    title: '邮箱验证登录',
    subtitle: '输入邮箱后，我们会发送一封登录邮件。请前往邮箱点击邮件中的登录链接完成登录。',
    submitLabel: '发送登录邮件',
    loadingLabel: '发送中...',
  },
}

const title = computed(() => modeCopy[mode.value].title)
const subtitle = computed(() => modeCopy[mode.value].subtitle)
const submitLabel = computed(() => (submitting.value ? modeCopy[mode.value].loadingLabel : modeCopy[mode.value].submitLabel))

const resetFeedback = () => {
  showExistingAccountModal.value = false
}

const switchMode = (nextMode: AuthMode) => {
  mode.value = nextMode
  resetFeedback()
}

const useExistingEmailForLogin = () => {
  showExistingAccountModal.value = false
  mode.value = 'login'
  password.value = ''
  confirmPassword.value = ''
  toast.info('这个邮箱已经注册过，请直接输入密码登录。')
}

const dismissExistingAccountModal = () => {
  showExistingAccountModal.value = false
  email.value = ''
  password.value = ''
  confirmPassword.value = ''
}

const handleSubmit = async () => {
  resetFeedback()

  const trimmedEmail = email.value.trim()
  if (!trimmedEmail) {
    toast.warning('请输入邮箱地址。')
    return
  }

  if (mode.value !== 'otp' && password.value.length < 6) {
    toast.warning('密码至少需要 6 位。')
    return
  }

  if (mode.value === 'register' && password.value !== confirmPassword.value) {
    toast.warning('两次输入的密码不一致。')
    return
  }

  submitting.value = true

  if (mode.value === 'login') {
    const { error } = await signInWithPassword(trimmedEmail, password.value)
    submitting.value = false

    if (error) {
      toast.error(toUserMessage(error, '登录失败，请稍后重试。'))
      return
    }
    toast.success('登录成功。')
    return
  }

  if (mode.value === 'register') {
    const { data, error, reason } = await signUpWithPassword(trimmedEmail, password.value, window.location.origin)
    submitting.value = false

    if (reason === 'email_exists') {
      showExistingAccountModal.value = true
      return
    }

    if (error) {
      toast.error(toUserMessage(error, '注册失败，请稍后重试。'))
      return
    }

    if (data?.session) {
      toast.success('注册成功，已自动登录。')
    } else {
      toast.info('验证邮件已发送，请前往邮箱点击确认链接后再返回登录。')
    }
    return
  }

  const { error } = await signInWithEmail(trimmedEmail, window.location.origin)
  submitting.value = false

  if (error) {
    toast.error(toUserMessage(error, '登录邮件发送失败，请稍后重试。'))
  } else {
    toast.info(`登录邮件已发送，请前往 ${trimmedEmail} 收件箱完成登录。`)
  }
}
</script>

<template>
  <div class="auth-page page-card">
    <div class="auth-content">
      <div class="auth-hero">
        <div class="auth-copy">
          <span class="auth-badge">Couple Expense</span>
          <h2>{{ title }}</h2>
          <p class="subtitle">{{ subtitle }}</p>
        </div>
      </div>

      <section class="section-card auth-panel">
        <div v-if="mode !== 'otp'" class="auth-mode-switch" aria-label="认证模式切换">
          <button
            type="button"
            :class="['auth-mode-tab', { active: mode === 'login' }]"
            @click="switchMode('login')"
          >
            密码登录
          </button>
          <button
            type="button"
            :class="['auth-mode-tab', { active: mode === 'register' }]"
            @click="switchMode('register')"
          >
            注册账号
          </button>
        </div>

        <div v-else class="auth-back-row">
          <button type="button" class="text-button auth-back-link" @click="switchMode('login')">
            返回邮箱 + 密码登录
          </button>
        </div>

        <form class="auth-form-body" @submit.prevent="handleSubmit">
          <label class="field-group auth-field">
            <span class="field-label">邮箱地址</span>
            <input
              type="email"
              v-model="email"
              placeholder="name@example.com"
              autocomplete="email"
            />
          </label>

          <template v-if="mode !== 'otp'">
            <label class="field-group auth-field">
              <span class="field-label">密码</span>
              <input
                type="password"
                v-model="password"
                placeholder="请输入密码"
                minlength="6"
                :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
              />
            </label>

            <label v-if="mode === 'register'" class="field-group auth-field">
              <span class="field-label">确认密码</span>
              <input
                type="password"
                v-model="confirmPassword"
                placeholder="请再次输入密码"
                minlength="6"
                autocomplete="new-password"
              />
            </label>
          </template>

          <button class="primary-button auth-submit" type="submit" :disabled="submitting">
            {{ submitLabel }}
          </button>
        </form>

        <div class="auth-footer-links">
          <button
            v-if="mode === 'login'"
            type="button"
            class="text-button"
            @click="switchMode('otp')"
          >
            忘记密码，使用邮箱登录链接
          </button>

          <button
            v-if="mode === 'register'"
            type="button"
            class="text-button"
            @click="switchMode('login')"
          >
            已有账号，返回登录
          </button>

          <button
            v-if="mode === 'otp'"
            type="button"
            class="text-button"
            @click="handleSubmit"
          >
            重新发送登录邮件
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="showExistingAccountModal"
      class="auth-modal-overlay"
      @click.self="dismissExistingAccountModal"
    >
      <section class="auth-modal" role="dialog" aria-modal="true" aria-labelledby="existing-account-title">
        <h3 id="existing-account-title">这个邮箱已经注册过</h3>
        <p>你可以直接使用这个邮箱登录。如果之前是通过邮箱登录链接使用，也可以先返回登录页再选择邮箱登录链接。</p>
        <div class="auth-modal-actions">
          <button type="button" class="primary-button auth-modal-button" @click="useExistingEmailForLogin">
            直接去登录
          </button>
          <button type="button" class="secondary-button auth-modal-button" @click="dismissExistingAccountModal">
            取消
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.auth-page {
  max-width: 460px;
  margin: 0 auto;
  padding: 28px 24px 24px;
}

.auth-content {
  display: grid;
  gap: 18px;
}

.auth-hero {
  display: grid;
  gap: 8px;
}

.auth-copy h2 {
  margin: 0;
  font-size: clamp(1.55rem, 4vw, 1.9rem);
  line-height: 1.12;
  letter-spacing: -0.03em;
}

.auth-badge {
  display: inline-flex;
  align-items: center;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.66);
  border: 1px solid rgba(174, 145, 122, 0.14);
  color: var(--accent-strong);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.auth-copy .subtitle {
  margin-top: 10px;
  font-size: 0.96rem;
  line-height: 1.65;
}

.auth-panel {
  padding: 16px;
  display: grid;
  gap: 16px;
}

.auth-mode-switch {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border-radius: 16px;
  background: rgba(246, 239, 231, 0.72);
  border: 1px solid rgba(174, 145, 122, 0.12);
}

.auth-mode-tab {
  min-height: 42px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--muted);
  font-weight: 600;
  font-size: 0.95rem;
}

.auth-mode-tab.active {
  background: rgba(255, 255, 255, 0.92);
  color: var(--accent-strong);
  box-shadow: 0 6px 16px rgba(70, 52, 38, 0.07);
}

.auth-back-row {
  display: flex;
  justify-content: flex-start;
}

.auth-back-link {
  font-weight: 600;
}

.auth-form-body {
  display: grid;
  gap: 14px;
}

.auth-field {
  gap: 9px;
}

.auth-field :deep(input) {
  min-height: 50px;
  border-radius: 16px;
  padding: 13px 15px;
}

.auth-submit {
  min-height: 50px;
  margin-top: 6px;
}

.auth-footer-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding-top: 4px;
}

.auth-modal-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(36, 50, 68, 0.34);
  backdrop-filter: blur(8px);
  z-index: 40;
}

.auth-modal {
  width: min(100%, 360px);
  padding: 22px 18px 18px;
  border-radius: 24px;
  border: 1px solid rgba(174, 145, 122, 0.14);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 24px 60px rgba(36, 50, 68, 0.18);
  display: grid;
  gap: 12px;
}

.auth-modal h3 {
  margin: 0;
  font-size: 1.15rem;
  line-height: 1.3;
}

.auth-modal p {
  margin: 0;
  color: var(--muted);
  font-size: 0.94rem;
  line-height: 1.65;
}

.auth-modal-actions {
  display: grid;
  gap: 10px;
  margin-top: 4px;
}

.auth-modal-button {
  min-height: 48px;
}

@media (max-width: 640px) {
  .auth-page {
    padding: 22px 16px 18px;
  }

  .auth-panel {
    padding: 16px;
  }

  .auth-footer-links {
    flex-direction: column;
    align-items: flex-start;
  }

  .auth-modal-overlay {
    padding: 16px;
  }
}
</style>
