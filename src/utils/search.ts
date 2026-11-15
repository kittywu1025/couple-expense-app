import type { LedgerRecord } from '../types'

export type SearchScope = 'all' | 'shared' | 'mine' | 'partner'

/** 金额的几种写法都认：1200、1,200、¥1200 */
const asAmount = (s: string) => {
  const n = Number(s.replace(/[¥￥,，\s]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * 一笔账单是否符合搜索条件。
 * 关键词用空格分开时每个词都要对上（「拉面 杰杰」不行，名字不在账单里；「外食 拉面」可以）。
 * 纯数字的词按金额找，也会顺便匹配备注里的数字。
 */
export const matchRecord = (r: LedgerRecord, query: string, scope: SearchScope, myUid: string) => {
  if (scope === 'shared' && r.type !== 'shared') return false
  if (scope === 'mine' && !(r.type === 'personal' && r.payerUid === myUid)) return false
  if (scope === 'partner' && !(r.type === 'personal' && r.payerUid !== myUid)) return false
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = `${r.category} ${r.subCategory ?? ''} ${r.note ?? ''}`.toLowerCase()
  return words.every((w) => {
    const n = asAmount(w)
    if (n !== null && Math.abs(r.amount - n) < 0.005) return true
    return text.includes(w)
  })
}
