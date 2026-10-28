export type CurrencyCode = 'JPY' | 'CNY' | 'USD' | 'KRW' | 'TWD' | 'HKD'

export type Gender = 'female' | 'male'
export type MemberColor = 'pink' | 'blue' | 'purple' | 'green' | 'orange' | 'yellow' | 'red' | 'teal'

export type RecordKind = 'expense' | 'income'
export type RecordType = 'personal' | 'shared'
/** 对方确认状态：共同账单、借款、还款都要对方点过「确认」才算数 */
export type ConfirmStatus = 'confirmed' | 'pending' | 'disputed'

/** 有疑问 / 回复的一条留言 */
export interface DiscussionEntry {
  by: string
  text: string
  /** 有疑问时提议的比例（付款人份额 0-10，和 LedgerRecord.ratio 同口径） */
  ratio?: number
  at: string
}

export interface Confirmable {
  confirmStatus: ConfirmStatus
  /** 最近一次新建 / 改内容的人；由另一个人确认 */
  lastEditedBy: string
  /** 两人来回的留言，只往后加 */
  discussion: DiscussionEntry[]
}

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

export interface LedgerRecord extends Confirmable {
  id: string
  bookId: string
  amount: number
  kind: RecordKind
  type: RecordType
  payerUid: string
  /** 付款人承担的份额 0-10 */
  ratio: number
  /** 对方那份已经给付款人了（付款人在「结清」页标记已收到）：照常算各自承担，但不进月末差额 */
  settledOnSpot?: boolean
  /** 标记已收到的时间 */
  settledAt?: string | null
  category: string
  subCategory: string | null
  note: string | null
  date: string
  createdBy: string
  createdAt: string
}

export interface FixedExpense {
  id: string
  bookId: string
  name: string
  amount: number
  category: string
  subCategory: string | null
  /** 每月几号（1-31，超过当月天数按月底） */
  dayOfMonth: number
  /** 每几个月扣一次（1 = 每月，12 = 每年） */
  intervalMonths: number
  payerUid: string
  type: RecordType
  /** 付款人承担的份额 0-10 */
  ratio: number
  paused: boolean
  startDate: string
  lastGeneratedDate: string | null
  createdBy: string
}

export type FixedExpenseInput = Pick<
  FixedExpense,
  'name' | 'amount' | 'category' | 'subCategory' | 'dayOfMonth' | 'intervalMonths' | 'payerUid' | 'type' | 'ratio'
>

export type NewRecord = Omit<LedgerRecord, 'id' | 'bookId' | 'createdBy' | 'createdAt' | keyof Confirmable>

/** 两人之间的借款 */
export interface Loan extends Confirmable {
  id: string
  bookId: string
  lenderUid: string
  borrowerUid: string
  amount: number
  /** 借款可以是外币，默认账本货币；还款跟着借款的货币 */
  currency: CurrencyCode
  note: string | null
  date: string
  createdBy: string
  createdAt: string
}

/** 一笔还款（可以分几次还） */
export interface LoanRepayment extends Confirmable {
  id: string
  loanId: string
  bookId: string
  amount: number
  note: string | null
  date: string
  createdBy: string
  createdAt: string
}

export type TabKey = 'home' | 'stats' | 'me'
