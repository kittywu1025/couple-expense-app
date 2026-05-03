<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useExpenses } from '../composables/useExpenses'
import { useSupabaseAuth } from '../composables/useSupabaseAuth'
import { useBooks } from '../composables/useBooks'
import { useSettings } from '../composables/useSettings'
import { SUPPORTED_CURRENCIES, formatCurrency } from '../utils/currency'

const { settings, normalizeSplit } = useSettings()
const { authUser, isSupabaseEnabled, signOut, updatePassword } = useSupabaseAuth()
const { currentBook, currentBookRole, isLocalBookMode } = useBooks()
const { monthlySummary, recurringExpenses, selectedYearMonth } = useExpenses()

const newCategory = reactive({
  name: '',
  icon: '🧾',
})
const settingsMessage = ref('')
const passwordModalOpen = ref(false)
const passwordLoading = ref(false)
const passwordError = ref('')
const passwordForm = reactive({
  nextPassword: '',
  confirmPassword: '',
})
const currencyOptions = SUPPORTED_CURRENCIES

const setSettingsMessage = (message: string) => {
  settingsMessage.value = message
  window.setTimeout(() => {
    if (settingsMessage.value === message) {
      settingsMessage.value = ''
    }
  }, 2200)
}

const monthLabel = computed(() => {
  const [year, month] = selectedYearMonth.value.split('-')
  return `${year}年${month}月`
})

const settlementText = computed(() => {
  if (Math.abs(monthlySummary.value.meNet) < 0.01) {
    return '这个月两个人分摊得比较均衡。'
  }

  if (monthlySummary.value.meNet > 0) {
    return `${settings.value.partnerName} 需要补给 ${settings.value.meName}`
  }

  return `${settings.value.meName} 需要补给 ${settings.value.partnerName}`
})

const copyInviteCode = async () => {
  if (!currentBook.value?.inviteCode) return
  try {
    await navigator.clipboard.writeText(currentBook.value.inviteCode)
    setSettingsMessage('邀请码已复制。')
  } catch (error) {
    console.error('复制邀请码失败：', error)
    setSettingsMessage('复制失败，请稍后重试。')
  }
}

const saveProfile = () => {
  settings.value.meName = settings.value.meName.trim() || '我'
  settings.value.partnerName = settings.value.partnerName.trim() || '另一半'
  settings.value.defaultSplits.standard = normalizeSplit(settings.value.defaultSplits.standard, { me: 50, partner: 50 })
  settings.value.defaultSplits.rent = normalizeSplit(settings.value.defaultSplits.rent, { me: 60, partner: 40 })
  setSettingsMessage('设置已保存到当前设备。')
}

const addCategory = () => {
  const name = newCategory.name.trim()
  if (!name) return

  settings.value.categories.push({
    id: crypto.randomUUID(),
    name,
    icon: newCategory.icon.trim() || '🧾',
  })

  newCategory.name = ''
  newCategory.icon = '🧾'
  setSettingsMessage('新分类已添加。')
}

const removeCategory = (categoryId: string) => {
  if (categoryId === 'rent' || categoryId === 'others') return
  settings.value.categories = settings.value.categories.filter((item) => item.id !== categoryId)
}

const updateSplit = (type: 'standard' | 'rent', field: 'me' | 'partner', value: number) => {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0))
  settings.value.defaultSplits[type][field] = safeValue
  settings.value.defaultSplits[type][field === 'me' ? 'partner' : 'me'] = Number((100 - safeValue).toFixed(2))
}

const handleSignOut = async () => {
  await signOut()
  setSettingsMessage('已退出登录。')
}

const openPasswordModal = () => {
  passwordError.value = ''
  passwordForm.nextPassword = ''
  passwordForm.confirmPassword = ''
  passwordModalOpen.value = true
}

const closePasswordModal = () => {
  if (passwordLoading.value) return
  passwordModalOpen.value = false
  passwordError.value = ''
  passwordForm.nextPassword = ''
  passwordForm.confirmPassword = ''
}

const handlePasswordSubmit = async () => {
  passwordError.value = ''
  const nextPassword = passwordForm.nextPassword.trim()
  const confirmPassword = passwordForm.confirmPassword.trim()

  if (!nextPassword || !confirmPassword) {
    passwordError.value = '请填写完整的新密码和确认密码。'
    return
  }

  if (nextPassword.length < 6) {
    passwordError.value = '密码至少需要 6 位。'
    return
  }

  if (nextPassword !== confirmPassword) {
    passwordError.value = '两次输入的密码不一致。'
    return
  }

  passwordLoading.value = true
  const { error } = await updatePassword(nextPassword)
  passwordLoading.value = false

  if (error) {
    console.error('设置/修改密码失败：', error)
    passwordError.value = error.message || '密码设置失败，请稍后重试。'
    return
  }

  closePasswordModal()
  setSettingsMessage('密码已设置成功，下次可以使用邮箱和密码登录。')
}

const formatAmount = (value: number) => formatCurrency(value, settings.value.defaultCurrency)
</script>

<template>
  <section class="page-stack">
    <section class="section-card">
      <div class="section-heading">
        <div>
          <p class="section-kicker">设置</p>
          <h2>账本、分摊和常用设置</h2>
        </div>
      </div>

      <div class="field-row">
        <label class="field-group">
          <span class="field-label">你的昵称</span>
          <input v-model="settings.meName" type="text" placeholder="例如：阿轩" />
        </label>

        <label class="field-group">
          <span class="field-label">另一半昵称</span>
          <input v-model="settings.partnerName" type="text" placeholder="例如：小宁" />
        </label>
      </div>

      <label class="field-group">
        <span class="field-label">默认货币</span>
        <select v-model="settings.defaultCurrency">
          <option v-for="currency in currencyOptions" :key="currency.code" :value="currency.code">
            {{ currency.code }} {{ currency.label }}
          </option>
        </select>
        <small class="settings-hint">新记录默认按这个币种入账。若之后切换默认货币，旧记录不会自动重算历史汇率。</small>
      </label>

      <div class="settings-list">
        <div class="sync-card">
          <span>同步状态</span>
          <strong>{{ isSupabaseEnabled ? (authUser ? '已连接 Supabase' : '等待登录') : '本地离线模式' }}</strong>
        </div>
        <div v-if="currentBook" class="sync-card">
          <span>当前账本</span>
          <strong>{{ currentBook.name }}</strong>
          <small>{{ currentBookRole === 'owner' ? '创建者' : '成员' }}</small>
        </div>
        <div class="sync-card" v-if="currentBook && !isLocalBookMode">
          <span>邀请码</span>
          <div class="book-invite-row">
            <strong>{{ currentBook.inviteCode }}</strong>
            <button type="button" class="secondary-button compact-button" @click="copyInviteCode">复制邀请码</button>
          </div>
        </div>
        <div class="sync-card">
          <span>账号</span>
          <div class="settings-action-row">
            <strong>{{ authUser?.email || '当前未登录' }}</strong>
            <div class="settings-inline-actions" v-if="isSupabaseEnabled && authUser">
              <button
                type="button"
                class="secondary-button compact-button"
                @click="openPasswordModal"
              >
                设置/修改密码
              </button>
              <button
                type="button"
                class="secondary-button compact-button"
                @click="handleSignOut"
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      </div>
      <p v-if="isLocalBookMode" class="warning-message">当前是 localStorage 本地模式，只能本机保存，不能情侣同步。</p>
      <p v-if="settingsMessage" class="status-message">{{ settingsMessage }}</p>
    </section>

    <section class="section-card">
      <div class="section-heading compact">
        <div>
          <p class="section-kicker">月末结算</p>
          <h3>需要时再看，不放在首页打扰你们</h3>
        </div>
      </div>

      <div class="settlement-preview-card">
        <div>
          <span class="field-label">{{ monthLabel }}</span>
          <strong>{{ settlementText }}</strong>
        </div>
        <div class="settlement-preview-amount">
          <span>参考金额</span>
          <strong>{{ formatAmount(Math.abs(monthlySummary.meNet)) }}</strong>
        </div>
      </div>
    </section>

    <section class="section-card">
      <div class="section-heading compact">
        <div>
          <p class="section-kicker">默认分摊</p>
          <h3>普通消费和房租规则都放在这里统一管理</h3>
        </div>
      </div>

      <div class="split-settings-grid">
        <div class="split-settings-card">
          <strong>普通消费</strong>
          <div class="field-row">
            <label class="field-group">
              <span class="field-label">{{ settings.meName }} %</span>
              <input
                :value="settings.defaultSplits.standard.me"
                type="number"
                min="0"
                max="100"
                @input="updateSplit('standard', 'me', Number(($event.target as HTMLInputElement).value))"
              />
            </label>
            <label class="field-group">
              <span class="field-label">{{ settings.partnerName }} %</span>
              <input
                :value="settings.defaultSplits.standard.partner"
                type="number"
                min="0"
                max="100"
                @input="updateSplit('standard', 'partner', Number(($event.target as HTMLInputElement).value))"
              />
            </label>
          </div>
        </div>

        <div class="split-settings-card">
          <strong>房租</strong>
          <div class="field-row">
            <label class="field-group">
              <span class="field-label">{{ settings.meName }} %</span>
              <input
                :value="settings.defaultSplits.rent.me"
                type="number"
                min="0"
                max="100"
                @input="updateSplit('rent', 'me', Number(($event.target as HTMLInputElement).value))"
              />
            </label>
            <label class="field-group">
              <span class="field-label">{{ settings.partnerName }} %</span>
              <input
                :value="settings.defaultSplits.rent.partner"
                type="number"
                min="0"
                max="100"
                @input="updateSplit('rent', 'partner', Number(($event.target as HTMLInputElement).value))"
              />
            </label>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="primary-button" @click="saveProfile">保存设置</button>
      </div>
    </section>

    <section class="section-card">
      <div class="section-heading compact">
        <div>
          <p class="section-kicker">固定消费</p>
          <h3>每月固定消费入口</h3>
        </div>
      </div>

      <div class="settings-list">
        <div class="sync-card">
          <span>当前固定消费</span>
          <strong>{{ recurringExpenses.length }} 笔</strong>
          <small>现阶段先保留已有数据，后续可独立扩展专门页面。</small>
        </div>
      </div>
    </section>

    <section class="section-card">
      <div class="section-heading compact">
        <div>
          <p class="section-kicker">消费类别</p>
          <h3>新增、删除和整理常用分类</h3>
        </div>
      </div>

      <div class="category-manage-list">
        <div v-for="category in settings.categories" :key="category.id" class="category-manage-item">
          <div class="category-name">
            <span>{{ category.icon }}</span>
            <input v-model="category.name" type="text" />
          </div>
          <div class="category-manage-actions">
            <input v-model="category.icon" type="text" maxlength="2" class="emoji-input" />
            <button
              type="button"
              class="text-button danger"
              :disabled="category.id === 'rent' || category.id === 'others'"
              @click="removeCategory(category.id)"
            >
              删除
            </button>
          </div>
        </div>
      </div>

      <div class="field-row">
        <label class="field-group">
          <span class="field-label">新分类名称</span>
          <input v-model="newCategory.name" type="text" placeholder="例如：宠物、旅行" />
        </label>

        <label class="field-group tiny-field">
          <span class="field-label">图标</span>
          <input v-model="newCategory.icon" type="text" maxlength="2" />
        </label>
      </div>

      <div class="form-actions">
        <button type="button" class="secondary-button" @click="addCategory">新增分类</button>
      </div>
    </section>

    <p class="ui-version-tag">UI版本：2026-05-03-pwa-currency-refresh</p>

    <div
      v-if="passwordModalOpen"
      class="settings-modal-overlay"
      @click.self="closePasswordModal"
    >
      <section class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="password-modal-title">
        <div class="section-heading compact">
          <div>
            <p class="section-kicker">账号安全</p>
            <h3 id="password-modal-title">设置/修改密码</h3>
          </div>
        </div>

        <div class="settings-modal-body">
          <label class="field-group">
            <span class="field-label">新密码</span>
            <input
              v-model="passwordForm.nextPassword"
              type="password"
              minlength="6"
              autocomplete="new-password"
              placeholder="至少 6 位"
            />
          </label>

          <label class="field-group">
            <span class="field-label">确认新密码</span>
            <input
              v-model="passwordForm.confirmPassword"
              type="password"
              minlength="6"
              autocomplete="new-password"
              placeholder="再次输入新密码"
            />
          </label>

          <p v-if="passwordError" class="error-message">{{ passwordError }}</p>
        </div>

        <div class="settings-modal-actions">
          <button type="button" class="secondary-button" :disabled="passwordLoading" @click="closePasswordModal">
            取消
          </button>
          <button type="button" class="primary-button" :disabled="passwordLoading" @click="handlePasswordSubmit">
            {{ passwordLoading ? '保存中...' : '保存密码' }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.settings-inline-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.settings-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.24);
  backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  padding: 20px;
  z-index: 40;
}

.settings-modal {
  width: min(100%, 420px);
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.82);
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.14);
  padding: 20px;
  display: grid;
  gap: 16px;
}

.settings-modal-body {
  display: grid;
  gap: 12px;
}

.settings-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}

.ui-version-tag {
  margin: 0;
  padding: 0 4px calc(8px + env(safe-area-inset-bottom, 0px));
  color: var(--text-faint);
  font-size: 0.76rem;
  text-align: center;
}

.settings-hint {
  color: var(--text-soft);
  font-size: 0.84rem;
  line-height: 1.5;
}

@media (max-width: 640px) {
  .settings-inline-actions {
    justify-content: flex-start;
  }

  .settings-modal-overlay {
    padding: 14px;
    align-items: end;
  }

  .settings-modal {
    width: 100%;
    border-radius: 24px;
  }
}
</style>
