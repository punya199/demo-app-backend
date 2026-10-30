import { BadRequestException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { WalletEntity } from '../../db/entities/wallet.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
  WalletTransactionEntity,
} from '../../db/entities/wallet-transaction.entity'

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepository: Repository<WalletEntity>
  ) {}

  async getBalance(userId: string) {
    const wallet = await this.walletRepository.findOne({ where: { userId } })
    return { coin: wallet?.coin ?? 0 }
  }

  // Adds (positive) or spends (negative) coins inside the caller's transaction. The wallet row is
  // locked until that transaction ends, so concurrent requests can't double-spend.
  async changeCoin(
    userId: string,
    amount: number,
    reason: EnumWalletTransactionReason,
    refId: string | null,
    etm: EntityManager
  ) {
    await etm
      .createQueryBuilder()
      .insert()
      .into(WalletEntity)
      .values({ userId, coin: 0 })
      .orIgnore()
      .execute()
    const wallet = await etm.findOneOrFail(WalletEntity, {
      where: { userId },
      lock: { mode: 'pessimistic_write' },
    })

    const balanceAfter = wallet.coin + amount
    if (balanceAfter < 0) {
      throw new BadRequestException('Not enough coins')
    }
    wallet.coin = balanceAfter
    await etm.save(WalletEntity, wallet)
    await etm.save(WalletTransactionEntity, {
      userId,
      currency: EnumWalletCurrency.COIN,
      amount,
      balanceAfter,
      reason,
      refId,
    })
    return { coin: balanceAfter }
  }
}
