// Runs against the throwaway Postgres via `yarn test:integration` (see monster/int-test-helpers.ts).
import { INestApplication } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Server } from 'http'
import request from 'supertest'
import dataSource from '../../config/database.config'
import { AddTdSchema1794600000000 } from '../../db/migrations/1794600000000-add-td-schema'
import { AddTdGacha1794700000000 } from '../../db/migrations/1794700000000-add-td-gacha'
import { createTestingApp } from '../../testing/create-testing-app'
import { JwtAccessTokenAuthGuard } from '../authentication/guard/jwt-access-token-auth.guard'
import {
  assertSafeTestDatabase,
  createUser,
  sql,
  startTestDatabase,
  stopTestDatabase,
} from '../monster/int-test-helpers'
import { TdProfileService } from './td-profile.service'
import { TdModule } from './td.module'

jest.setTimeout(120_000)

const T0 = new Date('2026-01-01T00:00:00Z')
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000)

describe('td schema and profile', () => {
  const service = new TdProfileService(dataSource)

  beforeAll(startTestDatabase)
  afterAll(stopTestDatabase)

  // Put a player's stored energy at `energy` as of T0.
  const setEnergy = (userId: string, energy: number) =>
    sql(
      `INSERT INTO td.player_profile (user_id, energy, energy_updated_at) VALUES ($1,$2,$3)
       ON CONFLICT (user_id) DO UPDATE SET energy=$2, energy_updated_at=$3`,
      [userId, energy, T0]
    )

  describe('migration', () => {
    it('keeps every td table in the td schema, with no foreign key out of it', async () => {
      const tables = await sql<{ table_schema: string; table_name: string }[]>(
        `SELECT table_schema, table_name FROM information_schema.tables
         WHERE table_name IN ('player_profile', 'currency_ledger')`
      )
      expect(tables.map(t => t.table_schema)).toEqual(['td', 'td'])
      const [fks] = await sql<{ c: number }[]>(
        `SELECT count(*)::int c FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE n.nspname = 'td' AND c.contype = 'f'`
      )
      expect(fks.c).toBe(0)
    })

    it('can be reverted and applied again', async () => {
      const migration = new AddTdSchema1794600000000()
      const gacha = new AddTdGacha1794700000000()
      const queryRunner = dataSource.createQueryRunner()
      try {
        await gacha.down(queryRunner)
        await migration.down(queryRunner)
        const gone = await sql(`SELECT 1 FROM information_schema.schemata WHERE schema_name='td'`)
        expect(gone).toHaveLength(0)
      } finally {
        await migration.up(queryRunner)
        await gacha.up(queryRunner)
        await queryRunner.release()
      }
      const back = await sql(`SELECT 1 FROM information_schema.schemata WHERE schema_name='td'`)
      expect(back).toHaveLength(1)
    })
  })

  describe('profile', () => {
    it('starts a new player with full energy and empty balances', async () => {
      const userId = await createUser('td')
      const profile = await service.getProfile(userId, T0)
      expect(profile).toEqual({
        energy: { current: 60, cap: 60, stageCost: 6, secondsToNext: null },
        balances: { coins: 0, gems: 0, shards: 0, clovers: 0 },
      })
    })

    it('is a pure read: it takes no lock and creates no profile row', async () => {
      const userId = await createUser('td')
      await service.getProfile(userId, T0)
      expect(await sql(`SELECT 1 FROM td.player_profile WHERE user_id=$1`, [userId])).toHaveLength(
        0
      )
    })

    it.each([
      // [energy at T0, minutes offline, energy now, seconds to the next point]
      [0, 5, 0, 60],
      [0, 6, 1, 360],
      [0, 100, 16, 240],
      [10, 359, 59, 60],
      [10, 360, 60, null],
      [0, 60 * 24 * 365, 60, null],
    ])('after an offline gap: %i energy + %i min -> %i', async (start, gap, expected, next) => {
      const userId = await createUser('td')
      await setEnergy(userId, start)
      const { energy } = await service.getProfile(userId, minutes(gap))
      expect(energy.current).toBe(expected)
      expect(energy.secondsToNext).toBe(next)
    })

    it('keeps the leftover minutes across reads, so polling never loses or adds energy', async () => {
      const userId = await createUser('td')
      await setEnergy(userId, 0)
      await service.getProfile(userId, minutes(4))
      await service.getProfile(userId, minutes(8))
      expect((await service.getProfile(userId, minutes(12))).energy.current).toBe(2)
    })

    it('never double-grants when the same player is read in parallel', async () => {
      const userId = await createUser('td')
      await setEnergy(userId, 0)
      const results = await Promise.all(
        Array.from({ length: 8 }, () => service.getProfile(userId, minutes(12)))
      )
      expect(new Set(results.map(r => r.energy.current))).toEqual(new Set([2]))
      const rows = await sql(`SELECT 1 FROM td.player_profile WHERE user_id=$1`, [userId])
      expect(rows).toHaveLength(1)
    })

    it('derives balances from the ledger', async () => {
      const userId = await createUser('td')
      await sql(
        `INSERT INTO td.currency_ledger (user_id, currency, amount, reason) VALUES
         ($1,'coins',150,'battle'), ($1,'coins',-50,'upgrade'), ($1,'gems',300,'first_clear')`,
        [userId]
      )
      expect((await service.getProfile(userId, T0)).balances).toEqual({
        coins: 100,
        gems: 300,
        shards: 0,
        clovers: 0,
      })
    })
  })

  describe('GET /api/v1/td/profile', () => {
    let app: INestApplication<Server>
    let userId: string

    beforeAll(async () => {
      assertSafeTestDatabase()
      userId = await createUser('td')
      app = await createTestingApp(
        { imports: [TypeOrmModule.forRoot(dataSource.options), TdModule] },
        builder =>
          builder.overrideGuard(JwtAccessTokenAuthGuard).useValue({
            // Stands in for the real JWT guard: "Bearer <user id>" logs that user in.
            canActivate: (context: {
              switchToHttp: () => {
                getRequest: () => { headers: Record<string, string>; user?: unknown }
              }
            }) => {
              const req = context.switchToHttp().getRequest()
              const id = req.headers.authorization?.replace('Bearer ', '')
              if (!id) {
                return false
              }
              req.user = { 'user-id': id, sub: id, role: 'user' }
              return true
            },
          })
      )
    })
    afterAll(() => app.close())

    it('rejects a caller without a token', async () => {
      await request(app.getHttpServer()).get('/api/v1/td/profile').expect(403)
    })

    it('returns the caller own energy and balances, and nothing identifying', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/td/profile')
        .set('Authorization', `Bearer ${userId}`)
        .expect(200)
      expect(res.body).toMatchObject({
        energy: { cap: 60, stageCost: 6 },
        balances: { coins: 0, gems: 0, shards: 0, clovers: 0 },
      })
      expect(JSON.stringify(res.body)).not.toContain(userId)
    })

    it('rate-limits each user separately', async () => {
      const heavy = await createUser('td')
      const other = await createUser('td')
      const get = (id: string) =>
        request(app.getHttpServer()).get('/api/v1/td/profile').set('Authorization', `Bearer ${id}`)
      for (let i = 0; i < 30; i++) {
        await get(heavy).expect(200)
      }
      await get(heavy).expect(429)
      await get(other).expect(200)
    })
  })
})
