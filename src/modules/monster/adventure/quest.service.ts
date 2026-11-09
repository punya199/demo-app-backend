import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Between, DataSource, EntityManager, In } from 'typeorm'
import { DailyQuestProgressEntity } from '../../../db/entities/daily-quest-progress.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { WalletService } from '../../wallet/wallet.service'
import { IMonsterEvent } from '../core/monster-engine'
import {
  countQuestProgress,
  DAILY_QUESTS,
  findQuest,
  getLoginMonthRange,
  getLoginStatus,
  getQuestDate,
  getQuestPeriod,
  LOGIN_QUEST_ID,
  LOGIN_REWARDS,
  rollLoginBox,
  getQuestResetAt,
  IQuest,
  WEEKLY_QUESTS,
} from './quest-data'
import { getWeek } from '../boss/world-boss-data'
import { grantCostume } from '../equipment/costume-grant'
import { addToBag } from '../inventory/inventory-bag'

// Adds the events' quest progress for today (daily) and this week (weekly), capped at each quest's target. One atomic upsert per
// quest, so it is safe inside the caller's transaction without any extra lock.
export const recordQuestProgress = async (
  userId: string,
  now: Date,
  events: IMonsterEvent[],
  etm: EntityManager
) => {
  for (const [questId, count] of countQuestProgress(events)) {
    const quest = findQuest(questId)!
    const target = quest.target
    const questDate = getQuestPeriod(quest, now)
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
    const week = getWeek(now)
    const rows = await etm.find(DailyQuestProgressEntity, {
      where: { userId, questDate: In([questDate, week.key]) },
    })
    // Quest ids are unique across both sets, so the period key never collides.
    const byQuest = new Map(rows.map(row => [row.questId, row]))
    const view = (quest: IQuest) => ({
      ...quest,
      progress: byQuest.get(quest.id)?.progress ?? 0,
      claimed: !!byQuest.get(quest.id)?.claimedAt,
    })
    // The login board is per Thai month, so only this month's claims count.
    const logins = await etm.find(DailyQuestProgressEntity, {
      where: {
        userId,
        questId: LOGIN_QUEST_ID,
        questDate: Between(...getLoginMonthRange(questDate)),
      },
    })
    return {
      date: questDate,
      login: {
        ...getLoginStatus(new Set(logins.map(row => row.questDate)), questDate),
        rewards: LOGIN_REWARDS,
      },
      resetsAt: getQuestResetAt(now),
      quests: DAILY_QUESTS.map(view),
      weekly: { week: week.key, resetsAt: week.endsAt, quests: WEEKLY_QUESTS.map(view) },
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
          questDate: getQuestPeriod(quest, now),
          questId,
        })
        .andWhere('claimed_at IS NULL AND progress >= :target', { target: quest.target })
        .execute()
      if (!claimed.affected) {
        throw new BadRequestException('Quest is not complete or was already claimed')
      }

      const reason =
        quest.period === 'weekly'
          ? EnumWalletTransactionReason.WEEKLY_QUEST
          : EnumWalletTransactionReason.DAILY_QUEST
      let wallet = await this.walletService.change(
        userId,
        EnumWalletCurrency.COIN,
        quest.coinReward,
        reason,
        questId,
        etm
      )
      if (quest.gemReward > 0) {
        wallet = await this.walletService.change(
          userId,
          EnumWalletCurrency.GEM,
          quest.gemReward,
          reason,
          questId,
          etm
        )
      }
      return { wallet, ...(await this.getQuests(userId, etm)) }
    })
  }

  async claimLogin(userId: string) {
    const now = new Date()
    const today = getQuestDate(now)

    return this.dataSource.transaction(async etm => {
      const logins = await etm.find(DailyQuestProgressEntity, {
        where: {
          userId,
          questId: LOGIN_QUEST_ID,
          questDate: Between(...getLoginMonthRange(today)),
        },
      })
      const { reward: slot } = getLoginStatus(new Set(logins.map(row => row.questDate)), today)
      if (!slot) {
        throw new BadRequestException('All login rewards this month were already claimed')
      }

      // The unique (user, date, quest) index decides the claim, so two racing requests can't both pay.
      const inserted = await etm.query<{ id: string }[]>(
        `INSERT INTO "daily_quest_progress" ("user_id", "quest_date", "quest_id", "progress", "claimed_at")
         VALUES ($1, $2, $3, 1, $4)
         ON CONFLICT ("user_id", "quest_date", "quest_id") WHERE deleted_at IS NULL DO NOTHING
         RETURNING "id"`,
        [userId, today, LOGIN_QUEST_ID, now]
      )
      if (!inserted.length) {
        throw new BadRequestException('Login reward was already claimed today')
      }

      // A box is opened on the spot; its prize is added to the slot's own coin, gem and items.
      const box = slot.box ? rollLoginBox(slot.box) : null
      const granted = {
        coin: slot.coin + (box?.coin ?? 0),
        gem: slot.gem + (box?.gem ?? 0),
        items: [...(slot.items ?? []), ...(box?.items ?? [])],
        costume:
          slot.costume && (await grantCostume(userId, slot.costume, etm)) ? slot.costume : null,
      }

      const reason = EnumWalletTransactionReason.LOGIN_REWARD
      if (granted.coin > 0) {
        await this.walletService.change(
          userId,
          EnumWalletCurrency.COIN,
          granted.coin,
          reason,
          today,
          etm
        )
      }
      if (granted.gem > 0) {
        await this.walletService.change(
          userId,
          EnumWalletCurrency.GEM,
          granted.gem,
          reason,
          today,
          etm
        )
      }
      for (const { itemId, qty } of granted.items) {
        await addToBag(etm, userId, itemId, qty)
      }
      const wallet = await this.walletService.getBalance(userId, etm)
      return { wallet, granted, ...(await this.getQuests(userId, etm)) }
    })
  }
}
