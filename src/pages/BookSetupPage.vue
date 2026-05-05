<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBooks } from '../composables/useBooks'
import { toast } from '../composables/useToast'
import { toUserMessage } from '../utils/userMessage'

const { createBook, joinBookByInvite, bookActionLoading } = useBooks()

const mode = ref<'create' | 'join'>('create')
const createName = ref('我们的账本')
const inviteCode = ref('')
const emptyStateText = computed(() => '先创建或加入共同账本。')

const handleCreate = async () => {
  const { data, error } = await createBook(createName.value)
  if (error) {
    toast.error(toUserMessage(error, '创建账本失败，请稍后重试。'))
    return
  }
  if (data?.inviteCode) {
    createName.value = data.name
  }
  toast.success('账本已创建。')
}

const handleJoin = async () => {
  const { error } = await joinBookByInvite(inviteCode.value)
  if (error) {
    toast.error(toUserMessage(error, '加入账本失败，请稍后重试。'))
    return
  }
  inviteCode.value = ''
  toast.success('已加入情侣账本。')
}
</script>

<template>
  <section class="page-stack">
    <section class="section-card">
      <div class="section-heading">
        <div>
          <h2>情侣账本</h2>
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
          <h3>创建账本</h3>
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
          <h3>输入邀请码</h3>
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
  </section>
</template>
