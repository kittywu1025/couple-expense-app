<script setup lang="ts">
import AppIcon from '../components/AppIcon.vue'
import PushPage from '../components/PushPage.vue'
import { aboutPageOpen, rulesPageOpen } from '../composables/useUi'

const appVersion = __APP_VERSION__.split('-')[0]
</script>

<template>
  <PushPage title="关于应用" back-label="我的" @back="aboutPageOpen = false">
    <section class="hero">
      <div class="logo"><AppIcon name="heart" :size="36" :stroke="2" /></div>
      <p class="name">两个人的账本</p>
      <p class="ver">v{{ appVersion }}</p>
    </section>

    <section class="group">
      <button class="row" @click="rulesPageOpen = true">
        <span class="icon"><AppIcon name="transfer" :size="18" :stroke="2" /></span>
        <span class="grow">结算算法说明</span>
        <AppIcon name="chevronRight" :size="16" class="chev" />
      </button>
    </section>

    <p class="foot">为在日本生活的情侣设计 · 默认日元 · 数据保存在 Supabase 云端</p>
  </PushPage>
</template>

<style scoped>
.hero {
  text-align: center;
  padding: 20px 0 24px;
}
.logo {
  width: 72px;
  height: 72px;
  margin: 0 auto 12px;
  border-radius: 22px;
  background: var(--primary);
  color: #fff;
  display: grid;
  place-items: center;
  box-shadow: 0 12px 24px rgba(108, 99, 255, 0.3);
}
.name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}
.ver {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text-faint);
}
.group {
  background: var(--card);
  border-radius: var(--radius);
  overflow: hidden;
}
.row {
  width: 100%;
  min-height: 52px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  font-size: 15px;
  text-align: left;
}
.row:active {
  background: #f2f2f5;
}
.icon {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--primary-soft);
  color: var(--primary);
  display: grid;
  place-items: center;
}
.grow {
  flex: 1;
}
.chev {
  color: var(--text-faint);
}
.foot {
  margin: 20px 0 0;
  text-align: center;
  font-size: 11px;
  color: var(--text-faint);
}
</style>
