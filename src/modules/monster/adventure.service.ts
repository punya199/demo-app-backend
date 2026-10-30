import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { DataSource } from 'typeorm'
import { AdventureProgressEntity } from '../../db/entities/adventure-progress.entity'
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
import { applyBattleOutcome, assertCanBattle } from './monster-engine'
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
          clearCount: clearCountByStage.get(stage.id) ?? 0,
          unlocked: isStageUnlocked(stage.id, cleared),
        })),
      })),
    }
  }

  async battle(userId: string, stageId: string) {
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

      const player = toFighter(monster)
      const enemy = entry.stage.enemy
      const seed = randomInt(0, 2 ** 31)
      const result = simulateBattle(player, enemy, seed)

      const isFirstClear = result.won && !cleared.has(stageId)
      const reward = result.won
        ? entry.stage.reward * (isFirstClear ? FIRST_CLEAR_MULTIPLIER : 1)
        : 0
      const gemReward = isFirstClear ? entry.stage.firstClearGems : 0

      const outcome = withRuleErrors(() =>
        applyBattleOutcome(
          monster,
          result.won,
          { stageId, seed, rounds: result.rounds, reward, gemReward },
          now
        )
      )
      const saved = await this.monsterService.saveState(monster, outcome.state, etm)
      await this.monsterService.saveEvents(saved, outcome.events, etm)

      let wallet = await this.walletService.getBalance(userId, etm)
      if (result.won) {
        const existing = progress.find(row => row.stageId === stageId)
        if (existing) {
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
          EnumWalletTransactionReason.BATTLE_REWARD,
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
        },
        wallet,
      }
    })
  }
}
