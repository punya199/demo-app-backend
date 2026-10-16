// Runs against a real Postgres (the docker-compose one) via `yarn test:integration`.
import { randomUUID } from 'crypto'
import dataSource from '../../config/database.config'
import { PostgresKvStore } from './postgres-kv-store'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

describe('PostgresKvStore (contract)', () => {
  let kv: PostgresKvStore
  const ns = `it:${randomUUID()}:`
  const key = (name: string) => `${ns}${name}`

  beforeAll(async () => {
    await dataSource.initialize()
    await dataSource.runMigrations()
    kv = new PostgresKvStore(dataSource)
  })

  afterAll(async () => {
    await kv.deleteByPrefix(ns)
    await dataSource.destroy()
  })

  it('migration down() drops kv_store and up() recreates it', async () => {
    const runner = dataSource.createQueryRunner()
    await runner.startTransaction()
    try {
      const migration = dataSource.migrations.find(m => m.name?.startsWith('AddKvStoreTable'))
      await migration!.down(runner)
      expect(await runner.hasTable('kv_store')).toBe(false)
      await migration!.up(runner)
      expect(await runner.hasTable('kv_store')).toBe(true)
    } finally {
      await runner.rollbackTransaction()
      await runner.release()
    }
  })

  it('gets a value after set', async () => {
    await kv.set(key('a'), 'hello', 60_000)
    expect(await kv.get(key('a'))).toBe('hello')
  })

  it('returns null for a missing or expired key', async () => {
    await kv.set(key('short'), 'x', 50)
    await sleep(100)
    expect(await kv.get(key('short'))).toBeNull()
    expect(await kv.get(key('missing'))).toBeNull()
  })

  it('set overwrites the value and resets the TTL', async () => {
    await kv.set(key('ow'), 'old', 50)
    await kv.set(key('ow'), 'new', 60_000)
    await sleep(100)
    expect(await kv.get(key('ow'))).toBe('new')
  })

  it('accepts TTLs beyond 32-bit milliseconds (30 days)', async () => {
    await kv.set(key('long'), '1', 30 * 24 * 60 * 60 * 1000)
    expect(await kv.get(key('long'))).toBe('1')
  })

  it('setIfAbsent claims a missing key, refuses a live key, claims an expired key', async () => {
    expect(await kv.setIfAbsent(key('nx'), '1', 50)).toBe(true)
    expect(await kv.setIfAbsent(key('nx'), '2', 50)).toBe(false)
    await sleep(100)
    expect(await kv.setIfAbsent(key('nx'), '3', 60_000)).toBe(true)
    expect(await kv.get(key('nx'))).toBe('3')
  })

  it('lets exactly one of many concurrent setIfAbsent calls win', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => kv.setIfAbsent(key('race'), String(i), 60_000))
    )
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('incrementWithTtl counts 1, 2, 3 and restarts after expiry', async () => {
    expect(await kv.incrementWithTtl(key('cnt'), 150)).toBe(1)
    expect(await kv.incrementWithTtl(key('cnt'), 150)).toBe(2)
    expect(await kv.incrementWithTtl(key('cnt'), 150)).toBe(3)
    await sleep(250)
    expect(await kv.incrementWithTtl(key('cnt'), 150)).toBe(1)
  })

  it('keeps the TTL from the first increment', async () => {
    await kv.incrementWithTtl(key('fixed'), 150)
    await sleep(100)
    await kv.incrementWithTtl(key('fixed'), 60_000)
    await sleep(100)
    expect(await kv.get(key('fixed'))).toBeNull()
  })

  it('loses no updates under concurrent increments', async () => {
    const counts = await Promise.all(
      Array.from({ length: 20 }, () => kv.incrementWithTtl(key('concurrent'), 60_000))
    )
    expect([...counts].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1))
    expect(await kv.get(key('concurrent'))).toBe('20')
  })

  it('del removes several keys at once', async () => {
    await kv.set(key('d1'), '1', 60_000)
    await kv.set(key('d2'), '1', 60_000)
    await kv.set(key('d3'), '1', 60_000)
    await kv.del(key('d1'), key('d2'))
    expect(await kv.get(key('d1'))).toBeNull()
    expect(await kv.get(key('d2'))).toBeNull()
    expect(await kv.get(key('d3'))).toBe('1')
  })

  it('deleteByPrefix removes only matching keys (no LIKE wildcards)', async () => {
    await kv.set(key('dev:u_1:a'), '1', 60_000)
    await kv.set(key('dev:u_1:b'), '1', 60_000)
    await kv.set(key('dev:uX1:a'), '1', 60_000)
    await kv.set(key('dev:u_10:a'), '1', 60_000)
    await kv.deleteByPrefix(key('dev:u_1:'))
    expect(await kv.get(key('dev:u_1:a'))).toBeNull()
    expect(await kv.get(key('dev:u_1:b'))).toBeNull()
    expect(await kv.get(key('dev:uX1:a'))).toBe('1')
    expect(await kv.get(key('dev:u_10:a'))).toBe('1')
  })

  it('deleteExpired removes expired rows only', async () => {
    await kv.set(key('exp'), '1', 50)
    await kv.set(key('live'), '1', 60_000)
    await sleep(100)
    await kv.deleteExpired()
    const rows: unknown[] = await dataSource.query('SELECT key FROM kv_store WHERE key = ANY($1)', [
      [key('exp'), key('live')],
    ])
    expect(rows).toEqual([{ key: key('live') }])
  })
})
