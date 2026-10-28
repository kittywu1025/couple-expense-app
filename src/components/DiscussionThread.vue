<script setup lang="ts">
import type { DiscussionEntry, LedgerRecord } from '../types'
import { useBooks } from '../composables/useBooks'
import { formatDateLabel, toDateKey } from '../utils/format'

/** 有疑问 / 回复的来回留言，像聊天一样：我的在右边，TA 的在左边 */
const props = defineProps<{ entries: DiscussionEntry[]; record?: LedgerRecord | null }>()

const { myUid, nameOf, otherUid } = useBooks()

/** 提议的比例按「我 : TA」显示 */
const ratioText = (ratio: number) => {
  const r = props.record
  if (!r) return ''
  const mine = r.payerUid === myUid.value ? ratio : 10 - ratio
  const other = nameOf(otherUid(myUid.value))
  if (mine === 10) return '提议：我全出'
  if (mine === 0) return `提议：${other} 全出`
  return `提议：我 ${mine} : ${other} ${10 - mine}`
}

const when = (at: string) => {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return ''
  return `${formatDateLabel(toDateKey(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <div class="thread">
    <div v-for="(e, i) in entries" :key="i" :class="['msg', e.by === myUid ? 'mine' : 'theirs']">
      <span class="who">{{ e.by === myUid ? '我' : nameOf(e.by) }} · {{ when(e.at) }}</span>
      <span class="bubble">
        {{ e.text }}
        <b v-if="typeof e.ratio === 'number' && record" class="ratio">{{ ratioText(e.ratio) }}</b>
      </span>
    </div>
  </div>
</template>

<style scoped>
.thread {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.msg {
  display: flex;
  flex-direction: column;
  max-width: 85%;
}
.msg.mine {
  align-self: flex-end;
  align-items: flex-end;
}
.who {
  font-size: 11px;
  color: var(--text-faint);
  margin: 0 6px 2px;
}
.bubble {
  padding: 8px 12px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.theirs .bubble {
  background: var(--partner-bg);
  color: var(--text);
  border-top-left-radius: 4px;
}
.mine .bubble {
  background: var(--me-bg);
  color: var(--text);
  border-top-right-radius: 4px;
}
.ratio {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--primary);
}
</style>
