import { auth, sheets, sheets_v4 } from '@googleapis/sheets'
import appConfig from '../../config/app-config'

let cachedClient: sheets_v4.Sheets | null = null

export function isGoogleSheetsConfigured(): boolean {
  return Boolean(
    appConfig.GOOGLE_SHEETS_SPREADSHEET_ID &&
      appConfig.GOOGLE_SHEETS_CLIENT_EMAIL &&
      appConfig.GOOGLE_SHEETS_PRIVATE_KEY
  )
}

export function getSheetsClient(): sheets_v4.Sheets {
  if (cachedClient) return cachedClient
  const jwt = new auth.JWT({
    email: appConfig.GOOGLE_SHEETS_CLIENT_EMAIL,
    // .env can't hold real newlines - the key is stored with literal "\n" and unescaped here.
    key: appConfig.GOOGLE_SHEETS_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  cachedClient = sheets({ version: 'v4', auth: jwt })
  return cachedClient
}
