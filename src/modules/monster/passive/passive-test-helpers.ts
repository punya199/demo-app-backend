import { PassiveAllocationEntity } from '../../../db/entities/passive-allocation.entity'
import { fakeDataSource, fakeEtm, fakeInsertBuilder } from '../core/core-test-helpers'
import { PASSIVE_HUB, PASSIVE_NODES } from './passive-data'
import { PassiveService } from './passive.service'

export const MASTERY = 'v2-flame-m0'

const hubTree = () => {
  const byId = new Map(PASSIVE_NODES.map(node => [node.id, node]))
  const via = new Map<string, string>([[PASSIVE_HUB, '']])
  const queue = [PASSIVE_HUB]
  while (queue.length) {
    const id = queue.shift()!
    for (const next of byId.get(id)!.adj) {
      if (!via.has(next)) {
        via.set(next, id)
        queue.push(next)
      }
    }
  }
  return via
}

// Shortest chain of nodes from the hub up to and including `target` (the hub itself excluded).
export const pathTo = (target: string) => {
  const via = hubTree()
  const path: string[] = []
  for (let id = target; id !== PASSIVE_HUB; id = via.get(id)!) {
    path.unshift(id)
  }
  return path
}

// Every main node that hangs off the hub through `first` (that node included).
export const armOf = (first: string) =>
  PASSIVE_NODES.filter(node => node.kind !== 'ascend' && node.id !== PASSIVE_HUB)
    .map(node => node.id)
    .filter(id => pathTo(id)[0] === first)

export interface IProgress {
  dex?: number
  raid?: number
  nightmare?: number
  adventure?: number
  wins?: number
  boss?: number
  seasons?: number[]
}

// Answers the progress queries by their SQL: counts as [{ n }], season ranks as [{ rank }].
export const answerProgress = (progress: IProgress) => (sql: string) => {
  const count = (n = 0) => Promise.resolve([{ n }])
  if (sql.includes('pvp_ratings')) {
    return Promise.resolve((progress.seasons ?? []).map(rank => ({ rank })))
  }
  if (sql.includes('monster_dex')) return count(progress.dex)
  if (sql.includes('nightmare')) return count(progress.nightmare)
  if (sql.includes('raid_progress')) return count(progress.raid)
  if (sql.includes('adventure_progress')) return count(progress.adventure)
  if (sql.includes('world_boss_damage')) return count(progress.boss)
  return count(progress.wins)
}

export const allocationRow = (over: Partial<PassiveAllocationEntity> = {}) =>
  ({
    userId: 'user-1',
    nodeIds: [],
    refundedPoints: 0,
    masteryPicks: {},
    ascendancyPath: null,
    ascendancyNodeIds: [],
    ...over,
  }) as PassiveAllocationEntity

export const setupPassive = (
  progress: IProgress = {},
  row: PassiveAllocationEntity | null = null
) => {
  const etm = fakeEtm()
  etm.query.mockImplementation(answerProgress(progress))
  etm.findOne.mockResolvedValue(row)
  const insert = fakeInsertBuilder({})
  etm.createQueryBuilder.mockReturnValue(insert)
  const wallet = { change: jest.fn().mockResolvedValue({ gem: 1 }) }
  const service = new PassiveService(fakeDataSource(etm) as never, wallet as never)
  return { etm, insert, wallet, service }
}
