import type { LedgerRecord } from '../types'
import { isAgreed, isTreat, partOf } from './settlement'

/** 表格里有逗号、引号、换行的格子要用引号包起来 */
const cell = (v: string | number) => {
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * 导出成 CSV（Excel / Numbers / Google 表格都能打开）。
 * 和统计口径一样：共同的全部 + 自己的个人收支；TA 的个人记录和收入不导出。
 * 按日期从早到晚排。
 */
export const recordsToCsv = (
  records: LedgerRecord[],
  opts: { myUid: string; nameOf: (uid: string) => string; partnerName: string },
) => {
  const header = ['日期', '收支', '类型', '分类', '子分类', '金额', '谁付的', '我承担', `${opts.partnerName}承担`, '状态', '备注']
  const rows = records
    .filter((r) => r.type === 'shared' || r.payerUid === opts.myUid)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1))
    .map((r) => {
      const shared = r.type === 'shared'
      const mine = shared ? (isAgreed(r) ? partOf(r, opts.myUid) : r.payerUid === opts.myUid ? r.amount : 0) : r.amount
      const status = !shared
        ? ''
        : !isAgreed(r)
          ? '未入账'
          : isTreat(r)
            ? '请客'
            : r.settledOnSpot
              ? '已结清'
              : '未结清'
      return [
        r.date,
        r.kind === 'income' ? '收入' : '支出',
        shared ? '共同' : '个人',
        r.category,
        r.subCategory ?? '',
        r.amount,
        opts.nameOf(r.payerUid),
        mine,
        shared ? Math.round((r.amount - mine) * 100) / 100 : '',
        status,
        r.note ?? '',
      ]
    })
  // 开头的 BOM 让 Excel 认出是 UTF-8，中文不乱码
  return '﻿' + [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n')
}

/** 存成文件：手机上能分享就走系统分享（存到文件 / 发给自己），不行就直接下载 */
export const saveCsv = async (csv: string, filename: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const file = typeof File !== 'undefined' ? new File([blob], filename, { type: 'text/csv' }) : null
  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
  if (coarse && file && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
      // 分享不了就退回下载
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
