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
  { key: 'pink', name: '樱花粉', color: '#FFB7C5', text: '#D6336C', bg: '#FFF0F3' },
  { key: 'blue', name: '天空蓝', color: '#74C0FC', text: '#1C7ED6', bg: '#E7F5FF' },
  { key: 'purple', name: '薰衣草紫', color: '#6C63FF', text: '#5146E0', bg: '#EFEEFF' },
  { key: 'green', name: '薄荷绿', color: '#2DB87A', text: '#1E8C5B', bg: '#E6F8EF' },
  { key: 'orange', name: '橙色', color: '#F59F00', text: '#C77C02', bg: '#FFF4E0' },
  { key: 'teal', name: '青色', color: '#22B8CF', text: '#0C8599', bg: '#E3FAFC' },
  { key: 'yellow', name: '鹅黄', color: '#FAB005', text: '#B07A00', bg: '#FFF9DB' },
  { key: 'red', name: '珊瑚红', color: '#FF6B6B', text: '#E03131', bg: '#FFF0F0' },
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
