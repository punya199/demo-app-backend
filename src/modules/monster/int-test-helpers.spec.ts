/* eslint-disable @typescript-eslint/no-unsafe-member-access -- rtk jest mock call inspection */
import { EnumMonsterLine } from '../../db/entities/monster.entity'
import {
  assertSafeTestDatabase,
  buildCore,
  createUser,
  createUserWithMonster,
  give,
  sql,
  startTestDatabase,
  stopTestDatabase,
  succeeded,
  withTimeout,
} from './int-test-helpers'

const mockDataSource = {
  options: {} as { host?: string; database?: string },
  isInitialized: false,
  initialize: jest.fn(),
  runMigrations: jest.fn(),
  destroy: jest.fn(),
  query: jest.fn(),
  getRepository: jest.fn(() => ({})),
}
jest.mock('../../config/database.config', () => ({
  __esModule: true,
  get default() {
    return mockDataSource
  },
}))

const useDb = (host?: string, database?: string) => {
  mockDataSource.options = { host, database }
}

describe('assertSafeTestDatabase', () => {
  it.each([
    ['localhost', 'yaya_test'],
    ['127.0.0.1', 'schema_CHECK'],
    ['::1', 'my_test_db'],
  ])('accepts %s/%s', (host, database) => {
    useDb(host, database)
    expect(() => assertSafeTestDatabase()).not.toThrow()
  })

  it.each([
    ['db.example.com', 'yaya_test'],
    ['localhost', 'yaya_prod'],
    [undefined, undefined],
  ])('refuses %s/%s', (host, database) => {
    useDb(host, database)
    expect(() => assertSafeTestDatabase()).toThrow(
      `Refusing to run integration tests against ${host}/${database}`
    )
  })
})

describe('database lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockDataSource.isInitialized = false
  })

  it('startTestDatabase refuses an unsafe database before connecting', async () => {
    useDb('prod.example.com', 'main')
    await expect(startTestDatabase()).rejects.toThrow('Refusing to run')
    expect(mockDataSource.initialize).not.toHaveBeenCalled()
  })

  it('startTestDatabase initializes and migrates a safe database', async () => {
    useDb('localhost', 'yaya_test')
    await startTestDatabase()
    expect(mockDataSource.initialize).toHaveBeenCalledTimes(1)
    expect(mockDataSource.runMigrations).toHaveBeenCalledTimes(1)
  })

  it('stopTestDatabase destroys only an initialized connection', async () => {
    await stopTestDatabase()
    expect(mockDataSource.destroy).not.toHaveBeenCalled()
    mockDataSource.isInitialized = true
    await stopTestDatabase()
    expect(mockDataSource.destroy).toHaveBeenCalledTimes(1)
  })
})

describe('sql helpers', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sql forwards the query with default params', async () => {
    mockDataSource.query.mockResolvedValue([{ a: 1 }])
    await expect(sql('SELECT 1')).resolves.toEqual([{ a: 1 }])
    expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1', [])
  })

  it('createUser returns the inserted id using the prefix', async () => {
    mockDataSource.query.mockResolvedValue([{ id: 'user-1' }])
    await expect(createUser('abc')).resolves.toBe('user-1')
    expect(mockDataSource.query.mock.calls[0][1]).toEqual(['abc'])
    await createUser()
    expect(mockDataSource.query.mock.calls[1][1]).toEqual(['it'])
  })

  it('give upserts the wallet with coin and gem', async () => {
    mockDataSource.query.mockResolvedValue([])
    await give('u1', 10)
    expect(mockDataSource.query.mock.calls[0][1]).toEqual(['u1', 10, 0])
    await give('u1', 10, 4)
    expect(mockDataSource.query.mock.calls[1][1]).toEqual(['u1', 10, 4])
  })

  it('createUserWithMonster hatches a flame monster and forces its form', async () => {
    mockDataSource.query.mockResolvedValue([{ id: 'user-2' }])
    const hatch = jest.fn()
    await expect(createUserWithMonster({ hatch } as never)).resolves.toBe('user-2')
    expect(hatch).toHaveBeenCalledWith('user-2', EnumMonsterLine.FLAME)
    expect(mockDataSource.query.mock.calls[1][1]).toEqual(['user-2', 'adult', 'flame_adultGood'])
    await createUserWithMonster({ hatch } as never, 'child', 'x', 'p')
    expect(mockDataSource.query.mock.calls[3][1]).toEqual(['user-2', 'child', 'x'])
  })

  it('buildCore wires the wallet into the monster service', () => {
    const { wallet, monsters } = buildCore()
    expect(wallet).toBeDefined()
    expect(monsters).toBeDefined()
    expect(mockDataSource.getRepository).toHaveBeenCalledTimes(2)
  })
})

describe('pure helpers', () => {
  it('succeeded counts fulfilled results', () => {
    expect(
      succeeded([
        { status: 'fulfilled', value: 1 },
        { status: 'rejected', reason: new Error('x') },
        { status: 'fulfilled', value: 2 },
      ])
    ).toBe(2)
  })

  it('withTimeout resolves with the promise or rejects on timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok')
    jest.useFakeTimers()
    const pending = withTimeout(new Promise(() => undefined), 50)
    const assertion = expect(pending).rejects.toThrow('timeout')
    jest.advanceTimersByTime(50)
    await assertion
    jest.useRealTimers()
  })
})
