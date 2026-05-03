<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBooks } from '../composables/useBooks'

const { createBook, joinBookByInvite, bookActionLoading, bookActionMessage, booksError } = useBooks()

const mode = ref<'create' | 'join'>('create')
const createName = ref('我们的账本')
const inviteCode = ref('')
const errorMessage = ref('')
const successMessage = computed(() => bookActionMessage.value)
const emptyStateText = computed(() =>
  booksError.value
    ? '账本信息读取失败，请稍后重试。'
    : '你还没有加入任何情侣账本，请创建或加入一份共同账本。'
)

const handleCreate = async () => {
  errorMessage.value = ''
  const { data, error } = await createBook(createName.value)
  if (error) {
    errorMessage.value = error.message || '创建账本失败'
    return
  }
  if (data?.inviteCode) {
    createName.value = data.name
  }
}

const handleJoin = async () => {
  errorMessage.value = ''
  const { error } = await joinBookByInvite(inviteCode.value)
  if (error) {
    errorMessage.value = error.message || '加入账本失败'
    return
  }
  inviteCode.value = ''
}
</script>

<template>
  <section class="page-stack">
    <section class="section-card">
      <div class="section-heading">
        <div>
          <p class="section-kicker">情侣账本</p>
          <h2>先创建或加入一份共同账本</h2>
          <p class="subtitle">{{ emptyStateText }}</p>
        </div>
      </div>

      <div class="segment-row">
        <button type="button" :class="['segment-button', { active: mode === 'create' }]" @click="mode = 'create'">
          创建情侣账本
        </button>
        <button type="button" :class="['segment-button', { active: mode === 'join' }]" @click="mode = 'join'">
          加入已有账本
        </button>
      </div>
    </section>

    <section class="section-card" v-if="mode === 'create'">
      <div class="section-heading compact">
        <div>
          <p class="section-kicker">创建</p>
          <h3>生成邀请码发给对象</h3>
        </div>
      </div>

      <label class="field-group">
        <span class="field-label">账本名称</span>
        <input v-model="createName" type="text" placeholder="例如：我们的账本" />
      </label>

      <div class="form-actions">
        <button type="button" class="primary-button" :disabled="bookActionLoading" @click="handleCreate">
          {{ bookActionLoading ? '创建中...' : '创建账本' }}
        </button>
      </div>
    </section>

    <section class="section-card" v-else>
      <div class="section-heading compact">
        <div>
          <p class="section-kicker">加入</p>
          <h3>输入对象发来的邀请码</h3>
        </div>
      </div>

      <label class="field-group">
        <span class="field-label">邀请码</span>
        <input v-model="inviteCode" type="text" placeholder="例如：A1B2C3" style="text-transform: uppercase;" />
      </label>

      <div class="form-actions">
        <button type="button" class="primary-button" :disabled="bookActionLoading" @click="handleJoin">
          {{ bookActionLoading ? '加入中...' : '加入账本' }}
        </button>
      </div>
    </section>

    <p v-if="successMessage" class="status-message">{{ successMessage }}</p>
    <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
  </section>
</template>
