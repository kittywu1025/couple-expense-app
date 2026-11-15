import { onBeforeUnmount, watch, type WatchSource } from 'vue'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isDemoMode } from '../lib/demo'

/**
 * 对方记账、改账、记还款时实时刷新（Supabase Realtime）。
 * 收到变化后等一小会儿再一起刷新，连着来好几条（比如批量导入）只刷一次。
 * 数据库没开 Realtime 也不影响使用：照旧在回到前台、下拉时刷新。
 */
export const useLiveSync = (
  bookId: WatchSource<string | null>,
  myUid: () => string | undefined,
  refresh: { records: () => unknown; loans: () => unknown },
) => {
  let channel: RealtimeChannel | null = null
  const timers: Record<string, ReturnType<typeof setTimeout> | undefined> = {}
  const later = (key: 'records' | 'loans') => {
    clearTimeout(timers[key])
    timers[key] = setTimeout(() => {
      // 后台的时候不刷，回到前台本来就会刷新
      if (document.visibilityState === 'visible') refresh[key]()
    }, 800)
  }

  const stop = () => {
    for (const k of Object.keys(timers)) clearTimeout(timers[k])
    if (channel && supabase) supabase.removeChannel(channel)
    channel = null
  }

  watch(
    bookId,
    (id) => {
      stop()
      if (!id || !supabase || isDemoMode) return
      const filter = `book_id=eq.${id}`
      channel = supabase
        .channel(`book-${id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter }, (payload) => {
          // 自己刚改的本地已经是最新的了
          const row = payload.new as { last_edited_by?: string } | null
          if (payload.eventType !== 'DELETE' && row?.last_edited_by && row.last_edited_by === myUid()) return
          later('records')
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'loans', filter }, () => later('loans'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'loan_repayments', filter }, () => later('loans'))
        .subscribe()
    },
    { immediate: true },
  )
  onBeforeUnmount(stop)
}
