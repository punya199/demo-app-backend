import { EquipmentItemEntity } from '../../../db/entities/equipment-item.entity'
import {
  EnumMonsterLine,
  EnumMonsterStage,
  MonsterEntity,
} from '../../../db/entities/monster.entity'
import { createEgg } from '../core/monster-engine'
import { EnumEquipmentGrade, EnumEquipmentSlot } from './equipment-data'

export const NOW = new Date('2026-01-01T03:00:00Z')
export const USER = 'user-1'
export const PET_ID = 'pet-1'

// A fake EntityManager: every method is a jest mock with a harmless default (nothing found).
export const makeEtm = () => {
  const etm = {
    find: jest.fn<Promise<unknown[]>, unknown[]>().mockResolvedValue([]),
    findOne: jest.fn<Promise<unknown>, unknown[]>().mockResolvedValue(null),
    findOneOrFail: jest.fn<Promise<unknown>, unknown[]>().mockResolvedValue({}),
    count: jest.fn<Promise<number>, unknown[]>().mockResolvedValue(0),
    save: jest
      .fn<Promise<unknown>, [unknown, unknown]>()
      .mockImplementation((_entity, data) =>
        Promise.resolve(Array.isArray(data) ? data : { id: 'row-new', ...(data as object) })
      ),
    update: jest.fn<Promise<{ affected?: number }>, unknown[]>().mockResolvedValue({ affected: 1 }),
    softDelete: jest.fn<Promise<unknown>, unknown[]>().mockResolvedValue({}),
    query: jest.fn<Promise<unknown[]>, unknown[]>().mockResolvedValue([]),
    createQueryBuilder: jest.fn(),
  }
  return etm
}
export type FakeEtm = ReturnType<typeof makeEtm>

export const makeDataSource = (etm: FakeEtm) => ({
  manager: etm,
  transaction: jest.fn((cb: (manager: FakeEtm) => unknown) => Promise.resolve(cb(etm))),
})

// Answers findOne/find by entity class; anything else is null / [].
export const byEntity =
  (map: Map<unknown, unknown>) =>
  (entity: unknown): Promise<unknown> =>
    Promise.resolve(map.get(entity) ?? null)

// A chainable TypeORM query builder whose execute() resolves `result`.
export const makeQb = (result: unknown) => {
  const qb: Record<string, jest.Mock> = {}
  for (const name of [
    'insert',
    'into',
    'values',
    'orIgnore',
    'returning',
    'update',
    'set',
    'where',
  ]) {
    qb[name] = jest.fn(() => qb)
  }
  qb.execute = jest.fn(() => Promise.resolve(result))
  return qb
}

export const itemRow = (overrides: Partial<EquipmentItemEntity> = {}) =>
  ({
    id: 'item-1',
    userId: USER,
    templateId: 'unknown_template',
    slot: EnumEquipmentSlot.WEAPON,
    setId: null,
    grade: EnumEquipmentGrade.COMMON,
    mainValue: 10,
    subStats: { hp: 5, atk: 2 },
    specialOptions: [],
    enhanceLevel: 0,
    pity: 0,
    equipped: false,
    monsterId: null,
    pendingRefine: null,
    createdAt: NOW,
    ...overrides,
  }) as unknown as EquipmentItemEntity

export const petRow = (overrides: Record<string, unknown> = {}) =>
  ({
    ...createEgg(EnumMonsterLine.FLAME, NOW),
    id: PET_ID,
    speciesId: 'flame_adultGood',
    stage: EnumMonsterStage.ADULT,
    fullness: 4,
    strength: 4,
    weight: 20,
    lastSeenAt: null,
    expeditionAreaId: null,
    costume: null,
    ...overrides,
  }) as unknown as MonsterEntity
