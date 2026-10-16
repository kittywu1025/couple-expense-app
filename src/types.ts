export type RecordKind = 'expense' | 'income'
export type RecordType = 'personal' | 'shared'

export interface Book {
  id: string
  inviteCode: string
  settleDay: number
  defaultRatio: number
  createdBy: string
  createdAt: string
}

export interface BookMember {
  id: string
  bookId: string
  userId: string
  displayName: string
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
