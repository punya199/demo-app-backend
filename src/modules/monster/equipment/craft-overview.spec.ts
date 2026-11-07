import {
  buildCraftOverview,
  CRAFT_CATALYST_CHANCE,
  CRAFT_PITY_AFTER_FAILS,
  CRAFT_RECIPES,
  CRAFT_STEPS,
  recipeNeeds,
} from './craft-data'
import { NOW } from './equipment-test-helpers'

const recipe = CRAFT_RECIPES[0]
const MINUTE = 60_000

const owning = (recipeId = recipe.id) => {
  const target = CRAFT_RECIPES.find(row => row.id === recipeId)!
  return new Map(recipeNeeds(target, false).map(need => [need.itemId, need.qty]))
}

describe('buildCraftOverview', () => {
  it('lists every recipe, can start nothing without materials, and has no queue', () => {
    const overview = buildCraftOverview({
      job: null,
      owned: new Map(),
      pity: new Map(),
      coin: 0,
      now: NOW,
    })
    expect(overview.recipes).toHaveLength(CRAFT_RECIPES.length)
    expect(overview.recipes.some(row => row.canStart)).toBe(false)
    expect(overview.recipes[0].materials.every(need => need.owned === 0)).toBe(true)
    expect(overview.queue).toBeNull()
    expect(overview.coin).toBe(0)
    expect(overview.catalyst).toEqual({
      owned: 0,
      chance: CRAFT_CATALYST_CHANCE,
      pity: CRAFT_STEPS.map(step => ({ step, fails: 0, guaranteeAfter: CRAFT_PITY_AFTER_FAILS })),
    })
  })

  it('can start a recipe only with enough coin and every material', () => {
    const input = { job: null, pity: new Map(), now: NOW }
    const ready = buildCraftOverview({ ...input, owned: owning(), coin: recipe.coin })
    expect(ready.recipes[0].canStart).toBe(true)
    expect(ready.recipes[0].materials.every(need => need.owned === need.qty)).toBe(true)
    const poor = buildCraftOverview({ ...input, owned: owning(), coin: recipe.coin - 1 })
    expect(poor.recipes[0].canStart).toBe(false)
    const short = buildCraftOverview({ ...input, owned: new Map(), coin: recipe.coin })
    expect(short.recipes[0].canStart).toBe(false)
  })

  it('reports a running job with its skip price and blocks starting another', () => {
    const job = {
      recipeId: recipe.id,
      useCatalyst: true,
      startedAt: NOW,
      finishAt: new Date(NOW.getTime() + recipe.minutes * MINUTE),
    }
    const overview = buildCraftOverview({
      job,
      owned: owning(),
      pity: new Map([[recipe.step, 3]]),
      coin: 10_000,
      now: NOW,
    })
    expect(overview.queue).toEqual({
      recipeId: recipe.id,
      useCatalyst: true,
      startedAt: NOW.toISOString(),
      finishAt: job.finishAt.toISOString(),
      status: 'running',
      skipCoin: recipe.coin * 2,
    })
    expect(overview.recipes[0].canStart).toBe(false)
    expect(overview.catalyst.pity.find(row => row.step === recipe.step)!.fails).toBe(3)
  })

  it('reports a finished job as ready and free to skip', () => {
    const job = { recipeId: recipe.id, useCatalyst: false, startedAt: NOW, finishAt: NOW }
    const overview = buildCraftOverview({
      job,
      owned: new Map(),
      pity: new Map(),
      coin: 0,
      now: NOW,
    })
    expect(overview.queue).toMatchObject({ status: 'ready', skipCoin: 0 })
  })

  it('hides the queue when the job names a recipe that no longer exists', () => {
    const job = { recipeId: 'gone', useCatalyst: false, startedAt: NOW, finishAt: NOW }
    const overview = buildCraftOverview({
      job,
      owned: new Map(),
      pity: new Map(),
      coin: 0,
      now: NOW,
    })
    expect(overview.queue).toBeNull()
  })
})
