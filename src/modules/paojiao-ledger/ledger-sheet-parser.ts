import {
  LedgerData,
  LedgerEntry,
  LedgerPerson,
  LedgerRound,
  LedgerWage,
  LedgerWithdrawal,
} from './paojiao-ledger.interface'

export type Cell = string | number | undefined | null
export type Grid = Cell[][]

// Column positions in the live "ชีต1" tab (0-indexed: A=0, B=1, ...). Verified cell-by-cell
// against the real spreadsheet on 2026-08-19.
const COL = {
  DATE: 0,
  ITEM: 1,
  IN_CASH: 2,
  IN_BANK: 3,
  OUT_CASH: 4,
  OUT_BANK: 5,
  NOTE: 6,
  WD1_DATE: 12, // M - withdrawal table for the first person (น้าปุ้ม)
  WD1_BANK: 13,
  WD1_CASH: 14,
  WD1_NOTE: 15,
  WD2_DATE: 16, // Q - withdrawal table for the second person (ปัญญา)
  WD2_BANK: 17,
  WD2_CASH: 18,
  WD2_NOTE: 19,
  WAGE_DATE: 24, // Y
  WAGE_AMOUNT: 25, // Z
} as const

export const TABLE_START_ROW = 5 // 1-indexed spreadsheet row where every table's data begins

const sum = (arr: LedgerEntry[], f: (e: LedgerEntry) => number) => arr.reduce((a, e) => a + f(e), 0)

function toNumber(v: Cell): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && v.trim() !== '') return Number(v.replace(/,/g, '')) || 0
  return 0
}

function toText(v: Cell): string {
  if (v === undefined || v === null) return ''
  return typeof v === 'string' ? v.trim() : String(v)
}

const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30) // day 0 in Excel's date serial numbering

// Dates are native Excel date cells (serial day numbers, e.g. 46213 -> "2026-07-10"), not text.
// A "DD/MM/YY" text fallback is kept in case a cell was ever typed in as plain text.
function toIsoDate(v: Cell): string {
  if (typeof v === 'number') {
    return new Date(EXCEL_EPOCH_UTC_MS + v * 86400000).toISOString().slice(0, 10)
  }
  const text = toText(v)
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(text)
  if (!match) return text
  const [, d, m, y] = match
  return `20${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

// Inverse of the numeric branch above - used when writing a new row (append) so the sheet gets
// a real date cell, not a locale-ambiguous text string the Sheets API would have to re-parse.
export function isoDateToExcelSerial(iso: string): number {
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - EXCEL_EPOCH_UTC_MS) / 86400000)
}

function isBlankRow(row: Cell[] | undefined, cols: readonly number[]): boolean {
  if (!row) return true
  return cols.every(c => toText(row[c]) === '')
}

// The date column is only filled in on the first row of each day - same-day rows below it
// leave it blank. Both parsers below carry the last-seen date forward across those blanks.
function resolveDate(row: Cell[], lastDate: string): string {
  const cell = row[COL.DATE]
  return toText(cell) === '' ? lastDate : toIsoDate(cell)
}

export function parseEntries(grid: Grid): LedgerEntry[] {
  const entries: LedgerEntry[] = []
  let id = 1
  let lastDate = ''
  for (let i = TABLE_START_ROW - 1; i < grid.length; i++) {
    const row = grid[i]
    if (!row || toText(row[COL.ITEM]) === '') break
    lastDate = resolveDate(row, lastDate)
    entries.push({
      id: id++,
      row: i + 1,
      date: lastDate,
      item: toText(row[COL.ITEM]),
      inCash: toNumber(row[COL.IN_CASH]),
      inBank: toNumber(row[COL.IN_BANK]),
      outCash: toNumber(row[COL.OUT_CASH]),
      outBank: toNumber(row[COL.OUT_BANK]),
      note: toText(row[COL.NOTE]),
    })
  }
  return entries
}

// The item text that settles a round. Reverse-engineered from the real sheet's manual column-I
// flag (2026-08-19): a round always closes on the LAST entry of an unbroken run of this item -
// confirmed against all 12 historical rounds with zero mismatches. A single physical settlement
// is sometimes recorded as two adjacent rows (e.g. a cash portion and a bank portion of the same
// sale) - only the later one is the actual close, earlier ones in the same run are just normal
// entries within the still-open round. This replaces the old manual per-row flag entirely, so
// closing a round no longer requires editing the sheet by hand.
export const OIL_SALE_ITEM = 'ขาย น้ำมัน'

export function deriveRounds(entries: LedgerEntry[]): {
  rounds: LedgerRound[]
  lastRoundRow: number
} {
  const rounds: LedgerRound[] = []
  let fromRow = entries[0]?.row ?? TABLE_START_ROW
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    if (entry.item !== OIL_SALE_ITEM) continue
    if (entries[i + 1]?.item === OIL_SALE_ITEM) continue // same settlement continues on the next row
    const block = entries.filter(e => e.row >= fromRow && e.row <= entry.row)
    const profit = sum(block, e => e.inCash + e.inBank) - sum(block, e => e.outCash + e.outBank)
    rounds.push({ date: entry.date, fromRow, toRow: entry.row, profit })
    fromRow = entry.row + 1
  }
  const lastRoundRow = rounds.length ? rounds[rounds.length - 1].toRow : 0
  return { rounds, lastRoundRow }
}

export function parseRounds(grid: Grid): { rounds: LedgerRound[]; lastRoundRow: number } {
  return deriveRounds(parseEntries(grid))
}

export interface DateReorderPlan {
  fromRow: number
  toRow: number
  entries: LedgerEntry[] // what should occupy rows [fromRow, toRow], in that order
}

// Add/edit only ever writes ONE row's values - it never moves anything - so a backdated (or
// re-dated) entry can end up physically sitting after a round that already closed on an earlier
// date, and deriveRounds (which slices by row, not date) then silently counts it into the wrong
// round. This computes the minimal contiguous row window that needs rewriting to put `movedRow`
// back into date order - ties go AFTER existing same-date entries, matching how a same-day entry
// has always landed at the end of that day's block when simply appended. Returns null if
// `movedRow` is already in the correct slot (the common case - most entries use today's date,
// which is already the latest).
export function computeDateReorder(
  entries: LedgerEntry[],
  movedRow: number
): DateReorderPlan | null {
  const movedIdx = entries.findIndex(e => e.row === movedRow)
  if (movedIdx === -1) return null
  const moved = entries[movedIdx]
  const others = entries.filter(e => e.row !== movedRow)

  let insertAt = others.length
  for (let i = 0; i < others.length; i++) {
    if (others[i].date > moved.date) {
      insertAt = i
      break
    }
  }

  const newOrder = [...others.slice(0, insertAt), moved, ...others.slice(insertAt)]

  let start = -1
  let end = -1
  for (let i = 0; i < entries.length; i++) {
    if (newOrder[i].row !== entries[i].row) {
      if (start === -1) start = i
      end = i
    }
  }
  if (start === -1) return null

  return {
    fromRow: entries[start].row,
    toRow: entries[end].row,
    entries: newOrder.slice(start, end + 1),
  }
}

function parseWithdrawalTable(
  grid: Grid,
  who: LedgerPerson,
  cols: { date: number; bank: number; cash: number; note: number }
): LedgerWithdrawal[] {
  const withdrawals: LedgerWithdrawal[] = []
  const checkCols = [cols.date, cols.bank, cols.cash, cols.note]
  for (let i = TABLE_START_ROW - 1; i < grid.length; i++) {
    const row = grid[i]
    if (isBlankRow(row, checkCols)) break
    withdrawals.push({
      who,
      date: toIsoDate(row[cols.date]),
      bank: toNumber(row[cols.bank]),
      cash: toNumber(row[cols.cash]),
      note: toText(row[cols.note]),
    })
  }
  return withdrawals
}

export function parseWithdrawals(grid: Grid): LedgerWithdrawal[] {
  return [
    ...parseWithdrawalTable(grid, 'น้าปุ้ม', {
      date: COL.WD1_DATE,
      bank: COL.WD1_BANK,
      cash: COL.WD1_CASH,
      note: COL.WD1_NOTE,
    }),
    ...parseWithdrawalTable(grid, 'ปัญญา', {
      date: COL.WD2_DATE,
      bank: COL.WD2_BANK,
      cash: COL.WD2_CASH,
      note: COL.WD2_NOTE,
    }),
  ]
}

// Unlike the other tables, the wage date column is pre-filled a calendar's worth of days ahead
// of actual data (so the user only has to type an amount each day) - the amount cell going
// blank is the real end-of-data signal here, not the date.
export function parseWages(grid: Grid): LedgerWage[] {
  const wages: LedgerWage[] = []
  for (let i = TABLE_START_ROW - 1; i < grid.length; i++) {
    const row = grid[i]
    if (!row || toText(row[COL.WAGE_AMOUNT]) === '') break
    wages.push({ date: toIsoDate(row[COL.WAGE_DATE]), amount: toNumber(row[COL.WAGE_AMOUNT]) })
  }
  return wages
}

export function parseLiveSheet(
  grid: Grid
): Pick<LedgerData, 'entries' | 'rounds' | 'withdrawals' | 'wages' | 'lastRoundRow'> {
  const entries = parseEntries(grid)
  const { rounds, lastRoundRow } = deriveRounds(entries)
  const withdrawals = parseWithdrawals(grid)
  const wages = parseWages(grid)
  return { entries, rounds, withdrawals, wages, lastRoundRow }
}

// Archive tabs (e.g. "090726") record the profit/withdrawal totals carried forward as the next
// round's opening baseline. Layout verified against one real archive tab only - if a future
// archive tab is laid out differently, this returns undefined fields and the caller should fall
// back to a manual value rather than guess.
export function parseArchiveOpeningStats(grid: Grid): {
  priorProfit?: number
  priorWithdraw?: Record<LedgerPerson, number>
} {
  return { priorProfit: findLabelledTotal(grid), priorWithdraw: findPriorWithdraw(grid) }
}

function findLabelledTotal(grid: Grid): number | undefined {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]
    for (let c = 0; c < (row?.length ?? 0); c++) {
      if (toText(row[c]) === 'ทั้งหมด') {
        const value = grid[r + 1]?.[c]
        if (toText(value) !== '') return toNumber(value)
      }
    }
  }
  return undefined
}

function findPriorWithdraw(grid: Grid): Record<LedgerPerson, number> | undefined {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]
    for (let c = 0; c < (row?.length ?? 0); c++) {
      if (toText(row[c]) !== 'ถอนไปแล้ว') continue
      const nameRow = grid[r + 1]
      const valueRow = grid[r + 2]
      const result: Partial<Record<LedgerPerson, number>> = {}
      // Only take the first name column found for each person - the same "น้าปุ้ม"/"ปัญญา"
      // labels reappear a few columns later for a different stat ("จำนวนเงินที่ถอนได้").
      for (let cc = c; cc < c + 6 && nameRow && cc < nameRow.length; cc++) {
        const name = toText(nameRow[cc])
        if ((name === 'น้าปุ้ม' || name === 'ปัญญา') && result[name] === undefined) {
          result[name] = toNumber(valueRow?.[cc])
        }
      }
      if (result['น้าปุ้ม'] !== undefined && result['ปัญญา'] !== undefined) {
        return result as Record<LedgerPerson, number>
      }
    }
  }
  return undefined
}

// The live "ชีต1" tab's own dashboard area (around J8:K13) carries the opening cash/bank balance
// and start date as label-cell/value-cell pairs sitting in the same row, value one column to the
// right of the label - found by inspecting the real sheet on 2026-08-20. The cash/bank labels
// have a literal line break in the cell ("เงินสด" then "ยกยอดมา" on a second line).
const CASH_LABEL = 'เงินสด\nยกยอดมา'
const BANK_LABEL = 'เงินในบัญชี\nยกยอดมา'
const START_DATE_LABEL = 'วันที่เริ่ม'

export function parseLiveOpeningStats(grid: Grid): {
  cash?: number
  bank?: number
  startDate?: string
} {
  return {
    cash: findValueRightOfLabel(grid, CASH_LABEL, toNumber),
    bank: findValueRightOfLabel(grid, BANK_LABEL, toNumber),
    startDate: findValueRightOfLabel(grid, START_DATE_LABEL, toIsoDate),
  }
}

function findValueRightOfLabel<T>(
  grid: Grid,
  label: string,
  read: (cell: Cell) => T
): T | undefined {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]
    for (let c = 0; c < (row?.length ?? 0); c++) {
      if (toText(row[c]) === label) {
        const value = row[c + 1]
        if (toText(value) !== '') return read(value)
      }
    }
  }
  return undefined
}
