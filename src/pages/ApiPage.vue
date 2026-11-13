<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import PushPage from '../components/PushPage.vue'
import { useApiTokens, type ApiToken } from '../composables/useApiTokens'
import { toast } from '../composables/useToast'
import { apiPageOpen, confirmAction } from '../composables/useUi'
import { apiGuide } from '../utils/apiGuide'
import { formatDateLabel, toDateKey } from '../utils/format'

/**
 * API 接口：生成密钥给 agent，让它帮忙记账、导入账单。
 * 密钥明文只在生成时显示一次；不用了就撤销。
 */
const { tokens, load, create, revoke } = useApiTokens()
onMounted(load)

const url = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://<项目>.supabase.co'
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || '<anon key>'

const name = ref('')
const creating = ref(false)
/** 刚生成的明文，只显示这一次 */
const fresh = ref<{ name: string; token: string } | null>(null)

const onCreate = async () => {
  const n = name.value.trim()
  if (!n) {
    toast.info('给密钥起个名字，比如「记账助手」')
    return
  }
  creating.value = true
  const { error, token } = await create(n)
  creating.value = false
  if (error || !token) {
    toast.error(error?.message ?? '生成失败')
    return
  }
  fresh.value = { name: n, token }
  name.value = ''
}

const copy = async (text: string, done: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(done)
  } catch {
    toast.info('没能自动复制，长按文字手动复制吧')
  }
}
const copyGuide = (token?: string) => copy(apiGuide({ url, anonKey, token }), '说明已复制，贴给 agent 就行')

const onRevoke = async (t: ApiToken) => {
  const ok = await confirmAction({
    title: `撤销「${t.name}」？`,
    message: '撤销后用这个密钥的 agent 就不能再记账了，已经记的账不受影响。',
    confirmText: '撤销',
    danger: true,
  })
  if (!ok) return
  const { error } = await revoke(t.id)
  if (error) toast.error(error.message)
  else {
    if (fresh.value && t.prefix === fresh.value.token.slice(0, 10)) fresh.value = null
    toast.success('已撤销')
  }
}

const day = (iso: string | null) => (iso ? formatDateLabel(toDateKey(new Date(iso))) : '')
</script>

<template>
  <PushPage title="API 接口" back-label="我的" @back="apiPageOpen = false">
    <p class="note">
      给 agent（自己写的脚本、快捷指令、AI 助手）一个密钥，它就能帮你记账、批量导入账单。
      用 agent 记的账和你自己记的一样，共同账 TA 首页会提醒「TA 新记了」。
    </p>

    <!-- 刚生成的：明文只显示这一次 -->
    <section v-if="fresh" class="fresh">
      <p class="fresh-title"><AppIcon name="key" :size="16" :stroke="2.2" />「{{ fresh.name }}」的密钥</p>
      <code class="token">{{ fresh.token }}</code>
      <p class="warn">只显示这一次，关掉就看不到了。别发到群里或者公开的地方，拿到的人都能用你的名义记账。</p>
      <div class="btns">
        <button class="soft" @click="copy(fresh.token, '密钥已复制')">复制密钥</button>
        <button class="primary" @click="copyGuide(fresh.token)">复制给 agent 的说明</button>
      </div>
    </section>

    <h2 class="section-title">生成密钥</h2>
    <section class="group">
      <div class="row">
        <input v-model="name" class="grow" maxlength="40" placeholder="名字，比如「记账助手」" @keydown.enter="onCreate" />
        <button class="add" :disabled="creating" @click="onCreate">{{ creating ? '生成中…' : '生成' }}</button>
      </div>
    </section>

    <h2 class="section-title">我的密钥</h2>
    <section class="group">
      <div v-for="t in tokens" :key="t.id" class="row">
        <span class="row-icon"><AppIcon name="key" :size="16" :stroke="2" /></span>
        <span class="grow">
          {{ t.name }}
          <small class="hint mono">{{ t.prefix }}… · {{ day(t.createdAt) }}生成{{ t.lastUsedAt ? ` · ${day(t.lastUsedAt)}用过` : ' · 还没用过' }}</small>
        </span>
        <button class="del" @click="onRevoke(t)">撤销</button>
      </div>
      <p v-if="!tokens.length" class="empty">还没有密钥</p>
    </section>
    <p class="note">每个密钥只能记到这个账本、记在你名下。不用了就撤销；退出账本后密钥自动失效。</p>

    <h2 class="section-title">接口说明</h2>
    <section class="group">
      <div class="row">
        <span class="grow">地址<small class="hint mono">{{ url }}/rest/v1/rpc/…</small></span>
      </div>
      <div class="row">
        <span class="grow">接口<small class="hint">api_info 看分类 · api_add_records 记账 / 导入 · api_delete_records 删掉记错的</small></span>
      </div>
      <button class="row link" @click="copyGuide()">
        <span class="grow">复制完整说明<small class="hint">字段、例子、出错时怎么办；密钥那里换成你自己的</small></span>
        <AppIcon name="chevronRight" :size="16" class="chev" />
      </button>
    </section>
  </PushPage>
</template>

<style scoped>
.note {
  margin: 4px 6px 10px;
  font-size: 12px;
  line-height: 1.6;
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
.row {
  min-height: 54px;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 16px;
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
.grow {
  flex: 1;
  min-width: 0;
}
.hint {
  display: block;
  font-size: 11px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-icon {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: var(--primary-soft);
  color: var(--primary);
}
input {
  border: none;
  background: var(--bg);
  border-radius: 10px;
  padding: 9px 12px;
  font: inherit;
  font-size: 15px;
}
.add {
  flex-shrink: 0;
  height: 38px;
  padding: 0 16px;
  border-radius: 10px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
}
.add:disabled {
  opacity: 0.6;
}
.del {
  flex-shrink: 0;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 13px;
  color: var(--danger);
  background: var(--bg);
}
.empty {
  margin: 0;
  padding: 16px;
  font-size: 13px;
  color: var(--text-faint);
}
.chev {
  color: var(--text-faint);
}
.fresh {
  margin-top: 6px;
  padding: 14px 16px;
  border-radius: var(--radius);
  background: var(--card);
  box-shadow: inset 0 0 0 1.5px var(--primary-soft);
}
.fresh-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--primary);
}
.token {
  display: block;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg);
  font-family: var(--mono);
  font-size: 12px;
  word-break: break-all;
  user-select: all;
}
.warn {
  margin: 8px 0 12px;
  font-size: 12px;
  line-height: 1.6;
  color: #e08600;
}
.btns {
  display: flex;
  gap: 8px;
}
.btns button {
  flex: 1;
  height: 40px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
}
.btns .soft {
  background: var(--primary-soft);
  color: var(--primary);
}
.btns .primary {
  background: var(--primary);
  color: #fff;
}
.mono {
  font-family: var(--mono);
}
</style>
