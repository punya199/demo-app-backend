// Runs against a real Postgres (the docker-compose one) via `yarn test:integration`.
import { INestApplication } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Server } from 'http'
import request from 'supertest'
import appConfig from '../../config/app-config'
import dataSource from '../../config/database.config'
import { createTestingApp } from '../../testing/create-testing-app'
import { HealthModule } from './health.module'

describe('GET /api/v1/health', () => {
  let app: INestApplication<Server>

  beforeAll(async () => {
    app = await createTestingApp({
      imports: [TypeOrmModule.forRoot(dataSource.options), HealthModule],
    })
  })

  afterAll(() => app.close())

  it('reports the database as up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200)
    expect(res.body).toMatchObject({ status: 'ok', info: { database: { status: 'up' } } })
  })

  it('reports the running app version', async () => {
    appConfig.APP_VERSION = '9.9.9-test'
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200)
    expect(res.body).toMatchObject({ info: { app: { status: 'up', version: '9.9.9-test' } } })
  })

  it('reports an unreachable third party without failing the check', async () => {
    const original = { ...appConfig }
    appConfig.AWS_BUCKET_NAME = `health-it-missing-${randomUUID()}`
    appConfig.GOOGLE_SHEETS_SPREADSHEET_ID = ''
    try {
      const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200)
      expect(res.body).toMatchObject({
        status: 'ok',
        info: {
          s3: { status: 'up', reachable: false },
          googleSheets: { status: 'up', reachable: false },
        },
      })
    } finally {
      Object.assign(appConfig, original)
    }
  })
})
