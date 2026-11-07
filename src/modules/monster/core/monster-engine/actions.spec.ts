import { EnumMonsterStage } from '../../../../db/entities/monster.entity'
import { EnumMonsterLogType } from '../../../../db/entities/monster-log.entity'
import {
  applyAction,
  applyAdventureSkip,
  applyBattleOutcome,
  applyMinigame,
  applyPvpOutcome,
  applyShopItem,
  assertCanAdventure,
  assertCanBattle,
  claimExpedition,
  EnumMonsterAction,
  IMonsterState,
  MonsterRuleError,
  refillStamina,
  startExpedition,
  tick,
} from './index'
import {
  ADVENTURE_SKIP_MAX_RUNS,
  EXPEDITION_DRAIN_MULTIPLIER,
  EXPEDITION_MAX_MINUTES,
  MINIGAME_COOLDOWN_MS,
} from '../monster-rules'
import { EnumShopItemId } from '../../equipment/shop-data'
import { NOW, minutesAfter, monster, egg } from './test-fixtures'

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
  it('allows a healthy monster even with no strength left', () => {
    expect(() => assertCanBattle(monster({ strength: 0 }))).not.toThrow()
  })

  it.each([
    ['sick', monster({ isSick: true }), 'Monster is sick'],
    ['an egg', egg(), 'The egg has not hatched yet'],
  ])('rejects a monster that is %s', (_label, state, message) => {
    expect(() => assertCanBattle(state)).toThrow(message)
  })
})

describe('adventure stamina cost', () => {
  it('uses a custom cost for the check and the charge', () => {
    expect(() => assertCanAdventure(monster({ stamina: 7 }), 7)).not.toThrow()
    expect(() => assertCanAdventure(monster({ stamina: 6 }), 7)).toThrow('Not enough stamina')
    const { state } = applyBattleOutcome(monster({ stamina: 50 }), true, {}, NOW, 7)
    expect(state.stamina).toBe(43)
  })
})

describe('applyBattleOutcome', () => {
  it('costs stamina and a little weight, and records the win', () => {
    const { state, events } = applyBattleOutcome(
      monster({ weight: 25, stamina: 55 }),
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

  it('records a loss and never drops below the form minimum weight', () => {
    const { state } = applyBattleOutcome(monster({ weight: 20 }), false, {}, NOW)
    expect(state.weight).toBe(20)
    expect(state.losses).toBe(1)
  })

  it('refuses a fight without a full fight worth of stamina', () => {
    expect(() => applyBattleOutcome(monster({ stamina: 9.9 }), true, {}, NOW)).toThrow(
      'Not enough stamina'
    )
  })
})

describe('adventure stamina', () => {
  it('starts full on a new egg', () => {
    expect(egg().stamina).toBe(100)
  })

  it('regains 10 an hour offline and twice that online, capped at 100', () => {
    expect(tick(monster({ stamina: 20 }), minutesAfter(NOW, 60)).state.stamina).toBeCloseTo(30)
    // Online only for the 2 minutes after the last request, then offline.
    const seen = tick(monster({ stamina: 20, lastSeenAt: NOW }), minutesAfter(NOW, 60)).state
    expect(seen.stamina).toBeCloseTo(20 + (2 * 2 * 10) / 60 + (58 * 10) / 60)
    expect(tick(monster({ stamina: 99 }), minutesAfter(NOW, 60)).state.stamina).toBe(100)
  })

  it('does not change while still an egg', () => {
    expect(tick({ ...egg(), stamina: 50 }, minutesAfter(NOW, 1)).state.stamina).toBe(50)
  })

  it('gates adventure fights, but no other mode', () => {
    expect(() => assertCanAdventure(monster({ stamina: 10 }))).not.toThrow()
    expect(() => assertCanAdventure(monster({ stamina: 9 }))).toThrow('Not enough stamina')
    expect(() => assertCanBattle(monster({ stamina: 0 }))).not.toThrow()
  })

  it('pays the mini-game by hits, capped, once per cooldown', () => {
    expect(applyMinigame(monster({ stamina: 0 }), 0, NOW).state.stamina).toBe(10)
    expect(applyMinigame(monster({ stamina: 0 }), 3, NOW).state.stamina).toBe(30)
    expect(applyMinigame(monster({ stamina: 90 }), 3, NOW).state.stamina).toBe(100)
    const played = monster({ lastMinigameAt: NOW })
    expect(() =>
      applyMinigame(played, 2, new Date(NOW.getTime() + MINIGAME_COOLDOWN_MS - 1))
    ).toThrow('Mini-game is not ready yet')
    expect(() =>
      applyMinigame(played, 2, new Date(NOW.getTime() + MINIGAME_COOLDOWN_MS))
    ).not.toThrow()
    expect(() => applyMinigame(monster(), 4, NOW)).toThrow('Invalid mini-game score')
  })

  it('refills to full, refusing when already full', () => {
    expect(refillStamina(monster({ stamina: 12.5 }), NOW).state.stamina).toBe(100)
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

describe('adventure skip', () => {
  it('pays the stamina of every run up front and counts each run as a won fight', () => {
    const start = monster({ stamina: 50, wins: 2, weight: 30 })
    const { state, events } = applyAdventureSkip(start, 'meadow_1', 3, 12, NOW, 10)
    expect(state.stamina).toBe(20)
    expect(state.wins).toBe(5)
    expect(state.losses).toBe(start.losses)
    expect(state.weight).toBeLessThan(30)
    expect(events).toHaveLength(3)
    expect(events[0].payload).toEqual({ stageId: 'meadow_1', won: true, skip: true, reward: 12 })
  })

  it('refuses without stamina for every run, or a run count out of range', () => {
    expect(() => applyAdventureSkip(monster({ stamina: 29 }), 'meadow_1', 3, 12, NOW, 10)).toThrow(
      'Not enough stamina'
    )
    expect(() => applyAdventureSkip(monster({ stamina: 100 }), 'meadow_1', 0, 12, NOW)).toThrow(
      'runs at a time'
    )
    expect(() =>
      applyAdventureSkip(
        monster({ stamina: 100 }),
        'meadow_1',
        ADVENTURE_SKIP_MAX_RUNS + 1,
        12,
        NOW,
        1
      )
    ).toThrow('runs at a time')
    expect(() => applyAdventureSkip(monster({ stamina: 100 }), 'meadow_1', 1.5, 12, NOW)).toThrow(
      'runs at a time'
    )
  })
})

describe('applyPvpOutcome', () => {
  it('costs weight but leaves wins and losses alone', () => {
    const { state, events } = applyPvpOutcome(
      monster({ weight: 30 }),
      true,
      { opponentId: 'x' },
      NOW
    )
    expect(state.weight).toBe(29)
    expect(state.wins).toBe(0)
    expect(state.losses).toBe(0)
    expect(events[0].payload).toMatchObject({ won: true, mode: 'pvp', opponentId: 'x' })
  })

  it('refuses a sick monster or one out on an expedition', () => {
    expect(() => applyPvpOutcome(monster({ isSick: true }), true, {}, NOW)).toThrow('sick')
    expect(() => applyPvpOutcome(monster({ expeditionAreaId: 'meadow' }), true, {}, NOW)).toThrow(
      'expedition'
    )
  })
})
