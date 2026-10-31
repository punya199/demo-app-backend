import dataSource from '../../config/database.config'
import { EnumMonsterLine, MonsterEntity } from '../../db/entities/monster.entity'
import { WalletEntity } from '../../db/entities/wallet.entity'
import { WalletService } from '../wallet/wallet.service'
import { MonsterService } from './monster.service'

// Helpers for the *.int-spec.ts suites, which run against a REAL Postgres via
// `yarn test:integration`. They run migrations and insert/delete rows, so they refuse to start
// unless the database is clearly a throwaway one: local host and a name containing "test" or
// "check" (create one with `createdb yaya_test`). `.env` may point at a shared database; this guard
// is what stops a stray `yarn test:integration` from touching it.
const SAFE_HOSTS = ['localhost', '127.0.0.1', '::1']

export const assertSafeTestDatabase = () => {
  const options = dataSource.options as { host?: string; database?: string }
  const isLocal = SAFE_HOSTS.includes(options.host ?? '')
  const isThrowaway = /test|check/i.test(options.database ?? '')
  if (!isLocal || !isThrowaway) {
    throw new Error(
      `Refusing to run integration tests against ${options.host}/${options.database}: ` +
        'use a local database whose name contains "test" or "check" ' +
        '(set DATABASE_HOST / DATABASE_NAME in the environment).'
    )
  }
}

export const startTestDatabase = async () => {
  assertSafeTestDatabase()
  await dataSource.initialize()
  await dataSource.runMigrations()
}

export const stopTestDatabase = async () => {
  if (dataSource.isInitialized) {
    await dataSource.destroy()
  }
}

export const sql = <T = unknown>(query: string, params: unknown[] = []) =>
  dataSource.query<T>(query, params)

export const createUser = async (prefix = 'it') => {
  const [row] = await sql<{ id: string }[]>(
    `INSERT INTO users (username, password) VALUES ($1 || '_' || floor(random()*1e9), 'x') RETURNING id`,
    [prefix]
  )
  return row.id
}

export const buildCore = () => {
  const wallet = new WalletService(dataSource.getRepository(WalletEntity))
  const monsters = new MonsterService(dataSource.getRepository(MonsterEntity), dataSource, wallet)
  return { wallet, monsters }
}

// A user with a hatched monster forced into a given form (fed, trained, full stamina).
export const createUserWithMonster = async (
  monsters: MonsterService,
  stage = 'adult',
  speciesId = 'flame_adultGood',
  prefix = 'it'
) => {
  const userId = await createUser(prefix)
  await monsters.hatch(userId, EnumMonsterLine.FLAME)
  await sql(
    `UPDATE monsters SET stage=$2, species_id=$3, fullness=4, strength=4, weight=30, stamina=100 WHERE owner_id=$1`,
    [userId, stage, speciesId]
  )
  return userId
}

export const give = (userId: string, coin: number, gem = 0) =>
  sql(
    `INSERT INTO wallets (user_id, coin, gem) VALUES ($1,$2,$3)
     ON CONFLICT (user_id) WHERE deleted_at IS NULL DO UPDATE SET coin=$2, gem=$3`,
    [userId, coin, gem]
  )

export const succeeded = (results: PromiseSettledResult<unknown>[]) =>
  results.filter(result => result.status === 'fulfilled').length

export const withTimeout = <T>(promise: Promise<T>, ms: number) =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])
