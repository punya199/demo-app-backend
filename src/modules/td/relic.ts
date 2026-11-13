import { BadRequestException, ConflictException } from '@nestjs/common'
import { RELICS, RELIC_IDS, RelicId } from '../../libs/td-sim'
import { RELIC_UNLOCK_COSTS } from './relic.config'

// What a player has that decides relics: owned hero ids, element of every owned core (equipped or
// not), and the relics already unlocked.
export interface IRelicOwnership {
  heroes: readonly string[]
  coreElements: readonly string[]
  unlocked: readonly string[]
}

const isRelic = (id: string): id is RelicId => RELIC_IDS.includes(id as RelicId)

// Matching rule: the player owns the relic's hero and owns a core of that hero's element.
const matches = (id: RelicId, own: IRelicOwnership) =>
  own.heroes.includes(RELICS[id].hero) && own.coreElements.includes(RELICS[id].element)

// Pure. Decides an unlock from ownership and the player's balances, so the rules are testable
// without a database.
export function planRelicUnlock(
  relicId: string,
  own: IRelicOwnership,
  balances: { coins: number; shards: number }
): { cost: { coins: number; shards: number } } {
  if (!isRelic(relicId)) throw new BadRequestException('Unknown relic')
  if (own.unlocked.includes(relicId)) throw new ConflictException('The relic is already unlocked')
  if (!matches(relicId, own)) {
    throw new BadRequestException('The relic needs its hero and a core of the hero element')
  }
  const cost = RELIC_UNLOCK_COSTS[relicId]
  if (balances.coins < cost.coins) throw new BadRequestException('Not enough coins')
  if (balances.shards < cost.shards) throw new BadRequestException('Not enough shards')
  return { cost }
}

// Pure. The battle's unlocked relics from a player's relic rows; the caller stores the result with
// the battle session so the replay uses this exact snapshot. Unknown ids are dropped and each relic
// counts once, so a bad row can never make the later replay fail validation.
export const battleRelics = (rows: readonly { relicId: string }[]): RelicId[] =>
  RELIC_IDS.filter(id => rows.some(r => r.relicId === id))

// Pure. One relic as the screen draws it.
export const relicView = (id: RelicId, own: IRelicOwnership) => ({
  id,
  hero: RELICS[id].hero,
  element: RELICS[id].element,
  skill: RELICS[id].skill,
  cost: RELIC_UNLOCK_COSTS[id],
  unlocked: own.unlocked.includes(id),
  eligible: matches(id, own),
})
