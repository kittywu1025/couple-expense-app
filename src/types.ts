export type CurrencyCode = 'JPY' | 'CNY' | 'USD' | 'KRW' | 'TWD' | 'HKD'

export type Gender = 'female' | 'male'
export type MemberColor = 'pink' | 'blue' | 'purple' | 'green' | 'orange' | 'yellow' | 'red' | 'teal'

export type RecordKind = 'expense' | 'income'
export type RecordType = 'personal' | 'shared'

export interface CustomCategory {
  key: string
  name: string
  /** IconName，存成字符串 */
  icon: string
  color: string
  kind: RecordKind
  subs: { name: string; icon: string }[]
}

export interface Book {
  id: string
  inviteCode: string
  settleDay: number
  defaultRatio: number
  /** 账本记账货币，只影响显示单位，不做汇率换算 */
  currency: CurrencyCode
  /** 两人共用的自定义分类 */
  customCategories: CustomCategory[]
  createdBy: string
  createdAt: string
}

export interface BookMember {
  id: string
  bookId: string
  userId: string
  displayName: string
  gender: Gender | null
  /** 自定义标识色，同一账本内两人不同 */
  color: MemberColor | null
  joinedAt: string
}

export interface LedgerRecord {
  id: string
  bookId: string
  amount: number
  kind: RecordKind
  type: RecordType
  payerUid: string
  /** 付款人承担的份额 0-10 */
  ratio: number
  category: string
  subCategory: string | null
  note: string | null
  date: string
  createdBy: string
  createdAt: string
}

export type NewRecord = Omit<LedgerRecord, 'id' | 'bookId' | 'createdBy' | 'createdAt'>

export type TabKey = 'home' | 'stats' | 'me'
