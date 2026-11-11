import { BadRequestException } from '@nestjs/common'
import {
  branchOf,
  calcPassiveBonus,
  canDeallocate,
  IPassiveDraft,
  PASSIVE_FREE_REFUNDS,
} from './passive-data'
import { allocationRow, setupPassive } from './passive-test-helpers'

// A saved tree taken from a real player's /passive response: 89 passive points spent, the lightning
// arm carrying First Strike at the far end of its Twin Bolt lane, six mastery picks and eight
// ascendancy (striker) nodes. Node ids are never renamed, so this keeps loading as the tree grows.
const FIRST_STRIKE = 'v2-lightning-2-15'
const SAVED_NODES = [
  'v2-ring-07',
  ...['00', '01', '02', '03', '04', '05', '06', '07', '08'].map(k => `v2-spirit-0-${k}`),
  'v2-spirit-m0',
  ...['09', '10', '11', '12', '13', '14', '15'].map(k => `v2-spirit-0-${k}`),
  'v2-ring-05',
  ...['00', '01', '02', '03', '04', '05', '06', '07', '08'].map(k => `v2-lightning-1-${k}`),
  'v2-lightning-m1',
  ...['08', '09', '10', '11', '12'].map(k => `v2-lightning-2-${k}`),
  ...['09', '10', '11', '12', '13', '14'].map(k => `v2-lightning-1-${k}`),
  'v2-lightning-2-13',
  ...['07', '06', '05', '04', '03'].map(k => `v2-lightning-2-${k}`),
  'v2-lightning-m0',
  ...['02', '01', '00'].map(k => `v2-lightning-2-${k}`),
  'v2-ring-01',
  ...['00', '01', '02'].map(k => `v2-leaf-1-${k}`),
  'v2-ring-06',
  ...['03', '04', '05', '06', '07', '08'].map(k => `v2-leaf-1-${k}`),
  'v2-leaf-m0',
  'v2-leaf-m1',
  ...['09', '10', '11', '12', '13', '14', '15'].map(k => `v2-leaf-1-${k}`),
  'v2-ring-10',
  ...['00', '01', '02', '03', '04', '05', '06', '07'].map(k => `v2-flame-2-${k}`),
  'v2-spirit-1-15',
  'v2-spirit-2-15',
  'v2-lightning-2-14',
  'v2-lightning-1-15',
  'v2-flame-2-08',
  'v2-flame-m1',
  ...['09', '10', '11'].map(k => `v2-flame-2-${k}`),
  FIRST_STRIKE,
]
const SAVED_MASTERIES = {
  'v2-leaf-m0': 1,
  'v2-leaf-m1': 2,
  'v2-flame-m1': 1,
  'v2-spirit-m0': 1,
  'v2-lightning-m0': 2,
  'v2-lightning-m1': 2,
}
const STRIKER = Array.from({ length: 8 }, (_, k) => `v2-asc-striker-${String(k).padStart(2, '0')}`)
// The saved tree's sources; 6 Nightmare clears + 2 world boss kills give the 8 ascendancy points.
const PROGRESS = {
  dex: 53,
  raid: 18,
  nightmare: 6,
  adventure: 20,
  wins: 744,
  boss: 2,
  seasons: [1, 1, 1],
}

const savedRow = () =>
  allocationRow({
    nodeIds: [...SAVED_NODES],
    refundedPoints: 6,
    masteryPicks: { ...SAVED_MASTERIES },
    ascendancyPath: 'striker',
    ascendancyNodeIds: [...STRIKER],
  })

describe('taking First Strike off a saved tree', () => {
  it('starts from a tree that really owns First Strike', () => {
    const bonus = calcPassiveBonus(SAVED_NODES, SAVED_MASTERIES, STRIKER)
    expect(SAVED_NODES).toHaveLength(new Set(SAVED_NODES).size)
    expect(SAVED_NODES).toContain(FIRST_STRIKE)
    expect(bonus.combat.effects.firstStrike).toBe(1)
  })

  it('can drop it on its own: it is the end of its lane, nothing hangs off it', () => {
    expect(canDeallocate(SAVED_NODES, FIRST_STRIKE)).toBe(true)
    expect(branchOf(SAVED_NODES, FIRST_STRIKE)).toEqual([FIRST_STRIKE])
  })

  it('loses the first-strike effect and gets its HP back, the rest of the build unchanged', () => {
    const before = calcPassiveBonus(SAVED_NODES, SAVED_MASTERIES, STRIKER)
    const after = calcPassiveBonus(
      SAVED_NODES.filter(id => id !== FIRST_STRIKE),
      SAVED_MASTERIES,
      STRIKER
    )
    expect(after.combat.effects.firstStrike).toBeUndefined()
    // First Strike costs 12% max HP.
    expect(after.combat.pct.hp - before.combat.pct.hp).toBeCloseTo(0.12, 5)
    expect(after.combat.pct.atk).toBe(before.combat.pct.atk)
    expect(after.combat.pct.def).toBe(before.combat.pct.def)
    expect(after.combat.pct.spd).toBe(before.combat.pct.spd)
    expect(after.combat.effects.critChance).toBe(before.combat.effects.critChance)
    expect(after.combat.effects.doubleStrikeChance).toBe(before.combat.effects.doubleStrikeChance)
  })

  it('deallocate takes only that node, for free, and keeps picks and ascendancy', async () => {
    const { service, wallet, etm } = setupPassive(PROGRESS, savedRow())
    const state = await service.deallocate('user-1', FIRST_STRIKE)

    expect(state.allocated).toEqual(SAVED_NODES.filter(id => id !== FIRST_STRIKE))
    expect(state.allocated).not.toContain(FIRST_STRIKE)
    expect(state.points).toEqual(
      expect.objectContaining({ used: SAVED_NODES.length - 1, left: state.points.earned - 88 })
    )
    expect(state.masteries).toEqual(SAVED_MASTERIES)
    expect(state.ascendancy.path).toBe('striker')
    expect(state.ascendancy.nodeIds).toEqual(STRIKER)
    // 6 points were already taken back; the 7th is still inside the free allowance.
    expect(state.respec.refunded).toBe(7)
    expect(7).toBeLessThanOrEqual(PASSIVE_FREE_REFUNDS)
    expect(wallet.change).not.toHaveBeenCalled()
    expect(etm.save).toHaveBeenCalledTimes(1)
  })

  it('deallocateBranch takes the same single node, not its neighbours', async () => {
    const { service } = setupPassive(PROGRESS, savedRow())
    const state = await service.deallocateBranch('user-1', FIRST_STRIKE)
    expect(state.allocated).toEqual(SAVED_NODES.filter(id => id !== FIRST_STRIKE))
    expect(state.allocated).toContain('v2-lightning-2-14')
    expect(state.allocated).toContain('v2-lightning-1-15')
  })

  it('a full-tree save without First Strike is valid and free', async () => {
    const { service, wallet } = setupPassive(PROGRESS, savedRow())
    const draft: IPassiveDraft = {
      nodeIds: SAVED_NODES.filter(id => id !== FIRST_STRIKE),
      masteries: { ...SAVED_MASTERIES },
      ascendancyNodeIds: [...STRIKER],
    }
    const state = await service.save('user-1', draft)
    expect(state.allocated).not.toContain(FIRST_STRIKE)
    expect(wallet.change).not.toHaveBeenCalled()
  })

  it('taking it back a second time has nothing left to take', async () => {
    const row = savedRow()
    row.nodeIds = row.nodeIds.filter(id => id !== FIRST_STRIKE)
    const { service, etm } = setupPassive(PROGRESS, row)
    await expect(service.deallocate('user-1', FIRST_STRIKE)).rejects.toThrow(
      new BadRequestException('Nothing to take back')
    )
    expect(etm.save).not.toHaveBeenCalled()
  })
})
