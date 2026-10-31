import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { WalletEntity } from '../../db/entities/wallet.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
  WalletTransactionEntity,
} from '../../db/entities/wallet-transaction.entity'

export interface IWalletBalance {
  coin: number
  gem: number
  raidToken: number
}

// The wallet column each currency lives in, and the error for running short of it.
const COLUMN = {
  [EnumWalletCurrency.COIN]: 'coin',
  [EnumWalletCurrency.GEM]: 'gem',
  [EnumWalletCurrency.RAID_TOKEN]: 'raidToken',
} as const

const NOT_ENOUGH = {
  [EnumWalletCurrency.COIN]: 'Not enough coins',
  [EnumWalletCurrency.GEM]: 'Not enough gems',
  [EnumWalletCurrency.RAID_TOKEN]: 'Not enough raid tokens',
} as const

const toBalance = (wallet: WalletEntity | null): IWalletBalance => ({
  coin: wallet?.coin ?? 0,
  gem: wallet?.gem ?? 0,
  raidToken: wallet?.raidToken ?? 0,
})

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepository: Repository<WalletEntity>
  ) {}

  async getBalance(userId: string, etm?: EntityManager) {
    const repository = etm ? etm.getRepository(WalletEntity) : this.walletRepository
    const wallet = await repository.findOne({ where: { userId } })
    return toBalance(wallet)
  }

  // Adds (positive) or spends (negative) one currency inside the caller's transaction. The wallet
  // row is locked until that transaction ends, so concurrent requests can't double-spend.
  async change(
    userId: string,
    currency: EnumWalletCurrency,
    amount: number,
    reason: EnumWalletTransactionReason,
    refId: string | null,
    etm: EntityManager
  ) {
    await etm
      .createQueryBuilder()
      .insert()
      .into(WalletEntity)
      .values({ userId, coin: 0, gem: 0 })
      .orIgnore()
      .execute()
    const wallet = await etm.findOneOrFail(WalletEntity, {
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    })

    const column = COLUMN[currency]
    const balanceAfter = wallet[column] + amount
    if (balanceAfter < 0) {
      throw new BadRequestException(NOT_ENOUGH[currency])
    }
    wallet[column] = balanceAfter
    await etm.save(WalletEntity, wallet)
    await etm.save(WalletTransactionEntity, {
      userId,
      currency,
      amount,
      balanceAfter,
      reason,
      refId,
    })
    return toBalance(wallet)
  }
}
