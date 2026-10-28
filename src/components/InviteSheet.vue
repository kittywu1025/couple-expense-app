<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import BottomSheet from './BottomSheet.vue'
import { useBooks } from '../composables/useBooks'
import { inviteLinkFor } from '../composables/useInvite'
import { inviteSheetOpen } from '../composables/useUi'
import { toast } from '../composables/useToast'

const { currentBook, me } = useBooks()

const code = computed(() => currentBook.value?.inviteCode ?? '')
const link = computed(() => (code.value ? inviteLinkFor(code.value) : ''))
const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

const message = computed(
  () => `${me.value?.displayName ?? '我'}邀请你一起记账～\n打开链接用 Google 登录就能加入：\n${link.value}\n（邀请码 ${code.value}）`,
)

const copy = async (text: string, done: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(done)
  } catch {
    // 有些浏览器不允许直接写剪贴板，就让用户长按手动复制
    toast.info('没能自动复制，长按上面的文字手动复制吧')
  }
}

const share = async () => {
  try {
    await navigator.share({ title: '一起记账', text: message.value })
  } catch {
    // 用户取消分享，不用提示
  }
}
</script>

<template>
  <BottomSheet :open="inviteSheetOpen" @close="inviteSheetOpen = false">
    <div class="invite">
      <div class="badge"><AppIcon name="mail" :size="26" :stroke="2" /></div>
      <h3>邀请 TA 一起记账</h3>
      <p class="lead">把链接发给 TA，用 Google 登录后会自动填好邀请码</p>

      <div class="box">
        <span class="box-label">邀请链接</span>
        <p class="link">{{ link }}</p>
        <button class="primary" @click="copy(link, '链接已复制，发给 TA 吧')">
          <AppIcon name="link" :size="16" :stroke="2.2" />复制链接
        </button>
      </div>

      <div class="box code-box">
        <span class="box-label">或者告诉 TA 邀请码</span>
        <p class="code">{{ code }}</p>
        <button class="soft" @click="copy(code, '邀请码已复制')">复制邀请码</button>
      </div>

      <button v-if="canShare" class="share" @click="share">
        <AppIcon name="transfer" :size="16" :stroke="2" />分享给 TA（LINE / 微信…）
      </button>
      <p class="tip">TA 打开后：Google 登录 → 完善资料 → 点「加入」就好</p>
    </div>
  </BottomSheet>
</template>

<style scoped>
.invite {
  text-align: center;
}
.badge {
  width: 56px;
  height: 56px;
  margin: 0 auto 10px;
  border-radius: 18px;
  background: linear-gradient(135deg, var(--me), var(--partner));
  color: #fff;
  display: grid;
  place-items: center;
}
h3 {
  margin: 0;
  font-size: 18px;
}
.lead {
  margin: 4px 0 16px;
  font-size: 13px;
  color: var(--text-soft);
}
.box {
  padding: 12px 14px;
  border-radius: 14px;
  background: var(--bg);
  margin-bottom: 10px;
  text-align: left;
}
.box-label {
  font-size: 12px;
  color: var(--text-faint);
}
.link {
  margin: 4px 0 10px;
  font-family: var(--mono);
  font-size: 13px;
  word-break: break-all;
  user-select: all;
  -webkit-user-select: all;
}
.code-box {
  text-align: center;
}
.code {
  margin: 4px 0 8px;
  font-family: var(--mono);
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 8px;
  color: var(--primary);
  user-select: all;
  -webkit-user-select: all;
}
.primary,
.soft,
.share {
  width: 100%;
  height: 44px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
.primary {
  background: var(--primary);
  color: #fff;
}
.soft {
  background: var(--primary-soft);
  color: var(--primary);
}
.share {
  margin-top: 2px;
  background: var(--card);
  border: 1.5px solid var(--line);
  color: var(--text);
}
.primary:active,
.soft:active,
.share:active {
  transform: scale(0.98);
}
.tip {
  margin: 12px 0 0;
  font-size: 11px;
  color: var(--text-faint);
}
</style>
