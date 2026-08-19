export type LedgerPerson = 'น้าปุ้ม' | 'ปัญญา'

export interface LedgerEntry {
  id: number
  row: number
  date: string
  item: string
  inCash: number
  inBank: number
  outCash: number
  outBank: number
  note: string
}

export interface LedgerRound {
  date: string
  fromRow: number
  toRow: number
  profit: number
}

export interface LedgerWithdrawal {
  who: LedgerPerson
  date: string
  bank: number
  cash: number
  note: string
}

export interface LedgerWage {
  date: string
  amount: number
}

export interface LedgerOpening {
  cash: number
  bank: number
  priorProfit: number
  priorWithdraw: Record<LedgerPerson, number>
}

export interface LedgerData {
  opening: LedgerOpening
  startDate: string
  lastRoundRow: number
  entries: LedgerEntry[]
  rounds: LedgerRound[]
  withdrawals: LedgerWithdrawal[]
  wages: LedgerWage[]
  items: string[]
}
