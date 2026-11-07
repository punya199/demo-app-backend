import { BadRequestException, NotFoundException } from '@nestjs/common'
import { EnumMonsterStage, MonsterEntity } from '../../../db/entities/monster.entity'
import { MonsterDexEntity } from '../../../db/entities/monster-dex.entity'
import { ARENA_ENEMY_SKILLS, ARENA_SKILLS, ARENA_STATUS } from '../arena/arena-data'
import { fakeDataSource, fakeEtm, pet } from '../core/core-test-helpers'
import {
  ARENA_SKILL_CATALOG,
  loadArenaLoadout,
  loadUnlockedArenaSkills,
  SkillService,
} from './skill.service'

const dexRows = (...speciesIds: string[]) => speciesIds.map(speciesId => ({ speciesId }))
const enemySkill = ARENA_ENEMY_SKILLS[0]
const flameDex = ['flame_adultPoor', 'flame_adultAlt', 'flame_ultimateAlt', 'flame_baby1']

const setup = (living: MonsterEntity[], dex: string[] = flameDex) => {
  const etm = fakeEtm()
  etm.find.mockResolvedValue(dexRows(...dex))
  const monsters = {
    getLiving: jest.fn().mockResolvedValue(living),
    lockAndTickLiving: jest.fn().mockResolvedValue(living),
  }
  const service = new SkillService(fakeDataSource(etm) as never, monsters as never)
  return { etm, monsters, service }
}

const adult = (over: Record<string, unknown> = {}) => pet({ line: 'flame', ...over })

describe('skill catalog and loaders', () => {
  it('lists every skill with where it comes from', () => {
    expect(ARENA_SKILL_CATALOG).toHaveLength(ARENA_SKILLS.length)
    expect(ARENA_SKILL_CATALOG[0].source).toBeDefined()
  })

  it('unlocks the skills of the species in the Dex', async () => {
    const etm = fakeEtm()
    etm.find.mockResolvedValue(dexRows('flame_adultPoor'))
    const unlocked = await loadUnlockedArenaSkills('user-1', etm)
    expect(etm.find).toHaveBeenCalledWith(MonsterDexEntity, { where: { userId: 'user-1' } })
    expect([...unlocked]).toEqual(['flame_smoke'])
  })

  it('drops loadout picks the pet can no longer use', async () => {
    const etm = fakeEtm()
    etm.find.mockResolvedValue(dexRows('flame_adultPoor'))
    const stored = adult({ skillLoadout: { s1: 'flame_smoke', s2: 'flame_slash', dodge: null } })
    await expect(loadArenaLoadout('user-1', stored, etm)).resolves.toEqual({
      s1: 'flame_smoke',
      s2: null,
      dodge: null,
    })
  })
})

describe('SkillService.getState', () => {
  it('shows the catalog, unlocks and each living pet with its slots', async () => {
    const { service, monsters, etm } = setup([
      adult({ id: 'a', skillLoadout: { s1: 'flame_smoke', s2: null, dodge: 'dg_flip' } }),
      adult({ id: 'b', stage: EnumMonsterStage.BABY_2 }),
    ])
    const state = await service.getState('user-1')
    expect(monsters.getLiving).toHaveBeenCalledWith('user-1', etm)
    expect(state.catalog).toBe(ARENA_SKILL_CATALOG)
    expect(state.statuses).toBe(ARENA_STATUS)
    expect(state.unlocked).toEqual(
      expect.arrayContaining(['flame_smoke', 'flame_slash', 'flame_phoenix', 'dg_flip'])
    )
    expect(state.selectedId).toBe('a')
    expect(state.pets[0]).toEqual(
      expect.objectContaining({
        id: 'a',
        hasSkills: true,
        elements: ['flame'],
        innate: 'flame_tail',
        loadout: { s1: 'flame_smoke', s2: null, dodge: 'dg_flip' },
      })
    )
    expect(state.pets[1]).toEqual(
      expect.objectContaining({
        hasSkills: false,
        innate: null,
        loadout: { s1: null, s2: null, dodge: null },
      })
    )
  })

  it('has no selected pet when none lives', async () => {
    const { service } = setup([])
    const state = await service.getState('user-1')
    expect(state.selectedId).toBeNull()
    expect(state.pets).toEqual([])
  })

  it('reads through the given manager when one is passed', async () => {
    const { service } = setup([])
    const other = fakeEtm()
    other.find.mockResolvedValue([])
    await service.getState('user-1', other)
    expect(other.find).toHaveBeenCalledWith(MonsterDexEntity, { where: { userId: 'user-1' } })
  })
})

describe('SkillService.setLoadout', () => {
  const run = (living: MonsterEntity[], loadout: object, monsterId?: string, dex?: string[]) => {
    const ctx = setup(living, dex)
    const full = { s1: null, s2: null, dodge: null, ...loadout }
    return { ...ctx, promise: ctx.service.setLoadout('user-1', full, monsterId) }
  }

  it('saves legal picks on the selected pet and returns the new state', async () => {
    const { promise, etm } = run([adult()], {
      s1: 'flame_smoke',
      s2: 'flame_slash',
      dodge: 'dg_flip',
    })
    const state = await promise
    expect(etm.update).toHaveBeenCalledWith(MonsterEntity, 'pet-1', {
      skillLoadout: { s1: 'flame_smoke', s2: 'flame_slash', dodge: 'dg_flip' },
    })
    expect(state.pets).toHaveLength(1)
  })

  it('accepts a second slot with an empty first slot and empty slots', async () => {
    const { promise, etm } = run([adult()], { s2: 'flame_slash' })
    await promise
    expect(etm.update).toHaveBeenCalledWith(MonsterEntity, 'pet-1', {
      skillLoadout: { s1: null, s2: 'flame_slash', dodge: null },
    })
  })

  it('targets the given pet', async () => {
    const { promise, etm } = run([adult({ id: 'a' }), adult({ id: 'b' })], {}, 'b')
    await promise
    expect(etm.update).toHaveBeenCalledWith(MonsterEntity, 'b', expect.anything())
  })

  it('404s for an unknown pet or when nothing lives', async () => {
    await expect(run([adult()], {}, 'zzz').promise).rejects.toThrow(
      new NotFoundException('Monster not found')
    )
    await expect(run([], {}).promise).rejects.toThrow(NotFoundException)
  })

  it('refuses eggs and babies', async () => {
    const { promise, etm } = run([adult({ stage: EnumMonsterStage.BABY_1 })], {})
    await expect(promise).rejects.toThrow(
      new BadRequestException('Eggs and baby forms cannot use skills yet')
    )
    expect(etm.update).not.toHaveBeenCalled()
  })

  it('refuses the same skill in both slots', async () => {
    const { promise } = run([adult()], { s1: 'flame_smoke', s2: 'flame_smoke' })
    await expect(promise).rejects.toThrow(
      new BadRequestException('The same skill cannot fill both slots')
    )
  })

  it.each([
    ['an unknown skill', { s1: 'nope' }, NotFoundException, 'Skill not found'],
    ['an enemy skill', { s1: enemySkill.id }, NotFoundException, 'Skill not found'],
    [
      'a skill that is not unlocked',
      { s1: 'flame_claw' },
      BadRequestException,
      'This skill is not unlocked yet',
    ],
    [
      'a dodge skill in a skill slot',
      { s1: 'dg_flip' },
      BadRequestException,
      'A dodge skill only fits the dodge slot',
    ],
    [
      'a skill in the dodge slot',
      { dodge: 'flame_smoke' },
      BadRequestException,
      'Only a dodge skill fits the dodge slot',
    ],
    [
      'the innate skill again',
      { s1: 'flame_tail' },
      BadRequestException,
      'This monster cannot use that skill',
    ],
  ])('refuses %s', async (_label, loadout, errorType, message) => {
    const { promise, etm } = run([adult()], loadout, undefined, [...flameDex, 'flame_adultGood'])
    const error = await promise.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(errorType)
    expect((error as Error).message).toBe(message)
    expect(etm.update).not.toHaveBeenCalled()
  })

  it('refuses a skill of another element', async () => {
    const { promise } = run([adult()], { s1: 'tide_sword' }, undefined, ['tide_adultGood'])
    await expect(promise).rejects.toThrow(
      new BadRequestException('This monster cannot use that skill')
    )
  })

  it('allows one passive only, the innate counting', async () => {
    const dex = ['flame_ultimateAlt', 'leaf_ultimateAlt']
    const fused = adult({
      speciesId: 'fused_flame_leaf',
      stage: EnumMonsterStage.FUSED,
    })
    await expect(
      run([fused], { s1: 'flame_phoenix', s2: 'leaf_ent' }, undefined, dex).promise
    ).rejects.toThrow(
      new BadRequestException('Only one passive skill per loadout (the innate skill counts)')
    )
    const innatePassive = adult({
      speciesId: 'flame_ultimateAlt',
      stage: EnumMonsterStage.ULTIMATE,
    })
    await expect(
      run([innatePassive], { s1: 'flame_phoenix' }, undefined, dex).promise
    ).rejects.toThrow(
      new BadRequestException('Only one passive skill per loadout (the innate skill counts)')
    )
  })
})
