import { HeadBucketCommand } from '@aws-sdk/client-s3'
import { Injectable, Logger } from '@nestjs/common'
import { HealthCheckService, HealthIndicatorResult, TypeOrmHealthIndicator } from '@nestjs/terminus'
import appConfig from '../../config/app-config'
import { s3Client } from '../../utils/s3-client'
import { getSheetsClient, isGoogleSheetsConfigured } from '../paojiao-ledger/google-sheets-client'

const THIRD_PARTY_TIMEOUT_MS = 3000

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name)

  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator
  ) {}

  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => ({ app: { status: 'up' as const, version: appConfig.APP_VERSION } }),
      () =>
        this.reachable('s3', signal =>
          s3Client.send(new HeadBucketCommand({ Bucket: appConfig.AWS_BUCKET_NAME }), {
            abortSignal: signal,
          })
        ),
      () =>
        this.reachable('googleSheets', async signal => {
          if (!isGoogleSheetsConfigured()) throw new Error('not configured')
          await getSheetsClient().spreadsheets.get(
            { spreadsheetId: appConfig.GOOGLE_SHEETS_SPREADSHEET_ID, fields: 'spreadsheetId' },
            { signal }
          )
        }),
    ])
  }

  // Third-party outages are reported but never fail the check: /health is the Cloud Run startup probe.
  private async reachable(
    key: string,
    probe: (signal: AbortSignal) => Promise<unknown>
  ): Promise<HealthIndicatorResult> {
    try {
      await probe(AbortSignal.timeout(THIRD_PARTY_TIMEOUT_MS))
      return { [key]: { status: 'up', reachable: true } }
    } catch (error) {
      this.logger.warn(`${key} unreachable: ${(error as Error).message}`)
      return { [key]: { status: 'up', reachable: false } }
    }
  }
}
