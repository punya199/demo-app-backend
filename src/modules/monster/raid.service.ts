import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { DataSource, EntityManager } from 'typeorm'
import { RaidProgressEntity } from '../../db/entities/raid-progress.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../db/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { simulateBattle } from './battle-engine'
import { toFighter } from './battle-stats'
import {
  buildSetPiece,
  EnumEquipmentGrade,
  EnumEquipmentSlot,
  findSetPieceTemplate,
  SET_DEFINITIONS,
} from './equipment-data'
import {
  grantItem,
  isEquipmentBagFull,
  loadEquipmentBonus,
  toEquipmentView,
} from './equipment.service'
import { InventoryService } from './inventory.service'
import { applyPvpOutcome, assertCanBattle } from './monster-engine'
import { RAID_BOSS_TOKENS_PER_WIN, RAID_DAILY_ATTEMPTS } from './monster-rules'
import { toMonsterView, withRuleErrors, MonsterService } from './monster.service'
import {
  bossTokenItemId,
  findRaidBoss,
  findRaidDifficulty,
  getRaidBossFighter,
  isStageAtLeast,
  RAID_BOSSES,
  RAID_DIFFICULTIES,
  RAID_EXCHANGE_COST,
  RAID_FIRST_CLEAR_MULTIPLIER,
  requiredDifficultyForGrade,
} from './raid-data'
import { getQuestResetAt } from './quest-data'

const DAY_MS = 24 * 60 * 60 * 1000
const SLOTS = Object.values(EnumEquipmentSlot)

@Injectable()
export class RaidService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService,
    private readonly inventoryService: InventoryService,
    private readonly walletService: WalletService
  ) {}

  // Raid fights today (Thai day), counted from the battle log across all of the user's monsters.
  private async attemptsToday(userId: string, now: Date, etm: EntityManager) {
    const since = new Date(getQuestResetAt(now).getTime() - DAY_MS)
    const [row] = await etm.query<{ attempts: number }[]>(
      `SELECT count(*)::int AS "attempts" FROM "monster_logs" l
       JOIN "monsters" m ON m."id" = l."monster_id"
       WHERE m."owner_id" = $1 AND l."type" = 'battle' AND l."payload"->>'mode' = 'raid'
         AND l."created_at" >= $2 AND l."deleted_at" IS NULL`,
      [userId, since]
    )
    return row.attempts
  }

  private async loadProgress(userId: string, etm: EntityManager) {
    const rows = await etm.find(RaidProgressEntity, { where: { userId } })
    return new Map(rows.map(row => [`${row.bossId}:${row.difficulty}`, row]))
  }

  async getRaid(userId: string) {
    const now = new Date()
    const etm = this.dataSource.manager
    const [progress, attempts, inventory, monster] = await Promise.all([
      this.loadProgress(userId, etm),
      this.attemptsToday(userId, now, etm),
      this.inventoryService.getInventory(userId, etm),
      this.monsterService.getLatestAlive(userId, etm),
    ])
    const owned = new Map(inventory.items.map(item => [item.itemId, item.quantity]))

    return {
      attemptsLeft: Math.max(0, RAID_DAILY_ATTEMPTS - attempts),
      bosses: RAID_BOSSES.map(boss => ({
        id: boss.id,
        name: boss.name,
        emoji: boss.emoji,
        element: boss.element,
        setId: boss.setId,
        setName: SET_DEFINITIONS[boss.setId]?.name ?? boss.setId,
        bossTokens: owned.get(bossTokenItemId(boss.id)) ?? 0,
        difficulties: RAID_DIFFICULTIES.map((difficulty, index) => {
          const previous = RAID_DIFFICULTIES[index - 1]
          const cleared = progress.get(`${boss.id}:${difficulty.difficulty}`)?.clearCount ?? 0
          return {
            difficulty: difficulty.difficulty,
            minStage: difficulty.minStage,
            grade: difficulty.grade,
            raidTokens: difficulty.raidTokens,
            exchangeCost: RAID_EXCHANGE_COST[difficulty.grade],
            enemy: getRaidBossFighter(boss, difficulty),
            clearCount: cleared,
            // Entry needs the form and a clear of the easier difficulty of the same boss.
            unlocked:
              !!monster &&
              isStageAtLeast(monster.stage, difficulty.minStage) &&
              (!previous ||
                (progress.get(`${boss.id}:${previous.difficulty}`)?.clearCount ?? 0) > 0),
          }
        }),
      })),
    }
  }

  async battle(userId: string, bossId: string, difficultyId: string) {
    const now = new Date()
    const boss = findRaidBoss(bossId)
    const difficulty = findRaidDifficulty(difficultyId)
    if (!boss || !difficulty) {
      throw new NotFoundException('Boss not found')
    }
    const difficultyIndex = RAID_DIFFICULTIES.indexOf(difficulty)

    return this.dataSource.transaction(async etm => {
      // The monster lock queues this user's fights, so the daily limit can't be overspent.
      const monster = await this.monsterService.lockAndTickLatest(userId, now, etm)
      if (!monster) {
        throw new NotFoundException('You do not have a monster yet')
      }
      withRuleErrors(() => assertCanBattle(monster))
      if (!isStageAtLeast(monster.stage, difficulty.minStage)) {
        throw new BadRequestException('Your monster is not strong enough for this difficulty')
      }
      const progress = await this.loadProgress(userId, etm)
      const previous = RAID_DIFFICULTIES[difficultyIndex - 1]
      if (previous && !progress.get(`${boss.id}:${previous.difficulty}`)?.clearCount) {
        throw new BadRequestException('Clear the previous difficulty first')
      }
      const attempts = await this.attemptsToday(userId, now, etm)
      if (attempts >= RAID_DAILY_ATTEMPTS) {
        throw new BadRequestException('Daily raid limit reached')
      }
      // A win always drops a piece, so refuse before fighting rather than lose it afterwards.
      if (await isEquipmentBagFull(userId, etm)) {
        throw new BadRequestException('Equipment bag is full')
      }

      const player = toFighter(monster, await loadEquipmentBonus(userId, etm))
      const enemy = getRaidBossFighter(boss, difficulty)
      const seed = randomInt(0, 2 ** 31)
      // The element triangle is off here (see raid-data.ts): every line must be able to win.
      const result = simulateBattle(player, enemy, seed, { ignoreElements: true })

      const outcome = withRuleErrors(() =>
        applyPvpOutcome(
          monster,
          result.won,
          { bossId, difficulty: difficulty.difficulty, seed, rounds: result.rounds },
          now,
          'raid'
        )
      )
      const saved = await this.monsterService.saveState(monster, outcome.state, etm)
      await this.monsterService.saveEvents(saved, outcome.events, etm)

      let wallet = await this.walletService.getBalance(userId, etm)
      let drop: ReturnType<typeof toEquipmentView> | null = null
      let raidTokens = 0
      const existing = progress.get(`${boss.id}:${difficulty.difficulty}`)
      const isFirstClear = result.won && !existing
      if (result.won) {
        if (existing) {
          existing.clearCount += 1
          await etm.save(RaidProgressEntity, existing)
        } else {
          await etm.save(RaidProgressEntity, {
            userId,
            bossId,
            difficulty: difficulty.difficulty,
            clearCount: 1,
            firstClearedAt: now,
          })
        }

        raidTokens = difficulty.raidTokens * (isFirstClear ? RAID_FIRST_CLEAR_MULTIPLIER : 1)
        wallet = await this.walletService.change(
          userId,
          EnumWalletCurrency.RAID_TOKEN,
          raidTokens,
          EnumWalletTransactionReason.RAID_REWARD,
          `${bossId}:${difficulty.difficulty}`,
          etm
        )
        await this.inventoryService.add(
          userId,
          bossTokenItemId(bossId),
          etm,
          RAID_BOSS_TOKENS_PER_WIN
        )

        const slot = SLOTS[randomInt(0, SLOTS.length)]
        const template = findSetPieceTemplate(boss.setId, slot)!
        const row = await grantItem(
          userId,
          buildSetPiece(template.id, difficulty.grade),
          `raid:${bossId}:${difficulty.difficulty}`,
          etm
        )
        drop = row ? toEquipmentView(row) : null
      }

      return {
        monster: toMonsterView(saved),
        battle: {
          won: result.won,
          rounds: result.rounds,
          events: result.events,
          player,
          enemy,
        },
        isFirstClear,
        raidTokens,
        bossTokens: result.won ? RAID_BOSS_TOKENS_PER_WIN : 0,
        drop,
        attemptsLeft: Math.max(0, RAID_DAILY_ATTEMPTS - attempts - 1),
        wallet,
      }
    })
  }

  // Boss tokens for the piece you pick. The grade can only be bought after clearing the
  // difficulty that drops it, and a full bag refuses before any token is spent.
  async exchange(
    userId: string,
    bossId: string,
    slot: EnumEquipmentSlot,
    grade: EnumEquipmentGrade
  ) {
    const boss = findRaidBoss(bossId)
    const cost = RAID_EXCHANGE_COST[grade]
    const requiredDifficulty = requiredDifficultyForGrade(grade)
    if (!boss || !cost || !requiredDifficulty) {
      throw new NotFoundException('Exchange not found')
    }
    const template = findSetPieceTemplate(boss.setId, slot)!

    return this.dataSource.transaction(async etm => {
      const progress = await etm.findOne(RaidProgressEntity, {
        where: { userId, bossId, difficulty: requiredDifficulty },
      })
      if (!progress?.clearCount) {
        throw new BadRequestException('Clear this difficulty first')
      }
      if (await isEquipmentBagFull(userId, etm)) {
        throw new BadRequestException('Equipment bag is full')
      }
      if (!(await this.inventoryService.spend(userId, bossTokenItemId(bossId), cost, etm))) {
        throw new BadRequestException('Not enough boss tokens')
      }
      const row = (await grantItem(
        userId,
        buildSetPiece(template.id, grade),
        `exchange:${bossId}`,
        etm
      ))!
      return {
        item: toEquipmentView(row),
        ...(await this.inventoryService.getInventory(userId, etm)),
      }
    })
  }
}
