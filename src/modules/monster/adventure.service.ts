import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { DataSource, EntityManager } from 'typeorm'
import { AdventureProgressEntity } from '../../db/entities/adventure-progress.entity'
import { WalletTransactionEntity } from '../../db/entities/wallet-transaction.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../db/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import {
  ADVENTURE_AREAS,
  findAdventureStage,
  FIRST_CLEAR_MULTIPLIER,
  isStageUnlocked,
} from './adventure-data'
import { simulateBattle } from './battle-engine'
import { toFighter } from './battle-stats'
import { DROP_GRADE_RATES_BY_AREA, rollGrade } from './equipment-data'
import { grantEquipment, loadEquipmentBonus, toEquipmentView } from './equipment.service'
import { calcAutoBattleReward } from './idle-data'
import { applyBattleOutcome, assertAutoBattleReady, assertCanBattle } from './monster-engine'
import { AUTO_BATTLE_DAILY_COIN_CAP, EQUIPMENT_DROP_CHANCE_BP } from './monster-rules'
import { getQuestResetAt } from './quest-data'
import { toMonsterView, withRuleErrors, MonsterService } from './monster.service'

@Injectable()
export class AdventureService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService,
    private readonly walletService: WalletService
  ) {}

  async getAdventure(userId: string) {
    const progress = await this.dataSource
      .getRepository(AdventureProgressEntity)
      .find({ where: { userId } })
    const clearCountByStage = new Map(progress.map(row => [row.stageId, row.clearCount]))
    const cleared = new Set(clearCountByStage.keys())

    return {
      areas: ADVENTURE_AREAS.map(area => ({
        id: area.id,
        name: area.name,
        emoji: area.emoji,
        recommendedStage: area.recommendedStage,
        stages: area.stages.map(stage => ({
          id: stage.id,
          isBoss: stage.isBoss,
          enemy: stage.enemy,
          reward: stage.reward,
          firstClearReward: stage.reward * FIRST_CLEAR_MULTIPLIER,
          firstClearGems: stage.firstClearGems,
          // Coins one auto-battle win pays (bosses can't be auto-battled).
          autoReward: stage.isBoss ? null : calcAutoBattleReward(stage),
          clearCount: clearCountByStage.get(stage.id) ?? 0,
          unlocked: isStageUnlocked(stage.id, cleared),
        })),
      })),
    }
  }

  // Idle auto-battle: `isAuto` repeats an already-cleared normal stage for a small, capped reward.
  async battle(userId: string, stageId: string, isAuto = false) {
    const now = new Date()
    const entry = findAdventureStage(stageId)
    if (!entry) {
      throw new NotFoundException('Stage not found')
    }

    return this.dataSource.transaction(async etm => {
      // The monster row lock also serializes concurrent battles of the same user.
      const monster = await this.monsterService.lockAndTickLatest(userId, now, etm)
      if (!monster) {
        throw new NotFoundException('You do not have a monster yet')
      }

      const progress = await etm.find(AdventureProgressEntity, { where: { userId } })
      const cleared = new Set(progress.map(row => row.stageId))
      if (!isStageUnlocked(stageId, cleared)) {
        throw new BadRequestException('Stage is locked')
      }
      withRuleErrors(() => assertCanBattle(monster))

      let autoCoinsLeft = 0
      if (isAuto) {
        if (entry.stage.isBoss) {
          throw new BadRequestException('Auto-battle is not available on boss stages')
        }
        if (!cleared.has(stageId)) {
          throw new BadRequestException('Clear this stage once before auto-battling it')
        }
        withRuleErrors(() => assertAutoBattleReady(monster, now))
        // The monster row lock above serializes this user's battles, so the day's total can't be
        // overspent by two requests racing.
        autoCoinsLeft =
          AUTO_BATTLE_DAILY_COIN_CAP - (await this.getAutoCoinsEarnedToday(userId, now, etm))
        if (autoCoinsLeft <= 0) {
          throw new BadRequestException('Daily auto-battle reward limit reached')
        }
      }

      const player = toFighter(monster, await loadEquipmentBonus(userId, etm))
      const enemy = entry.stage.enemy
      const seed = randomInt(0, 2 ** 31)
      const result = simulateBattle(player, enemy, seed)

      const isFirstClear = result.won && !cleared.has(stageId)
      let reward = 0
      if (result.won) {
        reward = isAuto
          ? Math.min(calcAutoBattleReward(entry.stage), autoCoinsLeft)
          : entry.stage.reward * (isFirstClear ? FIRST_CLEAR_MULTIPLIER : 1)
      }
      const gemReward = isFirstClear ? entry.stage.firstClearGems : 0

      const outcome = withRuleErrors(() =>
        applyBattleOutcome(
          monster,
          result.won,
          { stageId, seed, rounds: result.rounds, reward, gemReward },
          now,
          isAuto
        )
      )
      const saved = await this.monsterService.saveState(monster, outcome.state, etm)
      await this.monsterService.saveEvents(saved, outcome.events, etm)

      let wallet = await this.walletService.getBalance(userId, etm)
      if (result.won) {
        const existing = progress.find(row => row.stageId === stageId)
        if (isAuto) {
          // Auto-battle only repeats a cleared stage: no progress to record.
        } else if (existing) {
          existing.clearCount += 1
          await etm.save(AdventureProgressEntity, existing)
        } else {
          await etm.save(AdventureProgressEntity, {
            userId,
            stageId,
            clearCount: 1,
            firstClearedAt: now,
          })
        }
        wallet = await this.walletService.change(
          userId,
          EnumWalletCurrency.COIN,
          reward,
          isAuto
            ? EnumWalletTransactionReason.AUTO_BATTLE_REWARD
            : EnumWalletTransactionReason.BATTLE_REWARD,
          stageId,
          etm
        )
        if (isFirstClear && gemReward > 0) {
          wallet = await this.walletService.change(
            userId,
            EnumWalletCurrency.GEM,
            gemReward,
            EnumWalletTransactionReason.BOSS_FIRST_CLEAR,
            stageId,
            etm
          )
        }
      }

      // Manual wins may drop a piece for the area's grades; auto-battle never does.
      let drop: ReturnType<typeof toEquipmentView> | null = null
      let dropBagFull = false
      const rates = DROP_GRADE_RATES_BY_AREA[entry.area.id]
      if (result.won && !isAuto && rates && randomInt(0, 10_000) < EQUIPMENT_DROP_CHANCE_BP) {
        const row = await grantEquipment(
          userId,
          rollGrade(rates, randomInt(0, 1_000_000) / 1_000_000),
          `battle:${stageId}`,
          etm
        )
        drop = row ? toEquipmentView(row) : null
        dropBagFull = !row
      }

      return {
        monster: toMonsterView(saved),
        battle: {
          stageId,
          won: result.won,
          rounds: result.rounds,
          events: result.events,
          player,
          enemy,
          reward,
          gemReward,
          isFirstClear,
          drop,
          dropBagFull,
        },
        wallet,
      }
    })
  }

  private async getAutoCoinsEarnedToday(userId: string, now: Date, etm: EntityManager) {
    // The Thai day that quests use: it starts 24 hours before the next reset.
    const since = new Date(getQuestResetAt(now).getTime() - 24 * 60 * 60 * 1000)
    const row = await etm
      .createQueryBuilder(WalletTransactionEntity, 'tx')
      .select('COALESCE(SUM(tx.amount), 0)', 'sum')
      .where('tx.userId = :userId AND tx.reason = :reason AND tx.createdAt >= :since', {
        userId,
        reason: EnumWalletTransactionReason.AUTO_BATTLE_REWARD,
        since,
      })
      .getRawOne<{ sum: string }>()
    return Number(row?.sum ?? 0)
  }
}
