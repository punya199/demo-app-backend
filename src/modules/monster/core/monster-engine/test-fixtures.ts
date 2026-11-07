import { EnumMonsterLine, EnumMonsterStage } from '../../../../db/entities/monster.entity'
import { EnumMonsterLogType } from '../../../../db/entities/monster-log.entity'
import { createEgg, IMonsterState } from './index'

export const NOW = new Date('2026-01-01T03:00:00Z')

export const minutesAfter = (date: Date, minutes: number) =>
  new Date(date.getTime() + minutes * 60_000)

// Fixtures are offline (lastSeenAt: null) unless a test opts in, so timing stays predictable.
export const monster = (overrides: Partial<IMonsterState> = {}): IMonsterState => ({
  ...createEgg(EnumMonsterLine.FLAME, NOW),
  speciesId: 'flame_adultGood',
  stage: EnumMonsterStage.ADULT,
  fullness: 4,
  strength: 4,
  weight: 20,
  lastSeenAt: null,
  ...overrides,
})

export const egg = (line = EnumMonsterLine.TIDE) => ({ ...createEgg(line, NOW), lastSeenAt: null })

export const eventTypes = (events: { type: EnumMonsterLogType }[]) =>
  events.map(event => event.type)
