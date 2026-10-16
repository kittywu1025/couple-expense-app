<script setup lang="ts">
import { ref } from 'vue'
import { useBooks } from '../composables/useBooks'
import { authDisplayName, useSupabaseAuth } from '../composables/useSupabaseAuth'
import { toast } from '../composables/useToast'

const { createBook, joinBook, bookActionLoading } = useBooks()
const { signOut } = useSupabaseAuth()
const code = ref('')

const onCreate = async () => {
  const { error } = await createBook()
  if (error) toast.error(error.message)
  else toast.success('账本已创建，把邀请码发给 TA 吧')
}

const onJoin = async () => {
  if (code.value.trim().length !== 6) {
    toast.warning('邀请码是 6 位')
    return
  }
  const { error } = await joinBook(code.value)
  if (error) toast.error(error.message)
  else toast.success('已加入账本')
}
</script>

<template>
  <div class="setup">
    <header>
      <p class="hi">你好，{{ authDisplayName }}</p>
      <h1>开始共同记账</h1>
    </header>

    <section class="card">
      <div class="emoji">📒</div>
      <h2>创建新账本</h2>
      <p>创建后会生成 6 位邀请码，发给 TA 即可加入</p>
      <button class="primary" :disabled="bookActionLoading" @click="onCreate">创建账本</button>
    </section>

    <section class="card">
      <div class="emoji">🔗</div>
      <h2>加入 TA 的账本</h2>
      <input
        v-model="code"
        class="code"
        maxlength="6"
        placeholder="输入邀请码"
        autocapitalize="characters"
        @keyup.enter="onJoin"
      />
      <button class="outline" :disabled="bookActionLoading" @click="onJoin">加入</button>
    </section>

    <button class="logout" @click="signOut">退出登录</button>
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
  font-size: 28px;
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
.logout {
  margin-top: auto;
  color: var(--text-faint);
  font-size: 14px;
  padding: 12px;
}
</style>
