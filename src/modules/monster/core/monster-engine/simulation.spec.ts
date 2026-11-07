import {
  EnumMonsterDeathCause,
  EnumMonsterLine,
  EnumMonsterStage,
} from '../../../../db/entities/monster.entity'
import { EnumMonsterLogType } from '../../../../db/entities/monster-log.entity'
import { createEgg, getEvolutionProgress, IMonsterState, tick } from './index'
import { LIFESPAN_MINUTES, STAGE_DURATION_MINUTES, STAGE_RATES } from '../monster-rules'
import { NOW, minutesAfter, monster, egg, eventTypes } from './test-fixtures'

describe('createEgg', () => {
  it('marks the owner online', () => {
    const fresh = createEgg(EnumMonsterLine.LEAF, NOW)
    expect(fresh.lastSeenAt).toEqual(NOW)
  })
})

describe('tick', () => {
  it('hatches an egg once its time is up, without aging it', () => {
    const eggDuration = STAGE_DURATION_MINUTES[EnumMonsterStage.EGG]!
    expect(tick(egg(), minutesAfter(NOW, eggDuration - 1)).state.stage).toBe(EnumMonsterStage.EGG)

    const { state, events } = tick(egg(), minutesAfter(NOW, eggDuration))
    expect(state.speciesId).toBe('tide_baby1')
    expect(state.stage).toBe(EnumMonsterStage.BABY_1)
    expect(state.fullness).toBe(2)
    expect(state.strength).toBe(2)
    expect(state.ageMinutes).toBe(0)
    expect(eventTypes(events)).toEqual([EnumMonsterLogType.EVOLVE])
  })

  it('only consumes whole minutes, leaving the remainder for the next tick', () => {
    const { state } = tick(monster(), new Date(NOW.getTime() + 90_000))
    expect(state.lastTickAt).toEqual(minutesAfter(NOW, 1))
    expect(state.ageMinutes).toBe(1)
  })

  it('poops less often with a lower poop rate', () => {
    const every = STAGE_RATES[EnumMonsterStage.ADULT].poopEveryMinutes
    const full = { fullness: 4, strength: 4 }
    expect(tick(monster(full), minutesAfter(NOW, every)).state.poops).toBe(1)
    expect(tick(monster(full), minutesAfter(NOW, every), 1, 0.5).state.poops).toBe(0)
    expect(tick(monster(full), minutesAfter(NOW, every * 2), 1, 0.5).state.poops).toBe(1)
  })

  it('is a no-op for a dead monster', () => {
    const dead = monster({ diedAt: NOW, deathCause: EnumMonsterDeathCause.OLD_AGE })
    const { state, events } = tick(dead, minutesAfter(NOW, 600))
    expect(state).toEqual(dead)
    expect(events).toEqual([])
  })

  it('drains hearts at the stage rate around the clock', () => {
    const { state } = tick(monster(), minutesAfter(NOW, 60))
    expect(state.fullness).toBeCloseTo(3)
    expect(state.strength).toBeCloseTo(4 - 60 / 75)
  })

  it('counts a care mistake after 30 hungry minutes, then every 4 hours', () => {
    const hungry = monster({ fullness: 0 })

    expect(tick(hungry, minutesAfter(NOW, 29)).state.careMistakes).toBe(0)
    expect(tick(hungry, minutesAfter(NOW, 30)).state.careMistakes).toBe(1)
    expect(tick(hungry, minutesAfter(NOW, 269)).state.careMistakes).toBe(1)
    expect(tick(hungry, minutesAfter(NOW, 270)).state.careMistakes).toBe(2)
  })

  it('gets sick when the fourth poop lands', () => {
    const { state, events } = tick(monster({ poops: 3, poopMinutes: 119 }), minutesAfter(NOW, 1))
    expect(state.poops).toBe(4)
    expect(state.isSick).toBe(true)
    expect(eventTypes(events)).toContain(EnumMonsterLogType.SICK)
  })

  it('dies after 12 hours of untreated sickness', () => {
    const sick = monster({ isSick: true })
    expect(tick(sick, minutesAfter(NOW, 719)).state.diedAt).toBeNull()

    const { state, events } = tick(sick, minutesAfter(NOW, 720))
    expect(state.deathCause).toBe(EnumMonsterDeathCause.SICKNESS)
    expect(state.diedAt).toEqual(minutesAfter(NOW, 720))
    expect(eventTypes(events)).toContain(EnumMonsterLogType.DEATH)
  })

  it('dies of old age at the end of its 5-day lifespan', () => {
    expect(LIFESPAN_MINUTES).toBe(5 * 24 * 60)
    const old = monster({ ageMinutes: LIFESPAN_MINUTES - 1 })
    const { state } = tick(old, minutesAfter(NOW, 1))
    expect(state.deathCause).toBe(EnumMonsterDeathCause.OLD_AGE)
  })

  describe('online presence', () => {
    it('counts minutes within 2 minutes of the last request as online, double for evolution', () => {
      const seen = monster({ lastSeenAt: NOW })
      // Minutes 1-2 are online (+2 each), minutes 3-5 offline (+1 each).
      expect(tick(seen, minutesAfter(NOW, 5)).state.stageMinutes).toBe(2 * 2 + 3)
      expect(tick(monster(), minutesAfter(NOW, 5)).state.stageMinutes).toBe(5)
    })

    it('does not speed up aging or hunger', () => {
      const { state } = tick(monster({ lastSeenAt: NOW }), minutesAfter(NOW, 2))
      expect(state.ageMinutes).toBe(2)
      expect(state.fullness).toBeCloseTo(4 - 2 / 60)
    })
  })

  describe('evolution', () => {
    const atStageEnd = (overrides: Partial<IMonsterState>) => {
      const stage = overrides.stage!
      return tick(
        monster({ stageMinutes: STAGE_DURATION_MINUTES[stage]! - 1, ...overrides }),
        minutesAfter(NOW, 1)
      )
    }

    it('branches into the alternate forms for heavily trained or veteran monsters', () => {
      const baby = { speciesId: 'flame_baby2', stage: EnumMonsterStage.BABY_2, careMistakes: 3 }
      expect(atStageEnd({ ...baby, trainCount: 8 }).state.speciesId).toBe('flame_adultAlt')
      expect(atStageEnd({ ...baby, trainCount: 7 }).state.speciesId).toBe('flame_adultGood')

      const adult = {
        speciesId: 'tide_adultAlt',
        stage: EnumMonsterStage.ADULT,
        careMistakes: 2,
        trainCount: 6,
      }
      expect(atStageEnd({ ...adult, wins: 8 }).state.speciesId).toBe('tide_perfectAlt')
      expect(atStageEnd({ ...adult, wins: 7 }).state.speciesId).toBe('tide_perfectGood')

      const perfect = {
        speciesId: 'leaf_perfectAlt',
        stage: EnumMonsterStage.PERFECT,
        careMistakes: 1,
        trainCount: 10,
      }
      expect(atStageEnd({ ...perfect, wins: 12 }).state.speciesId).toBe('leaf_ultimateAlt')
      expect(atStageEnd({ ...perfect, wins: 5 }).state.speciesId).toBe('leaf_ultimate')
    })

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

    it('still evolves when an online minute jumps past the exact duration', () => {
      const { state } = tick(
        monster({
          speciesId: 'flame_baby2',
          stage: EnumMonsterStage.BABY_2,
          stageMinutes: STAGE_DURATION_MINUTES[EnumMonsterStage.BABY_2]! - 1,
          lastSeenAt: NOW,
        }),
        minutesAfter(NOW, 1)
      )
      expect(state.stage).toBe(EnumMonsterStage.ADULT)
    })

    it('needs both low mistakes and enough training for the good perfect form', () => {
      const base = { speciesId: 'leaf_adultGood', stage: EnumMonsterStage.ADULT, careMistakes: 2 }
      expect(atStageEnd({ ...base, trainCount: 6 }).state.speciesId).toBe('leaf_perfectGood')
      expect(atStageEnd({ ...base, trainCount: 5 }).state.speciesId).toBe('leaf_perfectPoor')
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
        trainCount: 10,
      }
      expect(atStageEnd({ ...base, wins: 4 }).state.speciesId).toBe('tide_perfectGood')
      expect(atStageEnd({ ...base, wins: 5 }).state.speciesId).toBe('tide_ultimate')
    })

    it('keeps a perfect form that misses the ultimate conditions, and decides only once', () => {
      const missed = atStageEnd({
        speciesId: 'tide_perfectGood',
        stage: EnumMonsterStage.PERFECT,
        careMistakes: 2,
        trainCount: 20,
        wins: 9,
      })
      expect(missed.state.speciesId).toBe('tide_perfectGood')
      expect(eventTypes(missed.events)).not.toContain(EnumMonsterLogType.EVOLVE)

      // Meeting the conditions later doesn't trigger a second evaluation.
      const later = tick({ ...missed.state, careMistakes: 0 }, minutesAfter(NOW, 30))
      expect(later.state.speciesId).toBe('tide_perfectGood')
    })
  })
})

describe('getEvolutionProgress', () => {
  it('reports the time left and the form the monster is on track for', () => {
    const progress = getEvolutionProgress(
      monster({ speciesId: 'flame_baby2', stage: EnumMonsterStage.BABY_2, stageMinutes: 30 })
    )
    expect(progress.durationMinutes).toBe(90)
    expect(progress.remainingMinutes).toBe(60)
    expect(progress.onlineMultiplier).toBe(2)
    expect(progress.nextSpeciesId).toBe('flame_adultGood')
    expect(progress.rules.map(rule => [rule.to, rule.met])).toEqual([
      ['flame_adultAlt', false],
      ['flame_adultGood', true],
      ['flame_adultPoor', true],
    ])
  })

  it('shows which ultimate conditions are still missing', () => {
    const progress = getEvolutionProgress(
      monster({
        speciesId: 'leaf_perfectGood',
        stage: EnumMonsterStage.PERFECT,
        trainCount: 10,
        wins: 2,
      })
    )
    expect(progress.nextSpeciesId).toBeNull()
    expect(progress.rules).toEqual([
      { to: 'leaf_ultimate', maxCareMistakes: 1, minTrainCount: 10, minWins: 5, met: false },
    ])
  })

  it('has no countdown for a final form, only the lifespan left', () => {
    const progress = getEvolutionProgress(
      monster({
        speciesId: 'leaf_ultimate',
        stage: EnumMonsterStage.ULTIMATE,
        ageMinutes: 100,
      })
    )
    expect(progress.durationMinutes).toBeNull()
    expect(progress.remainingMinutes).toBeNull()
    expect(progress.lifespanRemainingMinutes).toBe(LIFESPAN_MINUTES - 100)
  })
})
