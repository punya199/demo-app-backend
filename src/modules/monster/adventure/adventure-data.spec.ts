import { ADVENTURE_AREAS, findAdventureStage, isStageUnlocked } from './adventure-data'

const allStageIds = ADVENTURE_AREAS.flatMap(area => area.stages.map(stage => stage.id))

describe('adventure data', () => {
  it('has unique stage ids and exactly one boss, last, per area', () => {
    expect(new Set(allStageIds).size).toBe(allStageIds.length)
    for (const area of ADVENTURE_AREAS) {
      expect(area.stages.filter(stage => stage.isBoss)).toEqual([
        area.stages[area.stages.length - 1],
      ])
    }
  })

  it('finds stages with their area', () => {
    expect(findAdventureStage('coast_2')?.area.id).toBe('coast')
    expect(findAdventureStage('nope')).toBeUndefined()
  })
})

describe('isStageUnlocked', () => {
  it('opens only the first stage for a new player', () => {
    expect(isStageUnlocked('meadow_1', new Set())).toBe(true)
    expect(isStageUnlocked('meadow_2', new Set())).toBe(false)
  })

  it('opens the next stage, including across areas after a boss', () => {
    expect(isStageUnlocked('meadow_2', new Set(['meadow_1']))).toBe(true)
    expect(isStageUnlocked('coast_1', new Set(['meadow_3']))).toBe(false)
    expect(isStageUnlocked('coast_1', new Set(['meadow_boss']))).toBe(true)
  })

  it('rejects unknown stages', () => {
    expect(isStageUnlocked('nope', new Set(allStageIds))).toBe(false)
  })
})
