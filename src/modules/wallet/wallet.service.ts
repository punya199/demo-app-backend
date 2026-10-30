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
}

const toBalance = (wallet: WalletEntity | null): IWalletBalance => ({
  coin: wallet?.coin ?? 0,
  gem: wallet?.gem ?? 0,
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

    const balanceAfter = wallet[currency] + amount
    if (balanceAfter < 0) {
      throw new BadRequestException(
        currency === EnumWalletCurrency.COIN ? 'Not enough coins' : 'Not enough gems'
      )
    }
    wallet[currency] = balanceAfter
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
