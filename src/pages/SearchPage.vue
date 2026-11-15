<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import PushPage from '../components/PushPage.vue'
import RecordList from '../components/RecordList.vue'
import { useBooks } from '../composables/useBooks'
import { useRecords } from '../composables/useRecords'
import { searchPageOpen } from '../composables/useUi'
import { formatMoney } from '../utils/format'
import { matchRecord, type SearchScope } from '../utils/search'

/**
 * 搜账单：备注、分类、子分类、金额都能搜；可以只看共同的 / 我的 / TA 的。
 * 合计和首页口径一样：共同的 + 自己的，TA 的个人消费只列出来不加。
 */
const { records } = useRecords()
const { myUid, partner } = useBooks()
const partnerName = computed(() => partner.value?.displayName ?? 'TA')

const q = ref('')
const scope = ref<SearchScope>('all')
const input = ref<HTMLInputElement | null>(null)
onMounted(() => nextTick(() => input.value?.focus()))

const scopes = computed<{ key: SearchScope; label: string }[]>(() => [
  { key: 'all', label: '全部' },
  { key: 'shared', label: '共同' },
  { key: 'mine', label: '我的' },
  { key: 'partner', label: `${partnerName.value}的` },
])

/** 最多列 200 笔，再多就让人把关键词写具体一点 */
const LIMIT = 200
const matched = computed(() => {
  if (!q.value.trim() && scope.value === 'all') return []
  return records.value.filter((r) => matchRecord(r, q.value, scope.value, myUid.value))
})
const shown = computed(() => matched.value.slice(0, LIMIT))
const total = computed(() =>
  matched.value
    .filter((r) => r.kind === 'expense' && (r.type === 'shared' || r.payerUid === myUid.value))
    .reduce((s, r) => s + r.amount, 0),
)
</script>

<template>
  <PushPage title="搜索账单" back-label="首页" @back="searchPageOpen = false">
    <label class="box">
      <AppIcon name="search" :size="17" :stroke="2.2" />
      <input ref="input" v-model="q" type="search" enterkeyhint="search" placeholder="备注、分类或金额，比如「拉面」「1200」" />
      <button v-if="q" class="clear" aria-label="清空" @click="q = ''"><AppIcon name="close" :size="14" :stroke="2.4" /></button>
    </label>
    <div class="chips">
      <button v-for="s in scopes" :key="s.key" :class="['chip', { on: scope === s.key }]" @click="scope = s.key">{{ s.label }}</button>
    </div>

    <template v-if="q.trim() || scope !== 'all'">
      <p class="summary">
        找到 {{ matched.length }} 笔<template v-if="total"> · 支出 <span class="mono">{{ formatMoney(total) }}</span></template>
        <template v-if="matched.length > LIMIT"> · 只列出最近 {{ LIMIT }} 笔</template>
      </p>
      <RecordList v-if="shown.length" :records="shown" />
      <p v-else class="empty">没找到，换个词试试</p>
    </template>
    <p v-else class="empty">可以搜备注、分类、子分类，或者直接输金额</p>
  </PushPage>
</template>

<style scoped>
.box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 44px;
  border-radius: 12px;
  background: var(--card);
  color: var(--text-faint);
}
.box input {
  flex: 1;
  min-width: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 16px;
  color: var(--text);
  outline: none;
}
.box input::-webkit-search-cancel-button {
  display: none;
}
.clear {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--text-faint);
  color: var(--card);
}
.chips {
  display: flex;
  gap: 8px;
  margin: 12px 2px 4px;
  overflow-x: auto;
}
.chip {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 13px;
  background: var(--card);
  color: var(--text-soft);
}
.chip.on {
  background: var(--primary);
  color: #fff;
  font-weight: 600;
}
.summary {
  margin: 12px 6px 8px;
  font-size: 12px;
  color: var(--text-faint);
}
.mono {
  font-family: var(--mono);
}
.empty {
  margin: 40px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-faint);
}
</style>
