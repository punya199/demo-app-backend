import {
  EnumMonsterDeathCause,
  EnumMonsterLine,
  EnumMonsterStage,
} from '../../db/entities/monster.entity'
import { EnumMonsterLogType } from '../../db/entities/monster-log.entity'
import {
  applyAction,
  applyBattleOutcome,
  applyMinigame,
  applyShopItem,
  assertAutoBattleReady,
  assertCanBattle,
  claimExpedition,
  createEgg,
  EnumMonsterAction,
  getEvolutionProgress,
  IMonsterState,
  MonsterRuleError,
  refillStamina,
  startExpedition,
  tick,
} from './monster-engine'
import {
  AUTO_BATTLE_COOLDOWN_MS,
  AUTO_BATTLE_STAMINA_COST,
  EXPEDITION_DRAIN_MULTIPLIER,
  EXPEDITION_MAX_MINUTES,
  LIFESPAN_MINUTES,
  MINIGAME_COOLDOWN_MS,
  STAGE_DURATION_MINUTES,
  STAMINA_DRAIN_FULL_MINUTES_OFFLINE,
  STAMINA_DRAIN_FULL_MINUTES_ONLINE,
} from './monster-rules'
import { EnumShopItemId } from './shop-data'

const NOW = new Date('2026-01-01T03:00:00Z')

const minutesAfter = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000)

// Fixtures are offline (lastSeenAt: null) unless a test opts in, so timing stays predictable.
const monster = (overrides: Partial<IMonsterState> = {}): IMonsterState => ({
  ...createEgg(EnumMonsterLine.FLAME, NOW),
  speciesId: 'flame_adultGood',
  stage: EnumMonsterStage.ADULT,
  fullness: 4,
  strength: 4,
  weight: 20,
  lastSeenAt: null,
  ...overrides,
})

const egg = (line = EnumMonsterLine.TIDE) => ({ ...createEgg(line, NOW), lastSeenAt: null })

const eventTypes = (events: { type: EnumMonsterLogType }[]) => events.map(event => event.type)

describe('createEgg', () => {
  it('starts with full stamina and marks the owner online', () => {
    const fresh = createEgg(EnumMonsterLine.LEAF, NOW)
    expect(fresh.stamina).toBe(100)
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

    it('drains stamina half as fast online', () => {
      const offline = tick(monster(), minutesAfter(NOW, 2)).state.stamina
      const online = tick(monster({ lastSeenAt: NOW }), minutesAfter(NOW, 2)).state.stamina
      expect(100 - offline).toBeCloseTo((2 * 100) / STAMINA_DRAIN_FULL_MINUTES_OFFLINE)
      expect(100 - online).toBeCloseTo((2 * 100) / STAMINA_DRAIN_FULL_MINUTES_ONLINE)
    })

    it('runs stamina down to 0 and no further', () => {
      const { state } = tick(monster(), minutesAfter(NOW, STAMINA_DRAIN_FULL_MINUTES_OFFLINE + 30))
      expect(state.stamina).toBe(0)
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

describe('applyAction', () => {
  it('feeds up to the heart cap while still adding weight', () => {
    const { state, events } = applyAction(
      monster({ fullness: 3.5, hungryMinutes: 10 }),
      EnumMonsterAction.FEED,
      NOW
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
      NOW
    )
    expect(state.strength).toBe(2)
    expect(state.weight).toBe(20)
    expect(state.trainCount).toBe(1)
    expect(state.lastTrainedAt).toEqual(NOW)
  })

  it('enforces the training cooldown', () => {
    const trained = monster({ lastTrainedAt: NOW })
    expect(() =>
      applyAction(trained, EnumMonsterAction.TRAIN, new Date(NOW.getTime() + 59_000))
    ).toThrow(MonsterRuleError)
    expect(() =>
      applyAction(trained, EnumMonsterAction.TRAIN, new Date(NOW.getTime() + 60_000))
    ).not.toThrow()
  })

  it('cures sickness with medicine and rejects medicine for a healthy monster', () => {
    const { state } = applyAction(
      monster({ isSick: true, sickMinutes: 100 }),
      EnumMonsterAction.MEDICINE,
      NOW
    )
    expect(state.isSick).toBe(false)
    expect(state.sickMinutes).toBe(0)
    expect(() => applyAction(monster(), EnumMonsterAction.MEDICINE, NOW)).toThrow(
      'Monster is not sick'
    )
  })

  it('cleans', () => {
    expect(applyAction(monster({ poops: 3 }), EnumMonsterAction.CLEAN, NOW).state.poops).toBe(0)
  })

  it('rejects training while sick', () => {
    expect(() => applyAction(monster({ isSick: true }), EnumMonsterAction.TRAIN, NOW)).toThrow(
      'Monster is sick'
    )
  })

  it('rejects any action on an egg or a dead monster', () => {
    expect(() => applyAction(egg(), EnumMonsterAction.FEED, NOW)).toThrow(
      'The egg has not hatched yet'
    )
    expect(() => applyAction(monster({ diedAt: NOW }), EnumMonsterAction.CLEAN, NOW)).toThrow(
      'Monster is no longer alive'
    )
  })
})

describe('assertCanBattle', () => {
  it('allows a healthy monster even with no stamina or strength left', () => {
    expect(() => assertCanBattle(monster({ stamina: 0, strength: 0 }))).not.toThrow()
  })

  it.each([
    ['sick', monster({ isSick: true }), 'Monster is sick'],
    ['an egg', egg(), 'The egg has not hatched yet'],
  ])('rejects a monster that is %s', (_label, state, message) => {
    expect(() => assertCanBattle(state)).toThrow(message)
  })
})

describe('applyBattleOutcome', () => {
  it('costs stamina and a little weight, and records the win', () => {
    const { state, events } = applyBattleOutcome(
      monster({ stamina: 55, weight: 25 }),
      true,
      { stageId: 'meadow_1' },
      NOW
    )
    expect(state.stamina).toBe(45)
    expect(state.strength).toBe(4)
    expect(state.weight).toBe(24)
    expect(state.wins).toBe(1)
    expect(events).toEqual([
      {
        type: EnumMonsterLogType.BATTLE,
        at: NOW,
        payload: { stageId: 'meadow_1', won: true },
      },
    ])
  })

  it('records a loss and never drops below zero stamina or the form minimum weight', () => {
    const { state } = applyBattleOutcome(monster({ stamina: 4, weight: 20 }), false, {}, NOW)
    expect(state.stamina).toBe(0)
    expect(state.weight).toBe(20)
    expect(state.losses).toBe(1)
  })
})

describe('applyMinigame', () => {
  it('pays stamina by hits, capped at the maximum', () => {
    expect(applyMinigame(monster({ stamina: 0 }), 0, NOW).state.stamina).toBe(10)
    expect(applyMinigame(monster({ stamina: 0 }), 3, NOW).state.stamina).toBe(30)
    expect(applyMinigame(monster({ stamina: 90 }), 3, NOW).state.stamina).toBe(100)
  })

  it('enforces the cooldown', () => {
    const played = monster({ lastMinigameAt: NOW })
    expect(() =>
      applyMinigame(played, 2, new Date(NOW.getTime() + MINIGAME_COOLDOWN_MS - 1))
    ).toThrow('Mini-game is not ready yet')
    expect(() =>
      applyMinigame(played, 2, new Date(NOW.getTime() + MINIGAME_COOLDOWN_MS))
    ).not.toThrow()
  })

  it('rejects an impossible score', () => {
    expect(() => applyMinigame(monster(), 4, NOW)).toThrow('Invalid mini-game score')
  })
})

describe('refillStamina', () => {
  it('fills stamina to the maximum', () => {
    expect(refillStamina(monster({ stamina: 12.5 }), NOW).state.stamina).toBe(100)
  })

  it('refuses when already full', () => {
    expect(() => refillStamina(monster({ stamina: 100 }), NOW)).toThrow('Stamina is already full')
  })
})

describe('applyShopItem', () => {
  it('applies each item effect', () => {
    const meat = applyShopItem(monster({ fullness: 1 }), EnumShopItemId.PREMIUM_MEAT, NOW)
    expect(meat.state.fullness).toBe(3)
    expect(meat.state.weight).toBe(21)

    const protein = applyShopItem(monster({ strength: 3 }), EnumShopItemId.PROTEIN, NOW)
    expect(protein.state.strength).toBe(4)

    const tea = applyShopItem(monster({ weight: 23 }), EnumShopItemId.DIET_TEA, NOW)
    expect(tea.state.weight).toBe(20)

    const manual = applyShopItem(monster(), EnumShopItemId.TRAINING_MANUAL, NOW)
    expect(manual.state.trainCount).toBe(1)
    expect(manual.events[0].payload).toEqual({ itemId: EnumShopItemId.TRAINING_MANUAL })
  })

  it('rejects items on an egg', () => {
    expect(() => applyShopItem(egg(), EnumShopItemId.PROTEIN, NOW)).toThrow(MonsterRuleError)
  })
})

describe('expedition', () => {
  const away = (overrides: Partial<IMonsterState> = {}) =>
    startExpedition(monster(overrides), 'meadow', 100, NOW).state

  it('collects minutes while healthy and drains care at the reduced rate', () => {
    const home = tick(monster(), minutesAfter(NOW, 60)).state
    const out = tick(away(), minutesAfter(NOW, 60)).state
    expect(out.expeditionMinutes).toBe(60)
    expect(4 - out.fullness).toBeCloseTo((4 - home.fullness) * EXPEDITION_DRAIN_MULTIPLIER)
  })

  it('heads home on its own after the time limit and stops collecting', () => {
    // A perfect-form monster has enough fullness for the whole trip; an adult only just does.
    const { state, events } = tick(
      away({ stage: EnumMonsterStage.PERFECT }),
      minutesAfter(NOW, EXPEDITION_MAX_MINUTES + 60)
    )
    expect(state.expeditionMinutes).toBe(EXPEDITION_MAX_MINUTES)
    expect(state.expeditionReturned).toBe(true)
    expect(events.filter(event => event.payload.action === 'expedition_return')).toHaveLength(1)
  })

  it('heads home when it falls sick, keeping what it gathered', () => {
    // 1 heart of fullness lasts 60 minutes as an adult, halved while exploring: empty at 120.
    const { state } = tick(away({ fullness: 1 }), minutesAfter(NOW, 300))
    expect(state.expeditionReturned).toBe(true)
    expect(state.expeditionMinutes).toBeGreaterThan(100)
    expect(state.expeditionMinutes).toBeLessThan(125)
    // Feeding it afterwards does not send it back out.
    const before = state.expeditionMinutes
    expect(
      tick(applyAction(state, EnumMonsterAction.FEED, NOW).state, minutesAfter(NOW, 400)).state
        .expeditionMinutes
    ).toBe(before)
  })

  it('blocks battles and a second trip, and refuses a sick monster', () => {
    expect(() => assertCanBattle(away())).toThrow('on an expedition')
    expect(() => startExpedition(away(), 'coast', 100, NOW)).toThrow('already on an expedition')
    expect(() => startExpedition(monster({ isSick: true }), 'meadow', 100, NOW)).toThrow('unwell')
    expect(() => startExpedition(monster({ fullness: 0 }), 'meadow', 100, NOW)).toThrow('unwell')
  })

  it('clears the trip when collected, and only works on a trip', () => {
    const out = tick(away(), minutesAfter(NOW, 30)).state
    const { state, events } = claimExpedition(out, { coins: 50, items: [] }, NOW)
    expect(state.expeditionAreaId).toBeNull()
    expect(state.expeditionMinutes).toBe(0)
    expect(events[0].payload).toMatchObject({ action: 'expedition_claim', minutes: 30, coins: 50 })
    expect(() => claimExpedition(monster(), { coins: 0, items: [] }, NOW)).toThrow(
      'not on an expedition'
    )
  })
})

describe('auto-battle', () => {
  it('costs less stamina and is rate-limited', () => {
    const { state } = applyBattleOutcome(monster(), true, {}, NOW, true)
    expect(state.stamina).toBe(100 - AUTO_BATTLE_STAMINA_COST)
    expect(() => assertAutoBattleReady(state, minutesAfter(NOW, 0))).toThrow('not ready')
    expect(() =>
      assertAutoBattleReady(state, new Date(NOW.getTime() + AUTO_BATTLE_COOLDOWN_MS))
    ).not.toThrow()
  })
})
