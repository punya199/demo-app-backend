import { BadRequestException } from '@nestjs/common'
import { PassiveAllocationEntity } from '../../../db/entities/passive-allocation.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import {
  MASTERY_REPICK_GEM_PRICE,
  PASSIVE_BRANCH_REFUND_CAP,
  PASSIVE_FREE_REFUNDS,
  PASSIVE_HUB,
  getPassiveNode,
} from './passive-data'
import { allocationRow, armOf, MASTERY, pathTo, setupPassive } from './passive-test-helpers'

const firstNode = getPassiveNode(PASSIVE_HUB)!.adj[0]
const chain = pathTo(MASTERY)

describe('PassiveService.allocate', () => {
  it('creates the row on first use and locks it', async () => {
    const { service, insert, etm } = setupPassive({ dex: 3 }, allocationRow())
    await service.allocate('user-1', firstNode)
    expect(insert.into).toHaveBeenCalledWith(PassiveAllocationEntity)
    expect(insert.values).toHaveBeenCalledWith({ userId: 'user-1', nodeIds: [], refundedPoints: 0 })
    expect(insert.orIgnore).toHaveBeenCalled()
    expect(etm.findOne).toHaveBeenCalledWith(PassiveAllocationEntity, {
      where: { userId: 'user-1' },
      lock: { mode: 'pessimistic_write' },
    })
  })

  it('takes a node next to the hub and returns the new state', async () => {
    const { service, etm } = setupPassive({ dex: 3 }, allocationRow())
    const state = await service.allocate('user-1', firstNode)
    expect(state.allocated).toEqual([firstNode])
    expect(state.points).toEqual(expect.objectContaining({ earned: 3, used: 1, left: 2 }))
    expect(etm.save).toHaveBeenCalledWith(
      PassiveAllocationEntity,
      expect.objectContaining({ nodeIds: [firstNode] })
    )
  })

  it('rejects a node that is not connected, before reading progress', async () => {
    const { service, etm } = setupPassive({ dex: 3 }, allocationRow())
    await expect(service.allocate('user-1', chain[2])).rejects.toThrow(
      new BadRequestException('That node is not connected to your tree')
    )
    expect(etm.query).not.toHaveBeenCalled()
  })

  it('rejects when every earned point is spent', async () => {
    const { service, etm } = setupPassive({ dex: 1 }, allocationRow({ nodeIds: [chain[0]] }))
    await expect(service.allocate('user-1', chain[1])).rejects.toThrow(
      new BadRequestException('No passive points left')
    )
    expect(etm.save).not.toHaveBeenCalled()
  })
})

describe('PassiveService.deallocate / respec', () => {
  it('takes back a leaf for free while free refunds last', async () => {
    const row = allocationRow({ nodeIds: [...chain], masteryPicks: { [MASTERY]: 1 } })
    const { service, wallet } = setupPassive({ dex: 10 }, row)
    const state = await service.deallocate('user-1', MASTERY)
    expect(state.allocated).toEqual(chain.slice(0, -1))
    expect(state.masteries).toEqual({})
    expect(state.respec.refunded).toBe(1)
    expect(wallet.change).not.toHaveBeenCalled()
  })

  it('charges a gem once the free refunds are used up', async () => {
    const row = allocationRow({ nodeIds: [...chain], refundedPoints: PASSIVE_FREE_REFUNDS })
    const { service, wallet, etm } = setupPassive({ dex: 10 }, row)
    await service.deallocate('user-1', MASTERY)
    expect(wallet.change).toHaveBeenCalledWith(
      'user-1',
      EnumWalletCurrency.GEM,
      -1,
      EnumWalletTransactionReason.PASSIVE_RESPEC,
      null,
      etm
    )
  })

  it('keeps mastery picks of nodes that stay', async () => {
    const other = { 'other-node': 2 }
    const row = allocationRow({ nodeIds: [...chain], masteryPicks: { ...other, [MASTERY]: 1 } })
    const { service } = setupPassive({ dex: 10 }, row)
    const state = await service.deallocate('user-1', MASTERY)
    expect(state.masteries).toEqual(other)
  })

  it('refuses a node you do not own', async () => {
    const { service, wallet } = setupPassive({}, allocationRow({ nodeIds: [chain[0]] }))
    await expect(service.deallocate('user-1', chain[1])).rejects.toThrow(
      new BadRequestException('Nothing to take back')
    )
    expect(wallet.change).not.toHaveBeenCalled()
  })

  it('refuses a node other owned nodes hang off', async () => {
    const { service } = setupPassive({}, allocationRow({ nodeIds: [...chain] }))
    await expect(service.deallocate('user-1', chain[0])).rejects.toThrow(
      new BadRequestException('Other nodes depend on this one')
    )
  })

  it('respec takes back the whole tree, charging only beyond the free refunds', async () => {
    const row = allocationRow({ nodeIds: [...chain], refundedPoints: PASSIVE_FREE_REFUNDS - 1 })
    const { service, wallet } = setupPassive({ dex: 10 }, row)
    const state = await service.respec('user-1')
    expect(state.allocated).toEqual([])
    expect(state.respec.refunded).toBe(PASSIVE_FREE_REFUNDS - 1 + chain.length)
    expect(wallet.change).toHaveBeenCalledWith(
      'user-1',
      EnumWalletCurrency.GEM,
      -(chain.length - 1),
      EnumWalletTransactionReason.PASSIVE_RESPEC,
      null,
      expect.anything()
    )
  })

  it('respec on an empty tree has nothing to take back', async () => {
    const { service } = setupPassive({}, allocationRow())
    await expect(service.respec('user-1')).rejects.toThrow(
      new BadRequestException('Nothing to take back')
    )
  })

  it('tolerates null mastery picks on the row', async () => {
    const row = allocationRow({ nodeIds: [chain[0]] })
    row.masteryPicks = null as never
    const { service } = setupPassive({ dex: 5 }, row)
    const state = await service.deallocate('user-1', chain[0])
    expect(state.masteries).toEqual({})
  })
})

describe('PassiveService.deallocateBranch', () => {
  it('takes a node with everything hanging off it', async () => {
    const row = allocationRow({ nodeIds: [...chain] })
    const { service } = setupPassive({ dex: 10 }, row)
    const state = await service.deallocateBranch('user-1', chain[0])
    expect(state.allocated).toEqual([])
    expect(state.respec.refunded).toBe(chain.length)
  })

  it('refuses a node you do not own', async () => {
    const { service } = setupPassive({}, allocationRow({ nodeIds: [chain[0]] }))
    await expect(service.deallocateBranch('user-1', chain[1])).rejects.toThrow(
      new BadRequestException('Nothing to take back')
    )
  })

  it('refuses on an empty tree', async () => {
    const row = allocationRow({ nodeIds: [] })
    const { service } = setupPassive({}, row)
    await expect(service.deallocateBranch('user-1', chain[0])).rejects.toThrow(
      new BadRequestException('Nothing to take back')
    )
  })

  it('never charges more than the branch cap', async () => {
    const long = armOf(firstNode)
    expect(long.length).toBeGreaterThan(PASSIVE_BRANCH_REFUND_CAP)
    const row = allocationRow({ nodeIds: [...long], refundedPoints: PASSIVE_FREE_REFUNDS })
    const { service, wallet } = setupPassive({ dex: 33 }, row)
    await service.deallocateBranch('user-1', firstNode)
    expect(wallet.change).toHaveBeenCalledWith(
      'user-1',
      EnumWalletCurrency.GEM,
      -PASSIVE_BRANCH_REFUND_CAP,
      EnumWalletTransactionReason.PASSIVE_RESPEC,
      null,
      expect.anything()
    )
  })
})

describe('PassiveService.pickMastery', () => {
  it('picks a mastery option for free the first time', async () => {
    const { service, wallet } = setupPassive({ dex: 10 }, allocationRow({ nodeIds: [...chain] }))
    const state = await service.pickMastery('user-1', MASTERY, 1)
    expect(state.masteries).toEqual({ [MASTERY]: 1 })
    expect(wallet.change).not.toHaveBeenCalled()
  })

  it('works when the row has no picks yet (null column)', async () => {
    const row = allocationRow({ nodeIds: [...chain] })
    row.masteryPicks = null as never
    const { service } = setupPassive({ dex: 10 }, row)
    const state = await service.pickMastery('user-1', MASTERY, 0)
    expect(state.masteries).toEqual({ [MASTERY]: 0 })
  })

  it('charges a gem to change an existing pick', async () => {
    const row = allocationRow({ nodeIds: [...chain], masteryPicks: { [MASTERY]: 0 } })
    const { service, wallet, etm } = setupPassive({ dex: 10 }, row)
    const state = await service.pickMastery('user-1', MASTERY, 2)
    expect(state.masteries).toEqual({ [MASTERY]: 2 })
    expect(wallet.change).toHaveBeenCalledWith(
      'user-1',
      EnumWalletCurrency.GEM,
      -MASTERY_REPICK_GEM_PRICE,
      EnumWalletTransactionReason.PASSIVE_RESPEC,
      MASTERY,
      etm
    )
  })

  it('refuses re-picking the same option', async () => {
    const row = allocationRow({ nodeIds: [...chain], masteryPicks: { [MASTERY]: 1 } })
    const { service, wallet } = setupPassive({ dex: 10 }, row)
    await expect(service.pickMastery('user-1', MASTERY, 1)).rejects.toThrow(
      new BadRequestException('That option is already picked')
    )
    expect(wallet.change).not.toHaveBeenCalled()
  })

  it.each([
    ['a mastery you do not own', MASTERY, 0, []],
    ['a node that is not a mastery', chain[0], 0, chain],
    ['an out-of-range option', MASTERY, 3, chain],
  ])('refuses %s', async (_label, nodeId, option, owned) => {
    const { service } = setupPassive({ dex: 10 }, allocationRow({ nodeIds: [...owned] }))
    await expect(service.pickMastery('user-1', nodeId, option)).rejects.toThrow(
      new BadRequestException('Take this mastery first, then pick one of its options')
    )
  })
})
