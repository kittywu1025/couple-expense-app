<script setup lang="ts">
import { ref } from 'vue'
import { useSupabaseAuth } from '../composables/useSupabaseAuth'
import { toast } from '../composables/useToast'

const { signInWithGoogle } = useSupabaseAuth()
const loading = ref(false)

const login = async () => {
  loading.value = true
  const { error } = await signInWithGoogle()
  if (error) {
    toast.error(error.message)
    loading.value = false
  }
}
</script>

<template>
  <div class="auth">
    <div class="hero">
      <img class="logo" src="/icon-192.png" alt="" />
      <h1>两个人的账本</h1>
      <p>记下我们一起生活的每一笔</p>
    </div>
    <button class="google" :disabled="loading" @click="login">
      <span class="g">G</span>
      {{ loading ? '正在跳转…' : '使用 Google 登录' }}
    </button>
  </div>
</template>

<style scoped>
.auth {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 48px;
  padding: 24px;
}
.hero {
  text-align: center;
}
.logo {
  width: 88px;
  height: 88px;
  margin: 0 auto 20px;
  display: block;
  border-radius: 24px;
  box-shadow: 0 16px 32px rgba(180, 140, 240, 0.35);
}
h1 {
  margin: 0 0 8px;
  font-size: 26px;
}
p {
  margin: 0;
  color: var(--text-soft);
}
.google {
  width: min(100%, 320px);
  height: 52px;
  border-radius: 999px;
  background: var(--card);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.google:disabled {
  opacity: 0.6;
}
.g {
  font-weight: 800;
  font-size: 18px;
  background: conic-gradient(#ea4335 0 25%, #fbbc05 0 50%, #34a853 0 75%, #4285f4 0);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
</style>
