import { GACHA_PITY_LIMIT, GACHA_RARITIES, GACHA_RATES, TD_HEROES, TdRarity } from './gacha.config'
import { planPull, pullCount, rollHero } from './gacha'

describe('gacha config', () => {
  it('has 12 heroes: 3 roles x 4 rarities, with unique ids', () => {
    expect(TD_HEROES).toHaveLength(12)
    expect(new Set(TD_HEROES.map(h => h.id)).size).toBe(12)
    for (const role of ['aoe', 'support', 'dps']) {
      expect(
        TD_HEROES.filter(h => h.role === role)
          .map(h => h.rarity)
          .sort()
      ).toEqual(['common', 'epic', 'legendary', 'rare'])
    }
  })

  it('has rates that match the ticket and sum to 100', () => {
    expect(GACHA_RATES).toEqual({ common: 60, rare: 30, epic: 8, legendary: 2 })
    expect(Object.values(GACHA_RATES).reduce((a, b) => a + b, 0)).toBe(100)
  })
})

describe('rollHero', () => {
  it('is deterministic for a seed and pity count', () => {
    expect(rollHero(123456, 0)).toEqual(rollHero(123456, 0))
  })

  it('forces a Legendary on the pull that reaches the pity limit', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const roll = rollHero(seed, GACHA_PITY_LIMIT - 1)
      expect(roll.hero.rarity).toBe('legendary')
      expect(roll.pity).toBe(0)
    }
  })

  it('counts pulls since the last Legendary, and resets on a Legendary', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const roll = rollHero(seed, 10)
      expect(roll.pity).toBe(roll.hero.rarity === 'legendary' ? 0 : 11)
    }
  })

  it('matches the published rates over many seeds (no pity pressure)', () => {
    const n = 40_000
    const counts: Record<TdRarity, number> = { common: 0, rare: 0, epic: 0, legendary: 0 }
    for (let seed = 1; seed <= n; seed++) counts[rollHero(seed, 0).hero.rarity]++
    for (const r of GACHA_RARITIES) {
      expect(Math.abs(counts[r] / n - GACHA_RATES[r] / 100)).toBeLessThan(0.01)
    }
  })

  it('never exceeds the pity limit when pulling repeatedly', () => {
    let pity = 0
    let sinceLegendary = 0
    for (let seed = 1; seed <= 5000; seed++) {
      const roll = rollHero(seed * 7919, pity)
      sinceLegendary = roll.hero.rarity === 'legendary' ? 0 : sinceLegendary + 1
      expect(sinceLegendary).toBeLessThan(GACHA_PITY_LIMIT)
      pity = roll.pity
    }
  })
})

describe('planPull', () => {
  const base = { gems: 10_000, pity: 0, freeClaimedToday: false, owned: new Set<string>() }
  const seeds = (n: number) => Array.from({ length: n }, (_, i) => 1000 + i)

  it('prices a single at 150 and a 10-pull at 1350', () => {
    expect(planPull({ ...base, mode: 'single', seeds: seeds(1) }).cost).toBe(150)
    const ten = planPull({ ...base, mode: 'ten', seeds: seeds(10) })
    expect(ten.cost).toBe(1350)
    expect(ten.pulls).toHaveLength(10)
  })

  it('needs one seed per pull', () => {
    expect(pullCount('single')).toBe(1)
    expect(pullCount('free')).toBe(1)
    expect(pullCount('ten')).toBe(10)
  })

  it('rejects when gems are short, and accepts exactly enough', () => {
    expect(() => planPull({ ...base, gems: 149, mode: 'single', seeds: seeds(1) })).toThrow(
      'Not enough gems'
    )
    expect(() => planPull({ ...base, gems: 1349, mode: 'ten', seeds: seeds(10) })).toThrow(
      'Not enough gems'
    )
    expect(planPull({ ...base, gems: 1350, mode: 'ten', seeds: seeds(10) }).cost).toBe(1350)
  })

  it('makes the free pull cost nothing, once per day', () => {
    expect(planPull({ ...base, gems: 0, mode: 'free', seeds: seeds(1) }).cost).toBe(0)
    expect(() =>
      planPull({ ...base, freeClaimedToday: true, mode: 'free', seeds: seeds(1) })
    ).toThrow('already claimed')
  })

  it('turns a duplicate into shards, including a duplicate inside the same 10-pull', () => {
    const first = rollHero(1000, 0).hero
    const dup = planPull({ ...base, owned: new Set([first.id]), mode: 'single', seeds: [1000] })
    expect(dup.pulls[0]).toMatchObject({ duplicate: true })
    expect(dup.pulls[0].shards).toBeGreaterThan(0)

    const ten = planPull({ ...base, mode: 'ten', seeds: Array(10).fill(1000) })
    expect(ten.pulls[0].duplicate).toBe(false)
    expect(ten.pulls[1].duplicate).toBe(true)
  })

  it('carries pity through a 10-pull and returns the final value', () => {
    const plan = planPull({ ...base, pity: GACHA_PITY_LIMIT - 3, mode: 'ten', seeds: seeds(10) })
    const legendary = plan.pulls.findIndex(p => p.hero.rarity === 'legendary')
    expect(legendary).toBeGreaterThanOrEqual(0)
    expect(legendary).toBeLessThanOrEqual(2)
    expect(plan.pulls[legendary].pityBefore).toBeLessThan(GACHA_PITY_LIMIT)
  })
})
