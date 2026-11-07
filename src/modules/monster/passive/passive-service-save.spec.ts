import { BadRequestException } from '@nestjs/common'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import {
  ASCENDANCY_RESET_GEM_PRICE,
  ascendancyRoot,
  IPassiveDraft,
  MASTERY_REPICK_GEM_PRICE,
  PASSIVE_FREE_REFUNDS,
} from './passive-data'
import { allocationRow, MASTERY, pathTo, setupPassive } from './passive-test-helpers'

const chain = pathTo(MASTERY)
const striker = [ascendancyRoot('striker'), 'v2-asc-striker-01']
const draft = (over: Partial<IPassiveDraft> = {}): IPassiveDraft => ({
  nodeIds: [],
  masteries: {},
  ascendancyNodeIds: [],
  ...over,
})
const nightmare = (n: number) => ({ dex: 20, nightmare: n })

describe('PassiveService.save', () => {
  it('stores a valid free draft without charging', async () => {
    const { service, wallet } = setupPassive(nightmare(1), allocationRow())
    const state = await service.save(
      'user-1',
      draft({ nodeIds: chain, masteries: { [MASTERY]: 2 }, ascendancyNodeIds: [striker[0]] })
    )
    expect(state.allocated).toEqual(chain)
    expect(state.masteries).toEqual({ [MASTERY]: 2 })
    expect(state.ascendancy.path).toBe('striker')
    expect(state.ascendancy.nodeIds).toEqual([striker[0]])
    expect(wallet.change).not.toHaveBeenCalled()
  })

  it('clears the ascendancy path for a draft without ascendancy nodes', async () => {
    const row = allocationRow({ ascendancyPath: 'striker', ascendancyNodeIds: [...striker] })
    const { service } = setupPassive(nightmare(1), row)
    // Restarting the ascendancy costs gems; the wallet mock allows it.
    const state = await service.save('user-1', draft())
    expect(state.ascendancy.path).toBeNull()
    expect(state.ascendancy.nodeIds).toEqual([])
  })

  it('rejects an invalid draft with the validation message and writes nothing', async () => {
    const { service, etm, wallet } = setupPassive({ dex: 20 }, allocationRow())
    await expect(service.save('user-1', draft({ nodeIds: [chain[2]] }))).rejects.toThrow(
      new BadRequestException('Those nodes are not one connected tree')
    )
    await expect(
      service.save('user-1', draft({ nodeIds: chain.slice(0, 1) }))
    ).resolves.toBeDefined()
    expect(wallet.change).not.toHaveBeenCalled()
    expect(etm.save).toHaveBeenCalledTimes(1)
  })

  it('rejects more nodes than earned points', async () => {
    const { service } = setupPassive({ dex: 1 }, allocationRow())
    await expect(service.save('user-1', draft({ nodeIds: chain }))).rejects.toThrow(
      new BadRequestException('Not enough passive points')
    )
  })

  it('charges for taken-back points, a changed pick and a restarted ascendancy together', async () => {
    const row = allocationRow({
      nodeIds: [...chain],
      refundedPoints: PASSIVE_FREE_REFUNDS,
      masteryPicks: { [MASTERY]: 0 },
      ascendancyPath: 'striker',
      ascendancyNodeIds: [...striker],
    })
    const { service, wallet, etm } = setupPassive(nightmare(1), row)
    const removed = 1
    const state = await service.save(
      'user-1',
      draft({ nodeIds: chain.slice(0, -1), ascendancyNodeIds: [] })
    )
    // The mastery node was taken back, so only the removal and the ascendancy reset are charged.
    expect(wallet.change).toHaveBeenCalledWith(
      'user-1',
      EnumWalletCurrency.GEM,
      -(removed + ASCENDANCY_RESET_GEM_PRICE),
      EnumWalletTransactionReason.PASSIVE_RESPEC,
      null,
      etm
    )
    expect(state.respec.refunded).toBe(PASSIVE_FREE_REFUNDS + removed)
  })

  it('charges a gem for a changed mastery pick on a kept node', async () => {
    const row = allocationRow({ nodeIds: [...chain], masteryPicks: { [MASTERY]: 0 } })
    const { service, wallet } = setupPassive(nightmare(0), row)
    await service.save('user-1', draft({ nodeIds: chain, masteries: { [MASTERY]: 1 } }))
    expect(wallet.change).toHaveBeenCalledWith(
      'user-1',
      EnumWalletCurrency.GEM,
      -MASTERY_REPICK_GEM_PRICE,
      EnumWalletTransactionReason.PASSIVE_RESPEC,
      null,
      expect.anything()
    )
  })

  it('treats null mastery and ascendancy columns as empty', async () => {
    const row = allocationRow()
    row.masteryPicks = null as never
    row.ascendancyNodeIds = null as never
    const { service } = setupPassive(nightmare(0), row)
    const state = await service.save('user-1', draft({ nodeIds: chain.slice(0, 1) }))
    expect(state.allocated).toEqual(chain.slice(0, 1))
  })
})

describe('PassiveService ascendancy', () => {
  it('takes the path root first and fixes the path', async () => {
    const { service } = setupPassive(nightmare(1), allocationRow())
    const state = await service.allocateAscendancy('user-1', striker[0])
    expect(state.ascendancy.path).toBe('striker')
    expect(state.ascendancy.nodeIds).toEqual([striker[0]])
  })

  it('extends the path with a connected node', async () => {
    const row = allocationRow({ ascendancyPath: 'striker', ascendancyNodeIds: [striker[0]] })
    const { service } = setupPassive(nightmare(2), row)
    const state = await service.allocateAscendancy('user-1', striker[1])
    expect(state.ascendancy.nodeIds).toEqual(striker)
  })

  it('rejects a node on another path or not connected', async () => {
    const row = allocationRow({ ascendancyPath: 'striker', ascendancyNodeIds: [striker[0]] })
    const { service } = setupPassive(nightmare(1), row)
    await expect(service.allocateAscendancy('user-1', ascendancyRoot('warden'))).rejects.toThrow(
      new BadRequestException('That node is not connected to your ascendancy path')
    )
    await expect(service.allocateAscendancy('user-1', 'v2-asc-striker-05')).rejects.toThrow(
      BadRequestException
    )
  })

  it('rejects when the ascendancy pool is spent', async () => {
    const { service, etm } = setupPassive(nightmare(0), allocationRow())
    await expect(service.allocateAscendancy('user-1', striker[0])).rejects.toThrow(
      new BadRequestException('No ascendancy points left')
    )
    expect(etm.save).not.toHaveBeenCalled()
  })

  it('treats null path and node columns as unstarted', async () => {
    const row = allocationRow()
    row.ascendancyPath = undefined as never
    row.ascendancyNodeIds = null as never
    const { service } = setupPassive(nightmare(1), row)
    const state = await service.allocateAscendancy('user-1', striker[0])
    expect(state.ascendancy.nodeIds).toEqual([striker[0]])
  })

  it('reset costs gems and clears path and nodes', async () => {
    const row = allocationRow({ ascendancyPath: 'striker', ascendancyNodeIds: [...striker] })
    const { service, wallet, etm } = setupPassive(nightmare(1), row)
    const state = await service.resetAscendancy('user-1')
    expect(wallet.change).toHaveBeenCalledWith(
      'user-1',
      EnumWalletCurrency.GEM,
      -ASCENDANCY_RESET_GEM_PRICE,
      EnumWalletTransactionReason.PASSIVE_RESPEC,
      'striker',
      etm
    )
    expect(state.ascendancy.path).toBeNull()
    expect(state.ascendancy.nodeIds).toEqual([])
  })

  it('reset refuses when there is nothing to take back, including a null column', async () => {
    const { service, wallet } = setupPassive(nightmare(1), allocationRow())
    await expect(service.resetAscendancy('user-1')).rejects.toThrow(
      new BadRequestException('Nothing to take back')
    )
    const row = allocationRow()
    row.ascendancyNodeIds = null as never
    await expect(setupPassive({}, row).service.resetAscendancy('user-1')).rejects.toThrow(
      BadRequestException
    )
    expect(wallet.change).not.toHaveBeenCalled()
  })
})
