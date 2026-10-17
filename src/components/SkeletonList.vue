<template>
  <div class="card" aria-busy="true" aria-label="加载中">
    <div v-for="i in 4" :key="i" class="row">
      <span class="circle shimmer" />
      <span class="lines">
        <span class="bar shimmer" :style="{ width: 40 + (i % 3) * 14 + '%' }" />
        <span class="bar small shimmer" />
      </span>
      <span class="bar amount shimmer" />
    </div>
  </div>
</template>

<style scoped>
.card {
  background: var(--card);
  border-radius: var(--radius);
  padding: 4px 14px;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
}
.circle {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  flex-shrink: 0;
}
.lines {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bar {
  display: block;
  height: 12px;
  border-radius: 6px;
}
.bar.small {
  width: 30%;
  height: 9px;
}
.bar.amount {
  width: 64px;
}
.shimmer {
  background: linear-gradient(90deg, #f0f0f3 25%, #e6e6ea 37%, #f0f0f3 63%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease infinite;
}
@keyframes shimmer {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}
</style>
