import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import appConfig from '../../config/app-config'
import { LedgerItemEntity } from '../../db/entities/ledger-item.entity'
import { AddLedgerEntryDto } from './dto/add-ledger-entry.dto'
import { AddLedgerItemDto } from './dto/add-ledger-item.dto'
import { AddLedgerWageDto } from './dto/add-ledger-wage.dto'
import { AddLedgerWithdrawalDto } from './dto/add-ledger-withdrawal.dto'
import { EditLedgerEntryDto } from './dto/edit-ledger-entry.dto'
import { EditLedgerItemDto } from './dto/edit-ledger-item.dto'
import { getSheetsClient, isGoogleSheetsConfigured } from './google-sheets-client'
import {
  computeDateReorder,
  deriveRounds,
  Grid,
  isoDateToExcelSerial,
  parseArchiveOpeningStats,
  parseEntries,
  parseLiveOpeningStats,
  parseLiveSheet,
  parseRounds,
  parseWages,
  parseWithdrawals,
  TABLE_START_ROW,
} from './ledger-sheet-parser'
import { LEDGER_DATA } from './paojiao-ledger-data'
import { LedgerData, LedgerPerson } from './paojiao-ledger.interface'

// Confirmed with the user 2026-08-19: only this tab is live data. "สำเนาของ ชีต1" is a manual
// backup copy that has already drifted from it and must not be read.
const LIVE_SHEET_NAME = 'ชีต1'
// Sheet names with non-ASCII characters must be single-quoted inside an A1 range, or the Sheets
// API rejects the whole range with "Unable to parse range" (learned the hard way against the
// user's real spreadsheet - this is not optional here since every tab name is Thai).
const LIVE_SHEET_RANGE = `'${LIVE_SHEET_NAME}'!A1:Z1010`
const ARCHIVE_TAB_EXCLUDE = new Set([LIVE_SHEET_NAME, 'สำเนาของ ชีต1'])

// Fallback only - the live sheet's own dashboard area normally provides these (see
// parseLiveOpeningStats). Used if those labelled cells are ever missing/renamed.
const MANUAL_OPENING = {
  cash: 10300,
  bank: 20091.76,
  startDate: '2026-06-10',
}

// These three item names are matched literally elsewhere in the calculation logic - "ขาย น้ำมัน"
// by deriveRounds (backend) and computeOilSalesPerRound (frontend) to detect round closes, "ขาย
// กาก" by computeDraffSales (frontend), and "ค่าแรงยายปิ่น" by computeWageTotals (frontend) and the
// vendor-spend exclusion list. Renaming or deleting any of them would silently break those
// calculations for every past and future entry, so both are blocked at the API level (not just
// hidden in the UI).
const PROTECTED_ITEM_NAMES = new Set(['ขาย น้ำมัน', 'ขาย กาก', 'ค่าแรงยายปิ่น'])

// Shared by add/edit/delete - matches both AddLedgerEntryDto/EditLedgerEntryDto and LedgerEntry
// (the latter's numbers are always present, which still satisfies this optional-number shape).
function entryRowValues(entry: {
  date: string
  item: string
  inCash?: number
  inBank?: number
  outCash?: number
  outBank?: number
  note?: string
}): (string | number)[] {
  return [
    isoDateToExcelSerial(entry.date),
    entry.item,
    entry.inCash || '',
    entry.inBank || '',
    entry.outCash || '',
    entry.outBank || '',
    entry.note || '',
  ]
}

@Injectable()
export class PaojiaoLedgerService {
  private readonly logger = new Logger(PaojiaoLedgerService.name)

  constructor(
    @InjectRepository(LedgerItemEntity)
    private readonly ledgerItemRepo: Repository<LedgerItemEntity>
  ) {}

  async getLedger(): Promise<LedgerData> {
    const items = await this.getItemNames()
    if (!isGoogleSheetsConfigured()) {
      return { ...LEDGER_DATA, items }
    }
    try {
      const data = await this.readFromSheets()
      return { ...data, items }
    } catch (error) {
      this.logger.error(
        'Failed to read paojiao-ledger from Google Sheets, falling back to static data',
        error
      )
      return { ...LEDGER_DATA, items }
    }
  }

  // Category names for the add-entry dropdown - DB-backed (shared across both users), not the
  // sheet or the old hardcoded list. Sorted with Thai-locale collation here in application code,
  // not an SQL ORDER BY, since Postgres's default collation doesn't sort Thai the way a Thai
  // reader expects (consonant/vowel reordering that plain byte/codepoint order gets wrong).
  private async getItemNames(): Promise<string[]> {
    const rows = await this.ledgerItemRepo.find()
    if (rows.length === 0) return LEDGER_DATA.items
    return rows.map(r => r.name).sort((a, b) => a.localeCompare(b, 'th'))
  }

  // `protected` tells the editor UI which rows to disable rename/delete on - renameItem and
  // deleteItem below are the actual enforcement, this is just so the UI doesn't offer a button
  // that will only 400.
  async listItems(): Promise<{ id: string; name: string; protected: boolean }[]> {
    const rows = await this.ledgerItemRepo.find()
    return rows
      .map(r => ({ id: r.id, name: r.name, protected: PROTECTED_ITEM_NAMES.has(r.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'))
  }

  async addItem(dto: AddLedgerItemDto): Promise<{ id: string; name: string }> {
    const name = dto.name.trim()
    try {
      const saved = await this.ledgerItemRepo.save(this.ledgerItemRepo.create({ name }))
      return { id: saved.id, name: saved.name }
    } catch (error) {
      this.throwIfDuplicateName(error, name)
      throw error
    }
  }

  // Also retroactively relabels every past entry in the live sheet that used the old name (see
  // syncItemRename) - the point of renaming a category is that old entries should read the new
  // name too, not just future ones.
  async renameItem(id: string, dto: EditLedgerItemDto): Promise<{ id: string; name: string }> {
    const existing = await this.ledgerItemRepo.findOneBy({ id })
    if (!existing) {
      throw new NotFoundException(`No item found with id ${id}`)
    }
    const oldName = existing.name
    const name = dto.name.trim()
    if (PROTECTED_ITEM_NAMES.has(oldName)) {
      throw new BadRequestException(
        `ไม่สามารถแก้ไข "${oldName}" ได้ - ระบบใช้ชื่อนี้อ้างอิงการคำนวณโดยตรง (ปิดรอบขายน้ำมัน/ยอดขายกาก/ค่าแรง)`
      )
    }
    try {
      await this.ledgerItemRepo.update({ id }, { name })
    } catch (error) {
      this.throwIfDuplicateName(error, name)
      throw error
    }
    if (name !== oldName) {
      await this.syncItemRename(oldName, name)
    }
    return { id, name }
  }

  async deleteItem(id: string): Promise<void> {
    const existing = await this.ledgerItemRepo.findOneBy({ id })
    if (!existing) {
      throw new NotFoundException(`No item found with id ${id}`)
    }
    if (PROTECTED_ITEM_NAMES.has(existing.name)) {
      throw new BadRequestException(
        `ไม่สามารถลบ "${existing.name}" ได้ - ระบบใช้ชื่อนี้อ้างอิงการคำนวณโดยตรง (ปิดรอบขายน้ำมัน/ยอดขายกาก/ค่าแรง)`
      )
    }
    await this.ledgerItemRepo.softDelete({ id })
  }

  // The partial unique index on (name) where not deleted is what actually prevents duplicates -
  // this just turns Postgres's generic unique-violation (23505) into a message the UI can show.
  // Throws and returns nothing when it IS a duplicate; otherwise returns so the caller re-throws
  // the original error unchanged.
  private throwIfDuplicateName(error: unknown, name: string): void {
    if (error instanceof Object && 'code' in error && error.code === '23505') {
      throw new ConflictException(`มีรายการชื่อ "${name}" อยู่แล้ว`)
    }
  }

  // Writes go to an exact, precomputed row via values.update - NOT values.append with
  // insertDataOption: INSERT_ROWS. This sheet has four different logical tables (entries A-G,
  // withdrawals M-T, wages Y-Z, plus the round-marker column I) packed into the same row-number
  // space at different lengths. INSERT_ROWS performs a real row insert - it shifts *every*
  // column of that row and below, not just the table being appended to - so appending to the
  // short wage table would insert a blank row in the middle of the much longer entries table,
  // desyncing every round/withdrawal/entry below it. Verified this the hard way against a test
  // copy of the real spreadsheet before it was caught. A targeted update to one exact row/column
  // range cannot shift anything else.
  async addEntry(dto: AddLedgerEntryDto): Promise<void> {
    this.assertGoogleSheetsConfigured()
    const sheets = getSheetsClient()
    const spreadsheetId = appConfig.GOOGLE_SHEETS_SPREADSHEET_ID
    const entries = parseEntries(await this.fetchLiveGrid(sheets, spreadsheetId))
    const nextRow = entries.length ? entries[entries.length - 1].row + 1 : TABLE_START_ROW
    this.logSheetWrite('addEntry', { row: nextRow, before: null, after: entryRowValues(dto) })
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${LIVE_SHEET_NAME}'!A${nextRow}:G${nextRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [entryRowValues(dto)] },
    })
    // A brand-new entry is always appended after the last row, so it's already in date order
    // unless its date is earlier than something above it (a backdated entry) - repositionByDate
    // handles that case the same way it handles an edited date.
    await this.repositionByDate(sheets, spreadsheetId, nextRow)
    await this.syncRoundColumn(sheets, spreadsheetId)
  }

  // In-place update of one row's values - the row number doesn't change, so this is always safe,
  // including for entries already inside a closed round: round profit is derived fresh from
  // entries on every read (see deriveRounds in ledger-sheet-parser.ts), so an edited amount is
  // picked up automatically without touching anything else.
  async editEntry(row: number, dto: EditLedgerEntryDto): Promise<void> {
    this.assertGoogleSheetsConfigured()
    const sheets = getSheetsClient()
    const spreadsheetId = appConfig.GOOGLE_SHEETS_SPREADSHEET_ID
    // Read the row's current value right before overwriting it, purely so the log below can show
    // what was actually replaced - if a mystery change ever turns up later (e.g. a date that
    // nobody remembers editing), this before/after trail is what makes it possible to tell
    // whether it was this call's own doing or something else entirely.
    const before = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${LIVE_SHEET_NAME}'!A${row}:G${row}`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    })
    this.logSheetWrite('editEntry', {
      row,
      before: before.data.values?.[0] ?? null,
      after: entryRowValues(dto),
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${LIVE_SHEET_NAME}'!A${row}:G${row}`,
      valueInputOption: 'RAW',
      requestBody: { values: [entryRowValues(dto)] },
    })
    // Rounds are computed from row position, not date (see the design handoff spec), so a date
    // edit that leaves the row out of date order would otherwise silently misattribute this
    // entry's amount to whichever round happens to occupy its old row position. Reposition first
    // so syncRoundColumn below sees the entries in their final physical order.
    await this.repositionByDate(sheets, spreadsheetId, row)
    // Covers the user's other request directly: if this row's item changed away from an oil
    // sale, it's no longer a round-closing row, so syncRoundColumn below clears column I here.
    await this.syncRoundColumn(sheets, spreadsheetId)
  }

  // Moves one row to keep column A sorted by date, shifting only the minimal contiguous window
  // of rows between its old and new position (see computeDateReorder) - never a full-table
  // rewrite. Same-date entries keep their relative order (ties resolved after existing rows with
  // that date), matching how a normal append would have placed them.
  private async repositionByDate(
    sheets: ReturnType<typeof getSheetsClient>,
    spreadsheetId: string,
    movedRow: number
  ): Promise<void> {
    const entries = parseEntries(await this.fetchLiveGrid(sheets, spreadsheetId))
    const plan = computeDateReorder(entries, movedRow)
    if (!plan) return

    const before = entries.filter(e => e.row >= plan.fromRow && e.row <= plan.toRow)
    this.logSheetWrite('repositionByDate', {
      movedRow,
      range: `${plan.fromRow}:${plan.toRow}`,
      before: before.map(entryRowValues),
      after: plan.entries.map(entryRowValues),
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${LIVE_SHEET_NAME}'!A${plan.fromRow}:G${plan.toRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: plan.entries.map(entryRowValues) },
    })
  }

  // Unlike edit, deleting changes the entries table's length, which means every entry after the
  // deleted one has to move up one row. Rows already inside a closed round are historical
  // settlements the user has already acted on (profit taken, shares split) - shifting them is a
  // correctness risk even though round profit is derived fresh each read, so only entries after
  // the last closed round (row > lastRoundRow) can be deleted safely.
  async deleteEntry(row: number): Promise<void> {
    this.assertGoogleSheetsConfigured()
    const sheets = getSheetsClient()
    const spreadsheetId = appConfig.GOOGLE_SHEETS_SPREADSHEET_ID
    const grid = await this.fetchLiveGrid(sheets, spreadsheetId)
    const entries = parseEntries(grid)
    const { lastRoundRow } = parseRounds(grid)

    const target = entries.find(e => e.row === row)
    if (!target) {
      throw new NotFoundException(`No entry found at row ${row}`)
    }
    if (row <= lastRoundRow) {
      throw new BadRequestException(
        `Row ${row} is inside an already-closed round (rows up to ${lastRoundRow}) - deleting it would desync that round's profit total. Only entries after the last closed round can be deleted.`
      )
    }

    const lastRow = entries[entries.length - 1].row
    const following = entries.filter(e => e.row > row)
    const values = [...following.map(entryRowValues), ['', '', '', '', '', '', '']]
    this.logSheetWrite('deleteEntry', {
      row,
      range: `${row}:${lastRow}`,
      before: entries.filter(e => e.row >= row).map(entryRowValues),
      after: values,
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${LIVE_SHEET_NAME}'!A${row}:G${lastRow}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    })
    await this.syncRoundColumn(sheets, spreadsheetId)
  }

  async addWage(dto: AddLedgerWageDto): Promise<void> {
    this.assertGoogleSheetsConfigured()
    const sheets = getSheetsClient()
    const spreadsheetId = appConfig.GOOGLE_SHEETS_SPREADSHEET_ID
    const wages = parseWages(await this.fetchLiveGrid(sheets, spreadsheetId))
    const nextRow = TABLE_START_ROW + wages.length
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${LIVE_SHEET_NAME}'!Y${nextRow}:Z${nextRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[isoDateToExcelSerial(dto.date), dto.amount]] },
    })
  }

  // Each person's withdrawal history lives in its own column block (M-P for น้าปุ้ม, Q-T for
  // ปัญญา) at the same row numbers as everything else on the sheet - same append-to-the-first-
  // blank-row approach as addWage, just scoped to whichever person's block this withdrawal is for.
  async addWithdrawal(dto: AddLedgerWithdrawalDto): Promise<void> {
    this.assertGoogleSheetsConfigured()
    const sheets = getSheetsClient()
    const spreadsheetId = appConfig.GOOGLE_SHEETS_SPREADSHEET_ID
    const withdrawals = parseWithdrawals(await this.fetchLiveGrid(sheets, spreadsheetId))
    const forPerson = withdrawals.filter(w => w.who === dto.who)
    const nextRow = TABLE_START_ROW + forPerson.length
    const columns = dto.who === 'น้าปุ้ม' ? 'M:P' : 'Q:T'
    const [fromCol, toCol] = columns.split(':')
    const values = [
      [isoDateToExcelSerial(dto.date), dto.bank || '', dto.cash || '', dto.note || ''],
    ]
    this.logSheetWrite('addWithdrawal', {
      who: dto.who,
      row: nextRow,
      before: null,
      after: values[0],
    })
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${LIVE_SHEET_NAME}'!${fromCol}${nextRow}:${toCol}${nextRow}`,
      valueInputOption: 'RAW',
      requestBody: { values },
    })
  }

  // Relabels every past entry in the live sheet whose item text matches oldName, so a category
  // rename covers history too, not just what's picked from the dropdown going forward. Skipped
  // silently when Sheets isn't configured (the DB rename above still succeeds on its own) - only
  // writes column B (item) on the exact rows that match, never touching anything else.
  private async syncItemRename(oldName: string, newName: string): Promise<void> {
    if (!isGoogleSheetsConfigured()) return
    const sheets = getSheetsClient()
    const spreadsheetId = appConfig.GOOGLE_SHEETS_SPREADSHEET_ID
    const entries = parseEntries(await this.fetchLiveGrid(sheets, spreadsheetId))
    const matches = entries.filter(e => e.item === oldName)
    if (matches.length === 0) return

    this.logSheetWrite('syncItemRename', {
      rows: matches.map(e => e.row),
      before: oldName,
      after: newName,
    })
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: matches.map(e => ({
          range: `'${LIVE_SHEET_NAME}'!B${e.row}`,
          values: [[newName]],
        })),
      },
    })
  }

  // Keeps the live sheet's column I in sync with round-closing as derived from item text (see
  // deriveRounds) - so opening the spreadsheet directly still shows a summary number on every
  // round-closing row, same as when this was maintained by hand. Re-fetches fresh state rather
  // than reasoning about the write that just happened, so it's correct regardless of which write
  // path called it. Only touches cells whose value actually needs to change: writes a plain
  // number where a round now closes, and blanks any row that used to hold one but no longer
  // closes anything (e.g. its item was edited away from an oil sale).
  private async syncRoundColumn(
    sheets: ReturnType<typeof getSheetsClient>,
    spreadsheetId: string
  ): Promise<void> {
    const grid = await this.fetchLiveGrid(sheets, spreadsheetId)
    const entries = parseEntries(grid)
    const { rounds } = deriveRounds(entries)
    const profitByRow = new Map(rounds.map(r => [r.toRow, r.profit]))
    const lastRow = entries.length ? entries[entries.length - 1].row : TABLE_START_ROW - 1

    const data: { range: string; values: (string | number)[][] }[] = []
    const changes: { row: number; before: unknown; after: unknown }[] = []
    for (let row = TABLE_START_ROW; row <= lastRow; row++) {
      const cell = grid[row - 1]?.[8] // column I, 0-indexed 8
      const current = cell === undefined || cell === null || cell === '' ? undefined : Number(cell)
      const want = profitByRow.get(row)

      if (want !== undefined) {
        if (current === undefined || Number.isNaN(current) || Math.abs(current - want) > 0.005) {
          data.push({ range: `'${LIVE_SHEET_NAME}'!I${row}`, values: [[want]] })
          changes.push({ row, before: cell ?? null, after: want })
        }
      } else if (current !== undefined) {
        data.push({ range: `'${LIVE_SHEET_NAME}'!I${row}`, values: [['']] })
        changes.push({ row, before: cell ?? null, after: null })
      }
    }
    if (data.length === 0) return

    this.logSheetWrite('syncRoundColumn', { changes })
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'RAW', data },
    })
  }

  private async fetchLiveGrid(
    sheets: ReturnType<typeof getSheetsClient>,
    spreadsheetId: string
  ): Promise<Grid> {
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: LIVE_SHEET_RANGE,
      valueRenderOption: 'UNFORMATTED_VALUE',
    })
    return (result.data.values ?? []) as Grid
  }

  private async readFromSheets(): Promise<LedgerData> {
    const sheets = getSheetsClient()
    const spreadsheetId = appConfig.GOOGLE_SHEETS_SPREADSHEET_ID

    const [liveGrid, meta] = await Promise.all([
      this.fetchLiveGrid(sheets, spreadsheetId),
      sheets.spreadsheets.get({ spreadsheetId }),
    ])

    const { entries, rounds, withdrawals, wages, lastRoundRow } = parseLiveSheet(liveGrid)
    const liveOpening = parseLiveOpeningStats(liveGrid)

    const archiveTabName = (meta.data.sheets ?? [])
      .map(s => s.properties?.title)
      .filter((title): title is string => {
        if (!title) return false
        return !ARCHIVE_TAB_EXCLUDE.has(title)
      })
      .pop()

    let priorProfit = 0
    let priorWithdraw: Record<LedgerPerson, number> = { น้าปุ้ม: 0, ปัญญา: 0 }
    if (archiveTabName) {
      const archiveResult = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${archiveTabName}'!A1:Z1010`,
        valueRenderOption: 'UNFORMATTED_VALUE',
      })
      const stats = parseArchiveOpeningStats((archiveResult.data.values ?? []) as Grid)
      if (stats.priorProfit !== undefined) priorProfit = stats.priorProfit
      if (stats.priorWithdraw !== undefined) {
        priorWithdraw = stats.priorWithdraw
      } else {
        this.logger.warn(
          `Could not find withdrawal totals in archive tab "${archiveTabName}" - defaulting to 0`
        )
      }
    }

    if (
      liveOpening.cash === undefined ||
      liveOpening.bank === undefined ||
      liveOpening.startDate === undefined
    ) {
      this.logger.warn(
        'Could not find opening cash/bank/start-date labels on the live sheet - falling back to the hardcoded MANUAL_OPENING value(s)'
      )
    }

    return {
      opening: {
        cash: liveOpening.cash ?? MANUAL_OPENING.cash,
        bank: liveOpening.bank ?? MANUAL_OPENING.bank,
        priorProfit,
        priorWithdraw,
      },
      startDate: liveOpening.startDate ?? MANUAL_OPENING.startDate,
      lastRoundRow,
      entries,
      rounds,
      withdrawals,
      wages,
      items: LEDGER_DATA.items, // fixed category list for the add-entry dropdown, not sheet-derived
    }
  }

  private assertGoogleSheetsConfigured(): void {
    if (!isGoogleSheetsConfigured()) {
      throw new ServiceUnavailableException(
        'Google Sheets is not configured yet - adding entries/wages needs GOOGLE_SHEETS_* env vars set'
      )
    }
  }

  // No locking or staleness check guards the sheet writes above (read-fresh -> compute -> write,
  // with no version check in between) - fine for how this app is actually used (normally one
  // person at a time), but it does mean two edits landing close enough together could still have
  // one silently overwrite the other with stale data. This is the audit trail for that case: if a
  // value ever turns up changed with nobody able to account for why, these before/after log lines
  // are what let it be traced back to which write did it, rather than staying a mystery.
  private logSheetWrite(op: string, details: Record<string, unknown>): void {
    this.logger.log(`[sheet-write] ${op} ${JSON.stringify(details)}`)
  }
}
