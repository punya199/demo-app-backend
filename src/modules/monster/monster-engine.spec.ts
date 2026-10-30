import {
  EnumMonsterDeathCause,
  EnumMonsterLine,
  EnumMonsterStage,
} from '../../db/entities/monster.entity'
import { EnumMonsterLogType } from '../../db/entities/monster-log.entity'
import {
  applyAction,
  applyBattleOutcome,
  applyShopItem,
  assertCanBattle,
  createEgg,
  EnumMonsterAction,
  IMonsterState,
  isAsleepAt,
  MonsterRuleError,
  tick,
} from './monster-engine'
import { LIFESPAN_MINUTES, STAGE_DURATION_MINUTES } from './monster-rules'
import { EnumShopItemId } from './shop-data'

// 03:00 UTC = 10:00 Thai time, well inside the awake window (sleep is 22:00-07:00 Thai time).
const MORNING = new Date('2026-01-01T03:00:00Z')
// 15:00 UTC = 22:00 Thai time, the minute the monster falls asleep.
const BEDTIME = new Date('2026-01-01T15:00:00Z')

const minutesAfter = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000)

const monster = (overrides: Partial<IMonsterState> = {}, at = MORNING): IMonsterState => ({
  ...createEgg(EnumMonsterLine.FLAME, at),
  speciesId: 'flame_adultGood',
  stage: EnumMonsterStage.ADULT,
  fullness: 4,
  strength: 4,
  weight: 20,
  ...overrides,
})

const eventTypes = (events: { type: EnumMonsterLogType }[]) => events.map(event => event.type)

describe('isAsleepAt', () => {
  it('follows the 22:00-07:00 Thai-time schedule', () => {
    expect(isAsleepAt(new Date('2026-01-01T14:59:00Z'))).toBe(false)
    expect(isAsleepAt(new Date('2026-01-01T15:00:00Z'))).toBe(true)
    expect(isAsleepAt(new Date('2026-01-01T23:59:00Z'))).toBe(true)
    expect(isAsleepAt(new Date('2026-01-02T00:00:00Z'))).toBe(false)
  })
})

describe('tick', () => {
  it('hatches an egg after 5 minutes without aging it', () => {
    const egg = createEgg(EnumMonsterLine.TIDE, MORNING)

    const before = tick(egg, minutesAfter(MORNING, 4))
    expect(before.state.stage).toBe(EnumMonsterStage.EGG)

    const { state, events } = tick(egg, minutesAfter(MORNING, 5))
    expect(state.speciesId).toBe('tide_baby1')
    expect(state.stage).toBe(EnumMonsterStage.BABY_1)
    expect(state.fullness).toBe(2)
    expect(state.strength).toBe(2)
    expect(state.ageMinutes).toBe(0)
    expect(eventTypes(events)).toEqual([EnumMonsterLogType.EVOLVE])
  })

  it('only consumes whole minutes, leaving the remainder for the next tick', () => {
    const { state } = tick(monster(), new Date(MORNING.getTime() + 90_000))
    expect(state.lastTickAt).toEqual(minutesAfter(MORNING, 1))
    expect(state.ageMinutes).toBe(1)
  })

  it('is a no-op for a dead monster', () => {
    const dead = monster({ diedAt: MORNING, deathCause: EnumMonsterDeathCause.OLD_AGE })
    const { state, events } = tick(dead, minutesAfter(MORNING, 600))
    expect(state).toEqual(dead)
    expect(events).toEqual([])
  })

  it('drains hearts at the stage rate while awake', () => {
    const { state } = tick(monster(), minutesAfter(MORNING, 60))
    expect(state.fullness).toBeCloseTo(3)
    expect(state.strength).toBeCloseTo(4 - 60 / 75)
  })

  it('does not drain hearts or poop while asleep', () => {
    const asleep = monster({ lightsOn: false }, BEDTIME)
    const { state } = tick(asleep, minutesAfter(BEDTIME, 300))
    expect(state.fullness).toBe(4)
    expect(state.strength).toBe(4)
    expect(state.poops).toBe(0)
  })

  it('counts a care mistake after 30 hungry minutes, then every 4 hours', () => {
    const hungry = monster({ fullness: 0 })

    expect(tick(hungry, minutesAfter(MORNING, 29)).state.careMistakes).toBe(0)
    expect(tick(hungry, minutesAfter(MORNING, 30)).state.careMistakes).toBe(1)
    expect(tick(hungry, minutesAfter(MORNING, 269)).state.careMistakes).toBe(1)
    expect(tick(hungry, minutesAfter(MORNING, 270)).state.careMistakes).toBe(2)
  })

  it('gets sick when the fourth poop lands', () => {
    const { state, events } = tick(
      monster({ poops: 3, poopMinutes: 119 }),
      minutesAfter(MORNING, 1)
    )
    expect(state.poops).toBe(4)
    expect(state.isSick).toBe(true)
    expect(eventTypes(events)).toContain(EnumMonsterLogType.SICK)
  })

  it('dies after 12 hours of untreated sickness', () => {
    const sick = monster({ isSick: true })
    expect(tick(sick, minutesAfter(MORNING, 719)).state.diedAt).toBeNull()

    const { state, events } = tick(sick, minutesAfter(MORNING, 720))
    expect(state.deathCause).toBe(EnumMonsterDeathCause.SICKNESS)
    expect(state.diedAt).toEqual(minutesAfter(MORNING, 720))
    expect(eventTypes(events)).toContain(EnumMonsterLogType.DEATH)
  })

  it('dies of old age at the end of its lifespan', () => {
    const old = monster({ ageMinutes: LIFESPAN_MINUTES - 1 })
    const { state } = tick(old, minutesAfter(MORNING, 1))
    expect(state.deathCause).toBe(EnumMonsterDeathCause.OLD_AGE)
  })

  it('counts one care mistake per night when the lights stay on', () => {
    const asleep = monster({ lightsOn: true }, BEDTIME)

    expect(tick(asleep, minutesAfter(BEDTIME, 29)).state.careMistakes).toBe(0)
    expect(tick(asleep, minutesAfter(BEDTIME, 30)).state.careMistakes).toBe(1)
    expect(tick(asleep, minutesAfter(BEDTIME, 300)).state.careMistakes).toBe(1)
  })

  it('turns the lights back on at wake-up and resets the night counter', () => {
    const lastMinuteAsleep = new Date('2026-01-01T23:59:00Z')
    const { state } = tick(
      monster({ lightsOn: false, sleepLightMinutes: 45 }, lastMinuteAsleep),
      minutesAfter(lastMinuteAsleep, 1)
    )
    expect(state.lightsOn).toBe(true)
    expect(state.sleepLightMinutes).toBe(0)
  })

  describe('evolution', () => {
    const atStageEnd = (overrides: Partial<IMonsterState>) => {
      const stage = overrides.stage!
      return tick(
        monster({ stageMinutes: STAGE_DURATION_MINUTES[stage]! - 1, ...overrides }),
        minutesAfter(MORNING, 1)
      )
    }

    it('evolves a well-cared baby into the good adult and resets stage counters', () => {
      const { state, events } = atStageEnd({
        speciesId: 'flame_baby2',
        stage: EnumMonsterStage.BABY_2,
        careMistakes: 3,
        trainCount: 5,
      })
      expect(state.speciesId).toBe('flame_adultGood')
      expect(state.stage).toBe(EnumMonsterStage.ADULT)
      expect(state.careMistakes).toBe(0)
      expect(state.trainCount).toBe(0)
      expect(state.stageMinutes).toBe(0)
      expect(events.find(event => event.type === EnumMonsterLogType.EVOLVE)?.payload).toEqual({
        from: 'flame_baby2',
        to: 'flame_adultGood',
      })
    })

    it('evolves a neglected baby into the poor adult', () => {
      const { state } = atStageEnd({
        speciesId: 'flame_baby2',
        stage: EnumMonsterStage.BABY_2,
        careMistakes: 4,
      })
      expect(state.speciesId).toBe('flame_adultPoor')
    })

    it('needs both low mistakes and enough training for the good perfect form', () => {
      const base = { speciesId: 'leaf_adultGood', stage: EnumMonsterStage.ADULT, careMistakes: 2 }
      expect(atStageEnd({ ...base, trainCount: 8 }).state.speciesId).toBe('leaf_perfectGood')
      expect(atStageEnd({ ...base, trainCount: 7 }).state.speciesId).toBe('leaf_perfectPoor')
    })

    it('raises weight to the new form minimum', () => {
      const { state } = atStageEnd({
        speciesId: 'flame_baby2',
        stage: EnumMonsterStage.BABY_2,
        weight: 12,
      })
      expect(state.weight).toBe(20)
    })

    it('needs 5 lifetime wins on top of good care to reach the ultimate form', () => {
      const base = {
        speciesId: 'tide_perfectGood',
        stage: EnumMonsterStage.PERFECT,
        careMistakes: 0,
        trainCount: 12,
      }
      expect(atStageEnd({ ...base, wins: 4 }).state.speciesId).toBe('tide_perfectGood')
      expect(atStageEnd({ ...base, wins: 5 }).state.speciesId).toBe('tide_ultimate')
    })

    it('keeps a perfect form that misses the ultimate conditions', () => {
      const { state, events } = atStageEnd({
        speciesId: 'tide_perfectGood',
        stage: EnumMonsterStage.PERFECT,
        careMistakes: 2,
        trainCount: 20,
      })
      expect(state.speciesId).toBe('tide_perfectGood')
      expect(eventTypes(events)).not.toContain(EnumMonsterLogType.EVOLVE)
    })
  })
})

describe('applyAction', () => {
  it('feeds up to the heart cap while still adding weight', () => {
    const { state, events } = applyAction(
      monster({ fullness: 3.5, hungryMinutes: 10 }),
      EnumMonsterAction.FEED,
      MORNING
    )
    expect(state.fullness).toBe(4)
    expect(state.weight).toBe(21)
    expect(state.hungryMinutes).toBe(0)
    expect(events[0].payload).toEqual({ action: EnumMonsterAction.FEED })
  })

  it('trains: +1 strength, -2 weight (not below the form minimum), counts the session', () => {
    const { state } = applyAction(
      monster({ strength: 1, weight: 21 }),
      EnumMonsterAction.TRAIN,
      MORNING
    )
    expect(state.strength).toBe(2)
    expect(state.weight).toBe(20)
    expect(state.trainCount).toBe(1)
    expect(state.lastTrainedAt).toEqual(MORNING)
  })

  it('enforces the training cooldown', () => {
    const trained = monster({ lastTrainedAt: MORNING })
    expect(() =>
      applyAction(trained, EnumMonsterAction.TRAIN, new Date(MORNING.getTime() + 59_000))
    ).toThrow(MonsterRuleError)
    expect(() =>
      applyAction(trained, EnumMonsterAction.TRAIN, new Date(MORNING.getTime() + 60_000))
    ).not.toThrow()
  })

  it('cures sickness with medicine and rejects medicine for a healthy monster', () => {
    const { state } = applyAction(
      monster({ isSick: true, sickMinutes: 100 }),
      EnumMonsterAction.MEDICINE,
      MORNING
    )
    expect(state.isSick).toBe(false)
    expect(state.sickMinutes).toBe(0)
    expect(() => applyAction(monster(), EnumMonsterAction.MEDICINE, MORNING)).toThrow(
      'Monster is not sick'
    )
  })

  it('cleans and toggles the lights', () => {
    expect(applyAction(monster({ poops: 3 }), EnumMonsterAction.CLEAN, MORNING).state.poops).toBe(0)
    expect(applyAction(monster(), EnumMonsterAction.LIGHTS, MORNING).state.lightsOn).toBe(false)
  })

  it.each([EnumMonsterAction.FEED, EnumMonsterAction.VITAMIN, EnumMonsterAction.TRAIN])(
    'rejects %s while asleep',
    action => {
      expect(() => applyAction(monster(), action, BEDTIME)).toThrow('Monster is asleep')
    }
  )

  it('rejects training while sick', () => {
    expect(() => applyAction(monster({ isSick: true }), EnumMonsterAction.TRAIN, MORNING)).toThrow(
      'Monster is sick'
    )
  })

  it('rejects any action on an egg or a dead monster', () => {
    expect(() =>
      applyAction(createEgg(EnumMonsterLine.LEAF, MORNING), EnumMonsterAction.FEED, MORNING)
    ).toThrow('The egg has not hatched yet')
    expect(() =>
      applyAction(monster({ diedAt: MORNING }), EnumMonsterAction.CLEAN, MORNING)
    ).toThrow('Monster is no longer alive')
  })
})

describe('assertCanBattle', () => {
  it('allows an awake, healthy monster with any strength left', () => {
    expect(() => assertCanBattle(monster({ strength: 0.1 }), MORNING)).not.toThrow()
  })

  it.each([
    ['asleep', monster(), BEDTIME, 'Monster is asleep'],
    ['sick', monster({ isSick: true }), MORNING, 'Monster is sick'],
    ['out of strength', monster({ strength: 0 }), MORNING, 'Monster is too weak to fight'],
    ['an egg', createEgg(EnumMonsterLine.FLAME, MORNING), MORNING, 'The egg has not hatched yet'],
  ])('rejects a monster that is %s', (_label, state, at, message) => {
    expect(() => assertCanBattle(state, at)).toThrow(message)
  })
})

describe('applyBattleOutcome', () => {
  it('costs a strength heart and a little weight, and records the win', () => {
    const { state, events } = applyBattleOutcome(
      monster({ strength: 2.5, weight: 25 }),
      true,
      { stageId: 'meadow_1' },
      MORNING
    )
    expect(state.strength).toBeCloseTo(1.5)
    expect(state.weight).toBe(24)
    expect(state.wins).toBe(1)
    expect(state.losses).toBe(0)
    expect(events).toEqual([
      {
        type: EnumMonsterLogType.BATTLE,
        at: MORNING,
        payload: { stageId: 'meadow_1', won: true },
      },
    ])
  })

  it('records a loss and never drops below zero strength or the form minimum weight', () => {
    const { state } = applyBattleOutcome(monster({ strength: 0.4, weight: 20 }), false, {}, MORNING)
    expect(state.strength).toBe(0)
    expect(state.weight).toBe(20)
    expect(state.losses).toBe(1)
  })
})

describe('applyShopItem', () => {
  it('applies each item effect', () => {
    const meat = applyShopItem(monster({ fullness: 1 }), EnumShopItemId.PREMIUM_MEAT, MORNING)
    expect(meat.state.fullness).toBe(3)
    expect(meat.state.weight).toBe(21)

    const protein = applyShopItem(monster({ strength: 3 }), EnumShopItemId.PROTEIN, MORNING)
    expect(protein.state.strength).toBe(4)

    const tea = applyShopItem(monster({ weight: 23 }), EnumShopItemId.DIET_TEA, MORNING)
    expect(tea.state.weight).toBe(20)

    const manual = applyShopItem(monster(), EnumShopItemId.TRAINING_MANUAL, MORNING)
    expect(manual.state.trainCount).toBe(1)
    expect(manual.events[0].payload).toEqual({ itemId: EnumShopItemId.TRAINING_MANUAL })
  })

  it('rejects items while asleep or on an egg', () => {
    expect(() => applyShopItem(monster(), EnumShopItemId.PROTEIN, BEDTIME)).toThrow(
      'Monster is asleep'
    )
    expect(() =>
      applyShopItem(createEgg(EnumMonsterLine.LEAF, MORNING), EnumShopItemId.PROTEIN, MORNING)
    ).toThrow(MonsterRuleError)
  })
})
