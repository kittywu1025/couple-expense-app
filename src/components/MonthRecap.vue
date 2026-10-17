<script setup lang="ts">
import { ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import BottomSheet from './BottomSheet.vue'
import { closeRecap, recapAvailable, recapOpen, useMonthRecap } from '../composables/useMonthRecap'
import { formatMoney } from '../utils/format'

defineProps<{ showTrigger: boolean }>()

const { summary, balanceLine, buildSlogan, myName, partnerName } = useMonthRecap()
const slogan = ref('')

watch(recapOpen, (open) => {
  if (open) slogan.value = buildSlogan()
})

const monthName = `${new Date().getMonth() + 1}月`
</script>

<template>
  <!-- 首页右下角、加号按钮上方的小图标，轻微呼吸 -->
  <transition name="pop">
    <button
      v-if="showTrigger && recapAvailable && !recapOpen"
      class="trigger"
      aria-label="打开月末回顾"
      @click="recapOpen = true"
    >
      <AppIcon name="gift" :size="22" :stroke="2" />
    </button>
  </transition>

  <BottomSheet :open="recapOpen" @close="closeRecap">
    <div class="recap">
      <p class="badge"><AppIcon name="sparkles" :size="14" :stroke="2" />{{ monthName }}回顾</p>
      <h3 class="slogan">{{ slogan }}</h3>

      <div class="stats">
        <p class="big">
          一起花了 <b class="mono">{{ formatMoney(summary.total) }}</b>
          <span class="dot-sep">·</span>
          <b class="mono">{{ summary.count }}</b> 笔记录
        </p>
        <p class="treats">
          <span><i class="dot me" />我请了 {{ partnerName }} <b>{{ summary.myTreats }}</b> 次</span>
          <span class="dot-sep">·</span>
          <span><i class="dot partner" />{{ partnerName }} 请了我 <b>{{ summary.partnerTreats }}</b> 次</span>
        </p>
      </div>

      <p class="balance">{{ balanceLine }}</p>
      <p class="sign">—— {{ myName }} & {{ partnerName }} 的账本</p>

      <button class="ok" @click="closeRecap">好了</button>
    </div>
  </BottomSheet>
</template>

<style scoped>
.trigger {
  position: fixed;
  right: 28px;
  bottom: calc(146px + env(safe-area-inset-bottom, 0px));
  z-index: 59;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--card);
  color: var(--primary);
  display: grid;
  place-items: center;
  box-shadow: 0 6px 18px rgba(108, 99, 255, 0.28);
  animation: breathe 2.6s ease-in-out infinite;
}
@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
    box-shadow: 0 6px 18px rgba(108, 99, 255, 0.22);
  }
  50% {
    transform: scale(1.08);
    box-shadow: 0 8px 24px rgba(108, 99, 255, 0.4);
  }
}
.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: scale(0.6);
}
.recap {
  text-align: center;
  padding: 4px 4px 0;
}
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0 0 10px;
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 12px;
  font-weight: 600;
}
.slogan {
  margin: 0 0 18px;
  font-size: 20px;
  line-height: 1.5;
}
.stats {
  padding: 14px 12px;
  border-radius: 16px;
  background: linear-gradient(120deg, var(--me-bg), var(--partner-bg));
}
.stats p {
  margin: 0;
}
.big {
  font-size: 15px;
  color: var(--text-soft);
}
.big b {
  color: var(--text);
  font-size: 18px;
}
.treats {
  margin-top: 8px !important;
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 4px 6px;
  font-size: 13px;
  color: var(--text-soft);
}
.treats span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.treats b {
  color: var(--text);
}
.dot-sep {
  margin: 0 4px;
  color: var(--text-faint);
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.dot.me {
  background: var(--me);
}
.dot.partner {
  background: var(--partner);
}
.balance {
  margin: 16px 0 4px;
  font-size: 15px;
}
.sign {
  margin: 0;
  font-size: 12px;
  color: var(--text-faint);
}
.mono {
  font-family: var(--mono);
}
.ok {
  width: 100%;
  height: 48px;
  margin-top: 18px;
  border-radius: 14px;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  font-size: 16px;
}
</style>
