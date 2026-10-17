<script setup lang="ts">
import BottomSheet from './BottomSheet.vue'
import { confirmState, settleConfirm } from '../composables/useUi'
</script>

<template>
  <BottomSheet :open="!!confirmState" @close="settleConfirm(false)">
    <template v-if="confirmState">
      <div class="head">
        <h3>{{ confirmState.title }}</h3>
        <p v-if="confirmState.message">{{ confirmState.message }}</p>
      </div>
      <button :class="['btn', { danger: confirmState.danger }]" @click="settleConfirm(true)">
        {{ confirmState.confirmText }}
      </button>
      <button class="btn cancel" @click="settleConfirm(false)">取消</button>
    </template>
  </BottomSheet>
</template>

<style scoped>
.head {
  text-align: center;
  padding: 4px 8px 16px;
}
h3 {
  margin: 0;
  font-size: 16px;
}
p {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--text-soft);
  line-height: 1.6;
}
.btn {
  width: 100%;
  height: 50px;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 600;
  background: var(--primary);
  color: #fff;
}
.btn:active {
  opacity: 0.8;
}
.btn.danger {
  background: var(--danger);
}
.btn.cancel {
  margin-top: 8px;
  background: var(--bg);
  color: var(--text);
  font-weight: 500;
}
</style>
