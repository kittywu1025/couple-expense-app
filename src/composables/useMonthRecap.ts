import { computed, ref } from 'vue'
import { useBooks } from './useBooks'
import { useRecords } from './useRecords'
import { todayKey, toDateKey, formatMoney } from '../utils/format'
import { computeStats } from '../utils/stats'

const STORAGE_KEY = 'couple-expense-month-recap-closed'

const readClosed = () => {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** 今天已经看过（关掉）的话就不再出现 */
const closedOn = ref(readClosed())
/** 开发模式下可以强制预览 */
const forced = ref(false)
export const recapOpen = ref(false)

const isLastDayOfMonth = (d = new Date()) => {
  const next = new Date(d)
  next.setDate(d.getDate() + 1)
  return next.getMonth() !== d.getMonth()
}

export const recapAvailable = computed(() => (forced.value || isLastDayOfMonth()) && closedOn.value !== todayKey())

export const previewRecap = () => {
  forced.value = true
  closedOn.value = null
  recapOpen.value = true
}

export const closeRecap = () => {
  recapOpen.value = false
  forced.value = false
  closedOn.value = todayKey()
  try {
    localStorage.setItem(STORAGE_KEY, closedOn.value)
  } catch {
    // 无痕模式等写不进去也没关系，最多今天再出现一次
  }
}

const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)]

export function useMonthRecap() {
  const { myUid, partner, nameOf, otherUid } = useBooks()
  const { records } = useRecords()

  const partnerName = computed(() => partner.value?.displayName ?? 'TA')
  const myName = computed(() => nameOf(myUid.value))

  // 本月 = 自然月 1 号到今天
  const monthRecords = computed(() => {
    const now = new Date()
    const start = toDateKey(new Date(now.getFullYear(), now.getMonth(), 1))
    const end = todayKey()
    return records.value.filter((r) => r.date >= start && r.date <= end)
  })
  const expenses = computed(() => monthRecords.value.filter((r) => r.kind === 'expense'))
  const stats = computed(() => computeStats(monthRecords.value, myUid.value, otherUid))

  const summary = computed(() => ({
    total: stats.value.totalExpense,
    count: expenses.value.length,
    myTreats: stats.value.myTreats,
    partnerTreats: stats.value.partnerTreats,
  }))

  /** 差额只轻描淡写，不显示金额、不催转账 */
  const balanceLine = computed(() => {
    const diff = stats.value.diff
    if (Math.abs(diff) <= 1000) return '这个月基本扯平，挺好的'
    // diff > 0：我欠对方 → 对方多垫了
    const payer = diff > 0 ? partnerName.value : myName.value
    return `${payer} 这个月多垫了一些，下个月记得多疼 TA～`
  })

  /** 打开时随机挑一条（只从有数据的模板里挑） */
  const buildSlogan = () => {
    const s = summary.value
    const options: string[] = [`这个月一起花了 ${formatMoney(s.total)}，每一笔都算数。`]

    if (s.myTreats || s.partnerTreats) {
      const meMore = s.myTreats >= s.partnerTreats
      const who = meMore ? myName.value : partnerName.value
      const n = meMore ? s.myTreats : s.partnerTreats
      options.push(`${who} 这个月请了 TA ${n} 次，用心了。`)
    }

    const eatOut = expenses.value.filter((r) => r.subCategory === '外食').reduce((t, r) => t + r.amount, 0)
    if (eatOut > 0) options.push(`${formatMoney(eatOut)} 的饭，好吃吗？`)

    if (stats.value.aaCount > 0) options.push(`${stats.value.aaCount} 笔共同开销，一起过的 ${new Date().getDate()} 天。`)

    const byCat = new Map<string, number>()
    for (const r of expenses.value) byCat.set(r.category, (byCat.get(r.category) ?? 0) + r.amount)
    const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0]
    if (top) options.push(`这个月「${top[0]}」花得最多，值得吗？`)

    return pick(options)
  }

  return { summary, balanceLine, buildSlogan, myName, partnerName }
}
