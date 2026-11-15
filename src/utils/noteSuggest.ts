import type { LedgerRecord, RecordKind } from '../types'

export interface NoteSuggestion {
  text: string
  /** 最近一次用这个备注时的金额，金额还没填时一起带上 */
  amount: number
  count: number
}

/**
 * 记账页的常用备注：同一个分类下以前写过的备注，用得多的、最近用过的排前面。
 * 同一子分类的优先（选了「外食」就先出「一兰拉面」，不先出超市的东西）。
 * 只看共同的和自己的记录（TA 的个人记录不拿来联想）。
 * typed：正在输入的备注，有的话只留包含它的，完全一样的不再提示。
 */
export const noteSuggestions = (
  records: LedgerRecord[],
  opts: { kind: RecordKind; category: string; sub: string | null; myUid: string; typed?: string; limit?: number },
): NoteSuggestion[] => {
  const typed = (opts.typed ?? '').trim().toLowerCase()
  const map = new Map<string, NoteSuggestion & { lastDate: string; lastCreated: string; sameSub: boolean }>()
  for (const r of records) {
    if (r.kind !== opts.kind || r.category !== opts.category) continue
    if (r.type === 'personal' && r.payerUid !== opts.myUid) continue
    const text = r.note?.trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (typed && (key === typed || !key.includes(typed))) continue
    const sameSub = !!opts.sub && r.subCategory === opts.sub
    const hit = map.get(key)
    if (!hit) {
      map.set(key, { text, amount: r.amount, count: 1, lastDate: r.date, lastCreated: r.createdAt, sameSub })
      continue
    }
    hit.count++
    hit.sameSub ||= sameSub
    if (r.date > hit.lastDate || (r.date === hit.lastDate && r.createdAt > hit.lastCreated)) {
      hit.lastDate = r.date
      hit.lastCreated = r.createdAt
      hit.amount = r.amount
      hit.text = text
    }
  }
  return [...map.values()]
    .sort(
      (a, b) =>
        Number(b.sameSub) - Number(a.sameSub) ||
        b.count - a.count ||
        (a.lastDate < b.lastDate ? 1 : a.lastDate > b.lastDate ? -1 : 0),
    )
    .slice(0, opts.limit ?? 8)
    .map(({ text, amount, count }) => ({ text, amount, count }))
}
