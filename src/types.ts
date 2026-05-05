export type Payer = 'me' | 'partner'
export type Performer = 'me' | 'partner'
export type Recurrence = 'none' | 'monthly'
export type SplitPreset = 'equal' | 'rent' | 'custom' | 'payer-only'
export type SupportedCurrency = 'JPY' | 'CNY'

export interface SplitRule {
  me: number
  partner: number
}

export interface ExpenseCategory {
  id: string
  name: string
  icon: string
}

export interface Expense {
  id: string
  title: string
  amount: number
  originalAmount: number
  originalCurrency: SupportedCurrency
  baseCurrency: SupportedCurrency
  exchangeRateUsed: number
  exchangeRateDate: string
  date: string
  category: string
  payer: Payer
  bookId?: string
  createdBy?: string
  split: SplitRule
  splitPreset: SplitPreset
  recurrence: Recurrence
  note?: string
  shared?: boolean
  syncStatus?: 'synced' | 'pending'
  createdAt?: string
  updatedAt?: string
}

export interface AppSettings {
  meName: string
  partnerName: string
  defaultCurrency: SupportedCurrency
  defaultSplits: {
    standard: SplitRule
    rent: SplitRule
  }
  categories: ExpenseCategory[]
}

export type BookRole = 'owner' | 'member'

export interface Book {
  id: string
  name: string
  inviteCode: string
  createdBy?: string
  createdAt?: string
}

export interface BookMember {
  id: string
  bookId: string
  userId: string
  role: BookRole
  joinedAt?: string
}

export interface Chore {
  id: string
  title: string
  date: string
  performer: Performer
  points: number
  done: boolean
  note?: string
}

export interface CountdownSettings {
  startedDate: string
  birthday: string
}
