import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { DailyQuestProgressEntity } from '../../db/entities/daily-quest-progress.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../db/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { IMonsterEvent } from './monster-engine'
import {
  countQuestProgress,
  DAILY_QUESTS,
  findQuest,
  getQuestDate,
  getQuestResetAt,
} from './quest-data'

// Adds the events' quest progress for today, capped at each quest's target. One atomic upsert per
// quest, so it is safe inside the caller's transaction without any extra lock.
export const recordQuestProgress = async (
  userId: string,
  now: Date,
  events: IMonsterEvent[],
  etm: EntityManager
) => {
  const questDate = getQuestDate(now)
  for (const [questId, count] of countQuestProgress(events)) {
    const target = findQuest(questId)!.target
    await etm.query(
      `INSERT INTO "daily_quest_progress" ("user_id", "quest_date", "quest_id", "progress")
       VALUES ($1, $2, $3, LEAST($4::int, $5::int))
       ON CONFLICT ("user_id", "quest_date", "quest_id") WHERE deleted_at IS NULL
       DO UPDATE SET "progress" = LEAST($5::int, "daily_quest_progress"."progress" + $4::int), "updated_at" = now()`,
      [userId, questDate, questId, count, target]
    )
  }
}

@Injectable()
export class QuestService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly walletService: WalletService
  ) {}

  async getQuests(userId: string, etm: EntityManager = this.dataSource.manager) {
    const now = new Date()
    const questDate = getQuestDate(now)
    const rows = await etm.find(DailyQuestProgressEntity, { where: { userId, questDate } })
    const byQuest = new Map(rows.map(row => [row.questId, row]))
    return {
      date: questDate,
      resetsAt: getQuestResetAt(now),
      quests: DAILY_QUESTS.map(quest => ({
        ...quest,
        progress: byQuest.get(quest.id)?.progress ?? 0,
        claimed: !!byQuest.get(quest.id)?.claimedAt,
      })),
    }
  }

  async claim(userId: string, questId: string) {
    const quest = findQuest(questId)
    if (!quest) {
      throw new NotFoundException('Quest not found')
    }
    const now = new Date()

    return this.dataSource.transaction(async etm => {
      // One conditional UPDATE decides the claim, so two racing requests can't both pay out.
      const claimed = await etm
        .createQueryBuilder()
        .update(DailyQuestProgressEntity)
        .set({ claimedAt: now })
        .where('user_id = :userId AND quest_date = :questDate AND quest_id = :questId', {
          userId,
          questDate: getQuestDate(now),
          questId,
        })
        .andWhere('claimed_at IS NULL AND progress >= :target', { target: quest.target })
        .execute()
      if (!claimed.affected) {
        throw new BadRequestException('Quest is not complete or was already claimed')
      }

      const wallet = await this.walletService.change(
        userId,
        EnumWalletCurrency.COIN,
        quest.coinReward,
        EnumWalletTransactionReason.DAILY_QUEST,
        questId,
        etm
      )
      return { wallet, ...(await this.getQuests(userId, etm)) }
    })
  }
}
