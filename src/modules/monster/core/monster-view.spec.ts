import { BadRequestException } from '@nestjs/common'
import { EquipmentItemEntity } from '../../../db/entities/equipment-item.entity'
import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { MonsterRuleError } from './monster-engine'
import { createEgg } from './monster-engine'
import { MINIGAME_COOLDOWN_MS, TRAIN_COOLDOWN_MS } from './monster-rules'
import {
  dexView,
  evolutionPathOf,
  releaseGear,
  releasePet,
  SELECTED_ORDER,
  toMonsterView,
  withRuleErrors,
} from './monster-view'
import { PvpDefenseEntity } from '../../../db/entities/pvp-defense.entity'
import { SupportUnitEntity } from '../../../db/entities/support-unit.entity'
import { fakeEtm, NOW, pet } from './core-test-helpers'

describe('withRuleErrors', () => {
  it('returns the rule result', () => {
    expect(withRuleErrors(() => 7)).toBe(7)
  })

  it('turns a rule error into a 400 with its message', () => {
    const run = () =>
      withRuleErrors(() => {
        throw new MonsterRuleError('Not now')
      })
    expect(run).toThrow(BadRequestException)
    expect(run).toThrow('Not now')
  })

  it('lets other errors through untouched', () => {
    const boom = new TypeError('boom')
    expect(() =>
      withRuleErrors(() => {
        throw boom
      })
    ).toThrow(boom)
  })
})

describe('releaseGear', () => {
  it('unequips everything the pet wore', async () => {
    const etm = fakeEtm()
    await releaseGear('pet-1', etm)
    expect(etm.update).toHaveBeenCalledWith(
      EquipmentItemEntity,
      { monsterId: 'pet-1', equipped: true },
      { equipped: false, monsterId: null }
    )
  })
})

describe('releasePet', () => {
  it('unequips the gear and removes only the arena and rental copies taken from that pet', async () => {
    const etm = fakeEtm()
    await releasePet('pet-1', etm)
    expect(etm.update).toHaveBeenCalledWith(
      EquipmentItemEntity,
      { monsterId: 'pet-1', equipped: true },
      { equipped: false, monsterId: null }
    )
    expect(etm.softDelete).toHaveBeenCalledWith(PvpDefenseEntity, { monsterId: 'pet-1' })
    expect(etm.softDelete).toHaveBeenCalledWith(SupportUnitEntity, { monsterId: 'pet-1' })
  })
})

describe('SELECTED_ORDER', () => {
  it('puts the selected pet first, newest birth breaking ties', () => {
    expect(SELECTED_ORDER).toEqual({
      selectedAt: { direction: 'DESC', nulls: 'LAST' },
      bornAt: 'DESC',
    })
  })
})

describe('toMonsterView', () => {
  it('shows the species name, battle stats and no cooldowns for a fresh adult', () => {
    const view = toMonsterView(pet())
    expect(view.name).toBe(view.displayName)
    expect(view.emoji).toBeTruthy()
    expect(view.battleStats).not.toBeNull()
    expect(view.trainReadyAt).toBeNull()
    expect(view.minigameReadyAt).toBeNull()
    expect(view.expeditionPendingCoins).toBe(0)
    expect(view.evolution.next).toEqual(
      expect.objectContaining({ stage: EnumMonsterStage.PERFECT })
    )
  })

  it('has no next form once fully evolved', () => {
    const view = toMonsterView(
      pet({ speciesId: 'flame_ultimate', stage: EnumMonsterStage.ULTIMATE })
    )
    expect(view.evolution.next).toBeNull()
    expect(view.evolution.rules).toEqual([])
  })

  it('prefers the nickname and computes cooldown ready times', () => {
    const view = toMonsterView(pet({ nickname: 'Momo', lastTrainedAt: NOW, lastMinigameAt: NOW }))
    expect(view.displayName).toBe('Momo')
    expect(view.name).not.toBe('Momo')
    expect(view.trainReadyAt).toEqual(new Date(NOW.getTime() + TRAIN_COOLDOWN_MS))
    expect(view.minigameReadyAt).toEqual(new Date(NOW.getTime() + MINIGAME_COOLDOWN_MS))
  })

  it('has no battle stats for an egg and names the next form', () => {
    const egg = { ...pet(), ...createEgg(EnumMonsterLine.FLAME, NOW) }
    const view = toMonsterView(egg as never)
    expect(view.battleStats).toBeNull()
    expect(view.evolution.next).toEqual(
      expect.objectContaining({ id: expect.any(String), stage: EnumMonsterStage.BABY_1 })
    )
    expect(view.evolution.rules.every(rule => typeof rule.to.name === 'string')).toBe(true)
  })
})

describe('evolutionPathOf', () => {
  const log = (from: string, to: string) => ({ payload: { from, to } }) as never

  it('is just the current form when there are no evolve logs', () => {
    expect(evolutionPathOf([], 'flame_ultimate')).toEqual(['flame_ultimate'])
  })

  it('follows the links regardless of log order', () => {
    const logs = [log('b', 'c'), log('a', 'b'), log('c', 'd')]
    expect(evolutionPathOf(logs, 'd')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('does not loop forever on a cyclic log', () => {
    const logs = [log('a', 'b'), log('b', 'a')]
    expect(evolutionPathOf(logs, 'a').length).toBeLessThanOrEqual(3)
  })
})

describe('dexView', () => {
  it('lists every non-egg species and hides undiscovered names', () => {
    const empty = dexView(new Set())
    expect(empty.length).toBeGreaterThan(0)
    expect(empty.some(entry => entry.stage === EnumMonsterStage.EGG)).toBe(false)
    expect(empty.every(entry => !entry.discovered && entry.name === null)).toBe(true)

    const first = empty[0]
    const partial = dexView(new Set([first.id]))
    expect(partial[0]).toEqual(
      expect.objectContaining({ id: first.id, discovered: true, name: expect.any(String) })
    )
    expect(partial[0].emoji).toBeTruthy()
    expect(partial[1].discovered).toBe(false)
  })
})
