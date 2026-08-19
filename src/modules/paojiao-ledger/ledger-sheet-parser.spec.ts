import {
  isoDateToExcelSerial,
  parseArchiveOpeningStats,
  parseEntries,
  parseLiveSheet,
  parseRounds,
  parseWages,
  parseWithdrawals,
} from './ledger-sheet-parser'

type Cell = string | number | undefined
type SparseRow = Record<number, Cell>

// Excel date serials (days since 1899-12-30) for the fixture dates below.
const D = {
  '2025-01-01': 45658,
  '2025-01-02': 45659,
  '2025-01-03': 45660,
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
//  - the item column repeating ("ขายของ" on both row6 and row7) does NOT mean both close a round
//    - only the row with a value in column I does (row7, not row6)
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
    row({ 1: 'ขายของ', 3: 500, 24: D['2025-01-02'], 25: 150 }), // row6 - same day as row5 (A blank), does NOT close a round
    row({ 0: D['2025-01-02'], 1: 'ขายของ', 3: 300, 8: 900, 24: D['2025-01-03'] }), // row7 - closes round 1 (100+500+300=900); wage amount left blank (not yet entered)
    row({ 0: D['2025-01-03'], 1: 'ค่าใช้จ่าย', 5: 200 }), // row8
    row({ 1: 'ขายของ', 3: 1000, 8: 800 }), // row9 - same day as row8 (A blank), closes round 2 (1000-200=800)
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
        item: 'ขายของ',
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
    it('only closes a round on the row with a value in column I, even when the item repeats without one', () => {
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
})
