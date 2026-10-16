export const formatMoney = (value: number) =>
  `¥${Math.round(value).toLocaleString('ja-JP')}`

export const toDateKey = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const todayKey = () => toDateKey(new Date())

export const formatDateLabel = (key: string) => {
  const today = todayKey()
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (key === today) return '今天'
  if (key === toDateKey(y)) return '昨天'
  const [, m, d] = key.split('-')
  return `${Number(m)}月${Number(d)}日`
}
