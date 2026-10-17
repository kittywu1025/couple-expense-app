import type { Gender, MemberColor } from '../types'

export interface ColorSwatch {
  key: MemberColor
  name: string
  /** 主色：圆点、头像、滑条 */
  color: string
  /** 深一档：用在浅底上的文字 */
  text: string
  /** 浅底：选中的按钮、标签背景 */
  bg: string
}

export const MEMBER_COLORS: ColorSwatch[] = [
  { key: 'pink', name: '樱花粉', color: '#FF8FAB', text: '#D9577A', bg: '#FFF0F3' },
  { key: 'blue', name: '天空蓝', color: '#74C0FC', text: '#2F86C9', bg: '#EFF8FF' },
  { key: 'purple', name: '薰衣草', color: '#B197FC', text: '#7950F2', bg: '#F3F0FF' },
  { key: 'green', name: '薄荷绿', color: '#63E6BE', text: '#0CA678', bg: '#E6FCF5' },
  { key: 'orange', name: '橘子橙', color: '#FFA94D', text: '#E8590C', bg: '#FFF4E6' },
  { key: 'teal', name: '湖水青', color: '#66D9E8', text: '#1098AD', bg: '#E3FAFC' },
  { key: 'yellow', name: '柠檬黄', color: '#FFD43B', text: '#E67700', bg: '#FFF9DB' },
  { key: 'red', name: '番茄红', color: '#FF8787', text: '#E03131', bg: '#FFF5F5' },
]

export const isMemberColor = (v: unknown): v is MemberColor => MEMBER_COLORS.some((c) => c.key === v)

export const swatchOf = (key: MemberColor) => MEMBER_COLORS.find((c) => c.key === key) ?? MEMBER_COLORS[0]

/** 性别只决定默认色，用户可以随时换 */
export const defaultColorFor = (gender: Gender | null): MemberColor => (gender === 'male' ? 'blue' : 'pink')

/** 第一个不等于 taken 的颜色，从 preferred 开始找 */
export const firstFreeColor = (preferred: MemberColor, taken: MemberColor | null): MemberColor => {
  if (preferred !== taken) return preferred
  return MEMBER_COLORS.find((c) => c.key !== taken)!.key
}
