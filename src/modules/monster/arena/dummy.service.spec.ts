/* eslint-disable @typescript-eslint/no-unsafe-return -- jest mocks of untyped collaborators */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { defReductionPct } from '../boss/boss-detail'
import { EnumRaidDifficulty, RAID_BOSSES, RAID_DIFFICULTIES } from '../boss/raid-data'
import { WORLD_BOSS_ROTATION } from '../boss/world-boss-data'
import { MonsterService } from '../core/monster.service'
import { DummyFightBodyDto } from '../dto/dummy.dto'
import { loadEquipmentBonus } from '../equipment/equipment.service'
import { loadArenaLoadout } from '../passive/skill.service'
import { wellCaredState } from './arena-test-helpers'
import {
  DUMMY_DEF_DEFAULT,
  DUMMY_DEF_MAX,
  DUMMY_ELEMENTS,
  DUMMY_FIGHT_SEC,
  DUMMY_HP,
} from './dummy-data'
import { DummyService } from './dummy.service'

jest.mock('crypto', () => ({ ...jest.requireActual('crypto'), randomInt: jest.fn(() => 99) }))
jest.mock('../equipment/equipment.service', () => ({
  ...jest.requireActual('../equipment/equipment.service'),
  loadEquipmentBonus: jest.fn(),
}))
jest.mock('../passive/skill.service', () => ({
  ...jest.requireActual('../passive/skill.service'),
  loadArenaLoadout: jest.fn(),
}))

const mocked = <T>(fn: T) => fn as unknown as jest.Mock
const manager = { name: 'fake-manager' }
const monster = { ...wellCaredState(EnumMonsterLine.FLAME, EnumMonsterStage.ADULT), id: 'm1' }

const setup = (alive: unknown = monster) => {
  const monsterService = { getLatestAlive: jest.fn().mockResolvedValue(alive) }
  const service = new DummyService(
    { manager } as unknown as DataSource,
    monsterService as unknown as MonsterService
  )
  return { service, monsterService }
}
const body = (value: Partial<DummyFightBodyDto>) => value as DummyFightBodyDto

beforeEach(() => {
  jest.clearAllMocks()
  mocked(loadEquipmentBonus).mockResolvedValue(undefined)
  mocked(loadArenaLoadout).mockResolvedValue({ s1: null, s2: null, dodge: 'dg_step' })
})

describe('DummyService.getPresets', () => {
  it('lists the plain settings, the raid and world bosses, and the difficulties', () => {
    const presets = setup().service.getPresets()
    expect(presets).toEqual({
      fightSec: DUMMY_FIGHT_SEC,
      defDefault: DUMMY_DEF_DEFAULT,
      defMax: DUMMY_DEF_MAX,
      elements: DUMMY_ELEMENTS,
      raidBosses: RAID_BOSSES.map(({ id, name, emoji }) => ({ id, name, emoji })),
      difficulties: RAID_DIFFICULTIES.map(entry => entry.difficulty),
      worldBosses: WORLD_BOSS_ROTATION.map(({ id, name, emoji }) => ({ id, name, emoji })),
    })
  })
})

describe('DummyService.fight', () => {
  it('needs a living monster', async () => {
    const { service } = setup(null)
    await expect(service.fight('user-1', body({ preset: 'plain' }))).rejects.toThrow(
      new BadRequestException('You do not have a monster that can fight')
    )
  })

  it('fights a plain dummy with the requested defence and element, reading only', async () => {
    const { service, monsterService } = setup()
    const result = await service.fight(
      'user-1',
      body({ preset: 'plain', def: 120, element: EnumMonsterLine.TIDE as never })
    )
    expect(monsterService.getLatestAlive).toHaveBeenCalledWith('user-1', manager)
    expect(loadEquipmentBonus).toHaveBeenCalledWith('user-1', 'm1', manager)
    expect(loadArenaLoadout).toHaveBeenCalledWith('user-1', monster, manager)
    expect(result.dummy).toEqual({ def: 120, defReductionPct: defReductionPct(120) })
    expect(result.summary.totalDamage).toBeGreaterThan(0)
    expect(result.summary.hits).toBeGreaterThan(0)
    expect(result.battle.won).toBe(false)
    expect(result.battle.enemy.element).toBe(EnumMonsterLine.TIDE)
  })

  it('defaults a plain dummy to the default defence and the flame element', async () => {
    const { service } = setup()
    const result = await service.fight('user-1', body({ preset: 'plain' }))
    expect(result.dummy.def).toBe(DUMMY_DEF_DEFAULT)
    expect(result.battle.enemy.element).toBe(EnumMonsterLine.FLAME)
  })

  it('is deterministic for a fixed seed', async () => {
    const { service } = setup()
    const a = await service.fight('user-1', body({ preset: 'plain' }))
    const b = await service.fight('user-1', body({ preset: 'plain' }))
    expect(b.summary).toEqual(a.summary)
  })

  it('fights a raid boss as a punching bag with the boss defence', async () => {
    const { service } = setup()
    const boss = RAID_BOSSES[0]
    const result = await service.fight(
      'user-1',
      body({ preset: 'raid', bossId: boss.id, difficulty: EnumRaidDifficulty.NORMAL })
    )
    expect(result.battle.enemy.name).toBe(boss.name)
    expect(result.dummy.def).toBeGreaterThan(0)
    expect(result.battle.enemy.stats.hp).toBeGreaterThanOrEqual(DUMMY_HP)
  })

  it.each([
    [
      'unknown raid boss',
      { preset: 'raid', bossId: 'nope', difficulty: EnumRaidDifficulty.NORMAL },
    ],
    ['missing raid boss id', { preset: 'raid', difficulty: EnumRaidDifficulty.NORMAL }],
    ['unknown difficulty', { preset: 'raid', bossId: RAID_BOSSES[0].id, difficulty: 'nope' }],
    ['missing difficulty', { preset: 'raid', bossId: RAID_BOSSES[0].id }],
    ['unknown world boss', { preset: 'world', bossId: 'nope' }],
    ['missing world boss id', { preset: 'world' }],
  ])('rejects %s', async (_label, input) => {
    const { service } = setup()
    await expect(service.fight('user-1', body(input as never))).rejects.toThrow(
      new NotFoundException('Boss not found')
    )
  })

  it('fights a world boss at its full health pool', async () => {
    const { service } = setup()
    const boss = WORLD_BOSS_ROTATION[0]
    const result = await service.fight('user-1', body({ preset: 'world', bossId: boss.id }))
    expect(result.battle.enemy.name).toBe(boss.name)
    expect(result.summary.seconds).toBeGreaterThan(0)
  })
})
