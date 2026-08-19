import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import appConfig from '../../config/app-config'
import { AddLedgerEntryDto } from './dto/add-ledger-entry.dto'
import { AddLedgerWageDto } from './dto/add-ledger-wage.dto'
import { getSheetsClient, isGoogleSheetsConfigured } from './google-sheets-client'
import {
  Grid,
  isoDateToExcelSerial,
  parseArchiveOpeningStats,
  parseLiveSheet,
} from './ledger-sheet-parser'
import { LEDGER_DATA } from './paojiao-ledger-data'
import { LedgerData, LedgerPerson } from './paojiao-ledger.interface'

// Confirmed with the user 2026-08-19: only this tab is live data. "สำเนาของ ชีต1" is a manual
// backup copy that has already drifted from it and must not be read.
const LIVE_SHEET_NAME = 'ชีต1'
const LIVE_SHEET_RANGE = `${LIVE_SHEET_NAME}!A1:Z1010`
const ARCHIVE_TAB_EXCLUDE = new Set([LIVE_SHEET_NAME, 'สำเนาของ ชีต1'])

// No reliable signal for these was found in the one archive tab seen so far (see project memory
// / the Phase B handoff notes) - update by hand whenever the user starts a new archive tab.
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

  async addEntry(dto: AddLedgerEntryDto): Promise<void> {
    this.assertGoogleSheetsConfigured()
    const sheets = getSheetsClient()
    await sheets.spreadsheets.values.append({
      spreadsheetId: appConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: `${LIVE_SHEET_NAME}!A:G`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
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
    await sheets.spreadsheets.values.append({
      spreadsheetId: appConfig.GOOGLE_SHEETS_SPREADSHEET_ID,
      range: `${LIVE_SHEET_NAME}!Y:Z`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[isoDateToExcelSerial(dto.date), dto.amount]] },
    })
  }

  private async readFromSheets(): Promise<LedgerData> {
    const sheets = getSheetsClient()
    const spreadsheetId = appConfig.GOOGLE_SHEETS_SPREADSHEET_ID

    const [liveResult, meta] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: LIVE_SHEET_RANGE,
        valueRenderOption: 'UNFORMATTED_VALUE',
      }),
      sheets.spreadsheets.get({ spreadsheetId }),
    ])

    const liveGrid = (liveResult.data.values ?? []) as Grid
    const { entries, rounds, withdrawals, wages, lastRoundRow } = parseLiveSheet(liveGrid)

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

    return {
      opening: { cash: MANUAL_OPENING.cash, bank: MANUAL_OPENING.bank, priorProfit, priorWithdraw },
      startDate: MANUAL_OPENING.startDate,
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
