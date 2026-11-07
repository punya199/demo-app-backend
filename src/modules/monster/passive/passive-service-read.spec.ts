import { PassiveAllocationEntity } from '../../../db/entities/passive-allocation.entity'
import { PVP_SEASON_MIN_FIGHTS } from '../core/monster-rules'
import { getSeason } from '../arena/pvp-season'
import { fakeEtm } from '../core/core-test-helpers'
import {
  ASCENDANCY_MAX_POINTS,
  ASCENDANCY_RESET_GEM_PRICE,
  calcPassivePoints,
  MASTERY_REPICK_GEM_PRICE,
  PASSIVE_BRANCH_REFUND_CAP,
  PASSIVE_FREE_REFUNDS,
  PASSIVE_NODES,
  PASSIVE_RESPEC_GEM_PRICE,
} from './passive-data'
import { loadPassiveBonus } from './passive.service'
import { allocationRow, MASTERY, pathTo, setupPassive } from './passive-test-helpers'

describe('loadPassiveBonus', () => {
  it('reads the owner row and totals its nodes', async () => {
    const etm = fakeEtm()
    etm.findOne.mockResolvedValue(
      allocationRow({ nodeIds: pathTo(MASTERY), masteryPicks: { [MASTERY]: 0 } })
    )
    const bonus = await loadPassiveBonus('user-1', etm)
    expect(etm.findOne).toHaveBeenCalledWith(PassiveAllocationEntity, {
      where: { userId: 'user-1' },
    })
    expect(bonus.hungerDrainMultiplier).toBeLessThanOrEqual(1)
  })

  it('treats a player without a row (or with null columns) as having nothing', async () => {
    const etm = fakeEtm()
    etm.findOne.mockResolvedValueOnce(null)
    const empty = await loadPassiveBonus('user-1', etm)
    etm.findOne.mockResolvedValueOnce({
      nodeIds: null,
      masteryPicks: null,
      ascendancyNodeIds: null,
    })
    await expect(loadPassiveBonus('user-1', etm)).resolves.toEqual(empty)
    expect(empty.hungerDrainMultiplier).toBe(1)
  })
})

describe('PassiveService.getState', () => {
  it('shows an empty tree and zero points for a new player', async () => {
    const { service } = setupPassive()
    const state = await service.getState('user-1')
    expect(state.nodes).toBe(PASSIVE_NODES)
    expect(state.allocated).toEqual([])
    expect(state.masteries).toEqual({})
    expect(state.ascendancy).toEqual({
      path: null,
      nodeIds: [],
      points: { earned: 0, used: 0, left: 0, max: ASCENDANCY_MAX_POINTS },
      resetCost: 0,
      resetPrice: ASCENDANCY_RESET_GEM_PRICE,
      masteryRepickPrice: MASTERY_REPICK_GEM_PRICE,
    })
    expect(state.points).toEqual({
      earned: 0,
      used: 0,
      left: 0,
      sources: {
        dexSpecies: 0,
        raidFirstClears: 0,
        adventureClears: 0,
        totalWins: 0,
        worldBossDefeats: 0,
        pvpSeasons: 0,
      },
    })
    expect(state.respec).toEqual({
      refunded: 0,
      freeLeft: PASSIVE_FREE_REFUNDS,
      gemPrice: PASSIVE_RESPEC_GEM_PRICE,
      branchCap: PASSIVE_BRANCH_REFUND_CAP,
    })
  })

  it('totals every progress source and what the row already spent', async () => {
    const progress = {
      dex: 5,
      raid: 2,
      nightmare: 1,
      adventure: 3,
      wins: 250,
      boss: 2,
      seasons: [1, 5],
    }
    const row = allocationRow({
      nodeIds: ['a', 'b'],
      refundedPoints: 4,
      masteryPicks: { m: 1 },
      ascendancyPath: 'warden',
      ascendancyNodeIds: ['x'],
    })
    const { service, etm } = setupPassive(progress, row)
    const state = await service.getState('user-1')
    const earned = calcPassivePoints({
      dexSpecies: 5,
      raidFirstClears: 2,
      adventureClears: 3,
      totalWins: 250,
      worldBossDefeats: 2,
      pvpSeasonRanks: [1, 5],
    })
    expect(state.points.earned).toBe(earned)
    expect(state.points.used).toBe(2)
    expect(state.points.left).toBe(earned - 2)
    expect(state.points.sources.pvpSeasons).toBe(2)
    expect(state.ascendancy.points).toEqual({ earned: 3, used: 1, left: 2, max: 12 })
    expect(state.ascendancy.path).toBe('warden')
    expect(state.ascendancy.resetCost).toBe(ASCENDANCY_RESET_GEM_PRICE)
    expect(state.masteries).toEqual({ m: 1 })
    expect(state.respec.freeLeft).toBe(PASSIVE_FREE_REFUNDS - 4)
    // The season query is scoped to finished seasons that the player qualified for.
    const seasonCall = (etm.query.mock.calls as unknown[][]).find(([sql]) =>
      String(sql).includes('pvp_ratings')
    )!
    expect(seasonCall[1]).toEqual(['user-1', getSeason(new Date()), PVP_SEASON_MIN_FIGHTS])
  })

  it('never reports negative points left or free refunds', async () => {
    const row = allocationRow({
      nodeIds: ['a', 'b', 'c'],
      refundedPoints: PASSIVE_FREE_REFUNDS + 5,
      ascendancyNodeIds: ['x', 'y'],
    })
    const { service } = setupPassive({}, row)
    const state = await service.getState('user-1')
    expect(state.points.left).toBe(0)
    expect(state.ascendancy.points.left).toBe(0)
    expect(state.respec.freeLeft).toBe(0)
  })

  it('tolerates a row with null columns', async () => {
    const row = {
      nodeIds: null,
      refundedPoints: null,
      masteryPicks: null,
      ascendancyPath: null,
      ascendancyNodeIds: null,
    } as never
    const { service } = setupPassive({}, row)
    const state = await service.getState('user-1')
    expect(state.allocated).toEqual([])
    expect(state.masteries).toEqual({})
    expect(state.respec.refunded).toBe(0)
  })
})
