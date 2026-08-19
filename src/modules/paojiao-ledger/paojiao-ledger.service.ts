import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import appConfig from '../../config/app-config'
import { AddLedgerEntryDto } from './dto/add-ledger-entry.dto'
import { AddLedgerWageDto } from './dto/add-ledger-wage.dto'
import { getSheetsClient, isGoogleSheetsConfigured } from './google-sheets-client'
import {
  Grid,
  isoDateToExcelSerial,
  parseArchiveOpeningStats,
  parseEntries,
  parseLiveOpeningStats,
  parseLiveSheet,
  parseWages,
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

@Injectable()
export class PaojiaoLedgerService {
  private readonly logger = new Logger(PaojiaoLedgerService.name)

  async getLedger(): Promise<LedgerData> {
    if (!isGoogleSheetsConfigured()) {
      return LEDGER_DATA
    }
    try {
      return await this.readFromSheets()
    } catch (error) {
      this.logger.error(
        'Failed to read paojiao-ledger from Google Sheets, falling back to static data',
        error
      )
      return LEDGER_DATA
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
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${LIVE_SHEET_NAME}'!A${nextRow}:G${nextRow}`,
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          [
            isoDateToExcelSerial(dto.date),
            dto.item,
            dto.inCash || '',
            dto.inBank || '',
            dto.outCash || '',
            dto.outBank || '',
            dto.note || '',
          ],
        ],
      },
    })
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
}
