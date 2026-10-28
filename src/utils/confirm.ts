import type { Confirmable, DiscussionEntry } from '../types'

/** 对方记的、还没确认的：等我点「确认 / 有疑问」 */
export const waitingForMe = (x: Confirmable, uid: string) => x.confirmStatus === 'pending' && x.lastEditedBy !== uid
/** 我记的、对方还没确认 */
export const waitingForPartner = (x: Confirmable, uid: string) => x.confirmStatus === 'pending' && x.lastEditedBy === uid
/** 我记的、对方有疑问：需要我改一下或者当面说清楚 */
export const disputedByPartner = (x: Confirmable, uid: string) => x.confirmStatus === 'disputed' && x.lastEditedBy === uid
/** 轮到我表态（包括我之前点了「有疑问」、现在想确认的） */
export const canRespond = (x: Confirmable, uid: string) => x.confirmStatus !== 'confirmed' && x.lastEditedBy !== uid

export const confirmLabel = (x: Confirmable, uid: string) => {
  if (x.confirmStatus === 'confirmed') return '已确认'
  if (x.confirmStatus === 'disputed') return x.lastEditedBy === uid ? 'TA 有疑问' : '我提了疑问'
  return x.lastEditedBy === uid ? '等 TA 确认' : '等我确认'
}

/** 从数据库读出来的留言，过滤掉格式不对的 */
export const parseDiscussion = (raw: unknown): DiscussionEntry[] =>
  Array.isArray(raw)
    ? raw
        .filter((e) => e && typeof e === 'object' && typeof e.text === 'string')
        .map((e) => ({
          by: String(e.by ?? ''),
          text: String(e.text),
          at: String(e.at ?? ''),
          ...(typeof e.ratio === 'number' ? { ratio: e.ratio } : {}),
        }))
    : []

export const newEntry = (by: string, text: string, ratio?: number | null): DiscussionEntry => ({
  by,
  text,
  at: new Date().toISOString(),
  ...(ratio === null || ratio === undefined ? {} : { ratio }),
})

/** 对方最近一次提议的比例（记账人可以一键采纳） */
export const pendingProposal = (x: Confirmable, uid: string) => {
  if (x.confirmStatus !== 'disputed') return null
  const last = x.discussion[x.discussion.length - 1]
  return last && last.by !== uid && typeof last.ratio === 'number' ? last.ratio : null
}

/**
 * 演示模式下在本地模拟数据库的确认守卫（supabase 的 confirm_guard）：
 * 新建或内容有改动时由另一个人确认；只改备注不用重新确认。
 */
export const stampConfirm = <T extends Confirmable>(
  next: T,
  prev: T | null,
  actor: string,
  needsConfirm: boolean,
  contentKeys: (keyof T)[],
): T => {
  if (prev && contentKeys.every((k) => prev[k] === next[k])) return { ...next, lastEditedBy: prev.lastEditedBy, confirmStatus: prev.confirmStatus }
  // 按对方提议的比例改：直接算确认（和数据库规则一致）
  const proposal = prev ? pendingProposal(prev, actor) : null
  if (prev && proposal !== null && contentKeys.every((k) => k === 'ratio' || prev[k] === next[k]) && (next as { ratio?: number }).ratio === proposal)
    return { ...next, lastEditedBy: actor, confirmStatus: 'confirmed' }
  return { ...next, lastEditedBy: actor, confirmStatus: needsConfirm ? 'pending' : 'confirmed' }
}
