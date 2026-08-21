import {
  computeDateReorder,
  isoDateToExcelSerial,
  OIL_SALE_ITEM,
  parseArchiveOpeningStats,
  parseEntries,
  parseLiveOpeningStats,
  parseLiveSheet,
  parseRounds,
  parseWages,
  parseWithdrawals,
} from './ledger-sheet-parser'
import { LedgerEntry } from './paojiao-ledger.interface'

type Cell = string | number | undefined
type SparseRow = Record<number, Cell>

// Excel date serials (days since 1899-12-30) for the fixture dates below.
const D = {
  '2025-01-01': 45658,
  '2025-01-02': 45659,
  '2025-01-03': 45660,
  '2025-01-04': 45661,
  '2025-01-05': 45662,
  '2025-01-06': 45663,
}

// Builds a 26-column row (A..Z) from a sparse { colIndex: value } map, matching the shape the
// real "ชีต1" tab returns from the Sheets API (UNFORMATTED_VALUE).
function row(cells: SparseRow): Cell[] {
  const r: Cell[] = new Array(26).fill('')
  for (const [i, v] of Object.entries(cells)) r[Number(i)] = v
  return r
}

// Synthetic data only - never the user's real financial numbers. Mirrors two real-sheet quirks
// discovered while cross-checking against the actual spreadsheet:
//  - the date column is only filled on the first row of each day, blank below it (row6, row9)
//  - the oil-sale item repeating on two adjacent rows (row6, row7) does NOT mean both close a
//    round - only the LAST row of that unbroken run does (row7, not row6)
function buildLiveGrid(): Cell[][] {
  return [
    [], // row1
    [], // row2
    [], // row3
    [], // row4
    row({
      0: D['2025-01-01'],
      1: 'ซื้อของ',
      2: 100,
      12: D['2025-01-05'],
      13: 1000,
      14: 50,
      15: 'note-a',
      16: D['2025-01-06'],
      17: 200,
      18: 0,
      19: 'note-b',
      24: D['2025-01-01'],
      25: 100,
    }), // row5
    row({ 1: OIL_SALE_ITEM, 3: 500, 24: D['2025-01-02'], 25: 150 }), // row6 - same day as row5 (A blank), does NOT close a round (row7 continues the same run)
    row({ 0: D['2025-01-02'], 1: OIL_SALE_ITEM, 3: 300, 24: D['2025-01-03'] }), // row7 - closes round 1 (100+500+300=900); wage amount left blank (not yet entered)
    row({ 0: D['2025-01-03'], 1: 'ค่าใช้จ่าย', 5: 200 }), // row8
    row({ 1: OIL_SALE_ITEM, 3: 1000 }), // row9 - same day as row8 (A blank), closes round 2 (1000-200=800)
    [], // row10 - blank, data ends
  ]
}

describe('ledger-sheet-parser', () => {
  describe('parseEntries', () => {
    it('reads entries starting at row 5 until the first row with no item', () => {
      const entries = parseEntries(buildLiveGrid())
      expect(entries).toHaveLength(5)
      expect(entries[0]).toEqual({
        id: 1,
        row: 5,
        date: '2025-01-01',
        item: 'ซื้อของ',
        inCash: 100,
        inBank: 0,
        outCash: 0,
        outBank: 0,
        note: '',
      })
      expect(entries[4]).toEqual({
        id: 5,
        row: 9,
        date: '2025-01-03',
        item: OIL_SALE_ITEM,
        inCash: 0,
        inBank: 1000,
        outCash: 0,
        outBank: 0,
        note: '',
      })
    })

    it('carries the date forward across same-day rows that leave the date cell blank', () => {
      const entries = parseEntries(buildLiveGrid())
      expect(entries[1]).toMatchObject({ row: 6, date: '2025-01-01' }) // A6 is blank in the fixture
      expect(entries[4]).toMatchObject({ row: 9, date: '2025-01-03' }) // A9 is blank in the fixture
    })
  })

  describe('parseRounds', () => {
    it('only closes a round on the last row of an unbroken run of the oil-sale item', () => {
      const { rounds, lastRoundRow } = parseRounds(buildLiveGrid())
      expect(rounds).toEqual([
        { date: '2025-01-02', fromRow: 5, toRow: 7, profit: 900 },
        { date: '2025-01-03', fromRow: 8, toRow: 9, profit: 800 },
      ])
      expect(lastRoundRow).toBe(9)
    })

    it('returns no rounds and lastRoundRow 0 when nothing has closed yet', () => {
      const grid = [[], [], [], [], row({ 0: D['2025-01-01'], 1: 'ซื้อของ', 2: 100 })]
      expect(parseRounds(grid)).toEqual({ rounds: [], lastRoundRow: 0 })
    })

    it('closes a fresh round the moment a new oil-sale row is added, with no sheet edit needed', () => {
      const grid = buildLiveGrid()
      grid[9] = row({ 0: D['2025-01-04'], 1: 'มัน ติ๊ก', 5: 150 }) // row10 was blank (data-end); a purchase after round 2 closed
      grid.push(row({ 0: D['2025-01-05'], 1: OIL_SALE_ITEM, 3: 400 })) // row11 - today's new sale, nothing manually flagged
      const { rounds, lastRoundRow } = parseRounds(grid)
      expect(rounds).toHaveLength(3)
      expect(rounds[2]).toEqual({ date: '2025-01-05', fromRow: 10, toRow: 11, profit: 250 }) // 400 in - 150 out
      expect(lastRoundRow).toBe(11)
    })
  })

  describe('computeDateReorder', () => {
    // id/item/amounts are irrelevant to the reorder logic itself - only row and date matter.
    const mkEntry = (row: number, date: string): LedgerEntry => ({
      id: row,
      row,
      date,
      item: 'ซื้อของ',
      inCash: 0,
      inBank: 0,
      outCash: 0,
      outBank: 0,
      note: '',
    })

    it('returns null when the entry is already in date order', () => {
      const entries = [mkEntry(5, '2026-01-01'), mkEntry(6, '2026-01-02'), mkEntry(7, '2026-01-03')]
      expect(computeDateReorder(entries, 6)).toBeNull()
    })

    it('returns null for an unknown row', () => {
      const entries = [mkEntry(5, '2026-01-01')]
      expect(computeDateReorder(entries, 99)).toBeNull()
    })

    // Reproduces the real bug: a new entry always gets appended at the last row regardless of
    // its own date, so a backdated entry lands after a round that already closed later.
    it('moves a backdated entry earlier, past later-dated rows', () => {
      const entries = [
        mkEntry(5, '2026-08-19'),
        mkEntry(6, '2026-08-21'),
        mkEntry(7, '2026-08-21'),
        mkEntry(8, '2026-08-20'), // just appended, but dated before rows 6-7
      ]
      const plan = computeDateReorder(entries, 8)
      expect(plan).not.toBeNull()
      expect(plan?.fromRow).toBe(6)
      expect(plan?.toRow).toBe(8)
      expect(plan?.entries.map(e => e.row)).toEqual([8, 6, 7]) // moved entry now goes first
      expect(plan?.entries.map(e => e.date)).toEqual(['2026-08-20', '2026-08-21', '2026-08-21'])
    })

    // Reproduces the follow-up: editing an entry's date to something LATER than its neighbors
    // must move it forward, not just backdated entries moving backward.
    it('moves a re-dated entry later, past earlier-dated rows', () => {
      const entries = [
        mkEntry(5, '2026-08-19'),
        mkEntry(6, '2026-08-22'), // edited to a later date than rows 7-8
        mkEntry(7, '2026-08-21'),
        mkEntry(8, '2026-08-21'),
      ]
      const plan = computeDateReorder(entries, 6)
      expect(plan).not.toBeNull()
      expect(plan?.fromRow).toBe(6)
      expect(plan?.toRow).toBe(8)
      expect(plan?.entries.map(e => e.row)).toEqual([7, 8, 6]) // moved entry now goes last
    })

    it('places a same-date entry after existing entries with that date, not before', () => {
      const entries = [
        mkEntry(5, '2026-08-20'),
        mkEntry(6, '2026-08-20'),
        mkEntry(7, '2026-08-22'),
        mkEntry(8, '2026-08-20'), // edited to match rows 5-6's date - should land after them
      ]
      const plan = computeDateReorder(entries, 8)
      expect(plan).not.toBeNull()
      // Row 8 (date 20/08) ties with row 6 (also 20/08) but not row 5 - row 5's date is still
      // equal too, so nothing needs to move past it; only rows 7 and 8 actually change slots.
      expect(plan?.fromRow).toBe(7)
      expect(plan?.toRow).toBe(8)
      expect(plan?.entries.map(e => e.row)).toEqual([8, 7])
    })
  })

  describe('parseWithdrawals', () => {
    it('reads both people from their separate column blocks', () => {
      const withdrawals = parseWithdrawals(buildLiveGrid())
      expect(withdrawals).toEqual([
        { who: 'น้าปุ้ม', date: '2025-01-05', bank: 1000, cash: 50, note: 'note-a' },
        { who: 'ปัญญา', date: '2025-01-06', bank: 200, cash: 0, note: 'note-b' },
      ])
    })
  })

  describe('parseWages', () => {
    it('reads the wage table independently of how long the entries table is', () => {
      expect(parseWages(buildLiveGrid())).toEqual([
        { date: '2025-01-01', amount: 100 },
        { date: '2025-01-02', amount: 150 },
      ])
    })

    it('stops at the first blank amount even though the date column is pre-filled ahead of it', () => {
      // Row7's wage date (2025-01-03) is filled in - a calendar pre-filled a day ahead of actual
      // data - but its amount is blank, so it must not be read as a real (blank->0) wage entry.
      const grid = buildLiveGrid()
      expect(grid[6][24]).toBe(D['2025-01-03'])
      expect(grid[6][25]).toBe('')
      expect(parseWages(grid)).toHaveLength(2)
    })
  })

  describe('parseLiveSheet', () => {
    it('combines all four parsers into one result', () => {
      const result = parseLiveSheet(buildLiveGrid())
      expect(result.entries).toHaveLength(5)
      expect(result.rounds).toHaveLength(2)
      expect(result.withdrawals).toHaveLength(2)
      expect(result.wages).toHaveLength(2)
      expect(result.lastRoundRow).toBe(9)
    })
  })

  describe('isoDateToExcelSerial', () => {
    it('round-trips through the same serial numbers real entries were read with', () => {
      for (const [iso, serial] of Object.entries(D)) {
        expect(isoDateToExcelSerial(iso)).toBe(serial)
      }
    })
  })

  describe('parseArchiveOpeningStats', () => {
    it('reads the carried-forward profit and per-person withdrawn totals from an archive tab', () => {
      const archiveGrid: Cell[][] = [
        [],
        row({ 6: 'ทั้งหมด', 9: 'ถอนไปแล้ว' }),
        row({ 6: 12345, 9: 'น้าปุ้ม', 10: 'ปัญญา' }),
        row({ 9: 500, 10: 700 }),
      ]
      expect(parseArchiveOpeningStats(archiveGrid)).toEqual({
        priorProfit: 12345,
        priorWithdraw: { น้าปุ้ม: 500, ปัญญา: 700 },
      })
    })

    it('returns undefined fields when the expected labels are not found', () => {
      expect(parseArchiveOpeningStats([[], []])).toEqual({
        priorProfit: undefined,
        priorWithdraw: undefined,
      })
    })

    it('does not pick up the same person-name labels reused a few columns later for a different stat', () => {
      // Real archive tabs repeat "น้าปุ้ม"/"ปัญญา" as headers for "จำนวนเงินที่ถอนได้" right next
      // to "ถอนไปแล้ว" - only the first (immediately adjacent) pair belongs to "ถอนไปแล้ว".
      const archiveGrid: Cell[][] = [
        row({ 9: 'ถอนไปแล้ว', 11: 'จำนวนเงินที่ถอนได้' }),
        row({ 9: 'น้าปุ้ม', 10: 'ปัญญา', 11: 'น้าปุ้ม', 12: 'ปัญญา' }),
        row({ 9: 10976, 10: 14791, 11: 17524.5, 12: 13709.5 }),
      ]
      expect(parseArchiveOpeningStats(archiveGrid).priorWithdraw).toEqual({
        น้าปุ้ม: 10976,
        ปัญญา: 14791,
      })
    })
  })

  describe('parseLiveOpeningStats', () => {
    it('reads cash/bank/start-date from the live sheet dashboard labels', () => {
      // Real layout: label and value sit in the same row, value one column to the right. The
      // cash/bank labels have a literal line break in the cell.
      const liveGrid: Cell[][] = [
        row({ 9: 'วันที่เริ่ม', 10: D['2025-01-01'] }),
        row({ 9: 'เงินในบัญชี\nยกยอดมา', 10: 20091.76 }),
        row({ 9: 'เงินสด\nยกยอดมา', 10: 10300 }),
      ]
      expect(parseLiveOpeningStats(liveGrid)).toEqual({
        cash: 10300,
        bank: 20091.76,
        startDate: '2025-01-01',
      })
    })

    it('returns undefined fields when the expected labels are not found', () => {
      expect(parseLiveOpeningStats([[], []])).toEqual({
        cash: undefined,
        bank: undefined,
        startDate: undefined,
      })
    })
  })
})
