import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { DataSource, EntityManager } from 'typeorm'
import { RaidProgressEntity } from '../../../db/entities/raid-progress.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { WalletService } from '../../wallet/wallet.service'
import { simulateArena } from '../arena/arena-engine'
import { buildBossDetail, defReductionPct } from './boss-detail'
import { arenaBattleView, toArenaFighter } from '../arena/arena-fighter'
import { loadArenaLoadout } from '../passive/skill.service'
import { raidCoreDrops } from '../equipment/craft-data'
import {
  buildSetPiece,
  EnumEquipmentGrade,
  EnumEquipmentSlot,
  findSetPieceTemplate,
  SET_DEFINITIONS,
} from '../equipment/equipment-data'
import {
  grantItem,
  isEquipmentBagFull,
  loadEquipmentBonus,
  rand,
  toEquipmentView,
} from '../equipment/equipment.service'
import { InventoryService } from '../inventory/inventory.service'
import { applyPvpOutcome, assertCanBattle } from '../core/monster-engine'
import { countFightsInWindow, getWindow } from '../arena/daily-fights'
import { RAID_ATTEMPTS, RAID_BOSS_TOKENS_PER_WIN, RAID_RESET_HOURS } from '../core/monster-rules'
import { toMonsterView, withRuleErrors, MonsterService } from '../core/monster.service'
import {
  bossTokenItemId,
  findRaidBoss,
  findRaidDifficulty,
  getRaidBossArena,
  getRaidBossFighter,
  isStageAtLeast,
  RAID_BOSSES,
  RAID_DIFFICULTIES,
  RAID_EXCHANGE_COST,
  RAID_FIRST_CLEAR_MULTIPLIER,
  requiredDifficultyForGrade,
} from './raid-data'

const SLOTS = Object.values(EnumEquipmentSlot)

@Injectable()
export class RaidService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService,
    private readonly inventoryService: InventoryService,
    private readonly walletService: WalletService
  ) {}

  private async loadProgress(userId: string, etm: EntityManager) {
    const rows = await etm.find(RaidProgressEntity, { where: { userId } })
    return new Map(rows.map(row => [`${row.bossId}:${row.difficulty}`, row]))
  }

  async getRaid(userId: string) {
    const now = new Date()
    const etm = this.dataSource.manager
    const [progress, attempts, inventory, monster] = await Promise.all([
      this.loadProgress(userId, etm),
      countFightsInWindow(userId, 'raid', RAID_RESET_HOURS, now, etm),
      this.inventoryService.getInventory(userId, etm),
      this.monsterService.getLatestAlive(userId, etm),
    ])
    const owned = new Map(inventory.items.map(item => [item.itemId, item.quantity]))

    return {
      attemptsLeft: Math.max(0, RAID_ATTEMPTS - attempts),
      resetsAt: getWindow(now, RAID_RESET_HOURS).resetsAt,
      bosses: RAID_BOSSES.map(boss => ({
        id: boss.id,
        name: boss.name,
        emoji: boss.emoji,
        sprite: boss.sprite,
        element: boss.element,
        setId: boss.setId,
        setName: SET_DEFINITIONS[boss.setId]?.name ?? boss.setId,
        bossTokens: owned.get(bossTokenItemId(boss.id)) ?? 0,
        // Skills are the same on every difficulty; stats are per difficulty (see `difficulties`).
        detail: buildBossDetail(
          getRaidBossFighter(boss, RAID_DIFFICULTIES[0]).stats,
          boss.arenaSkills
        ),
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
            defReductionPct: defReductionPct(getRaidBossFighter(boss, difficulty).stats.def),
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
      const attempts = await countFightsInWindow(userId, 'raid', RAID_RESET_HOURS, now, etm)
      if (attempts >= RAID_ATTEMPTS) {
        throw new BadRequestException('Raid attempts used up until the next reset')
      }
      // A win always drops a piece, so refuse before fighting rather than lose it afterwards.
      if (await isEquipmentBagFull(userId, etm)) {
        throw new BadRequestException('Equipment bag is full')
      }

      const player = toArenaFighter(
        monster,
        await loadEquipmentBonus(userId, monster.id, etm),
        await loadArenaLoadout(userId, monster, etm)
      )
      // Arena bosses ignore elements (see raid-data.ts): every line must be able to win.
      const enemy = getRaidBossArena(boss, difficulty)
      const seed = randomInt(0, 2 ** 31)
      const arena = simulateArena([[player], [enemy]], seed, { record: true })
      const battle = arenaBattleView(arena, player, enemy)
      const result = { won: battle.won, rounds: battle.rounds }

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
      // Craft cores a win pays (forge core / rune shard), by difficulty.
      const craftCores = result.won ? raidCoreDrops(difficulty.difficulty) : []
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

        if (difficulty.refineStone) {
          await this.inventoryService.add(userId, difficulty.refineStone, etm)
        }
        for (const core of craftCores) {
          await this.inventoryService.add(userId, core.itemId, etm, core.qty)
        }

        const slot = SLOTS[randomInt(0, SLOTS.length)]
        const template = findSetPieceTemplate(boss.setId, slot)!
        const row = await grantItem(
          userId,
          buildSetPiece(template.id, difficulty.grade, rand),
          `raid:${bossId}:${difficulty.difficulty}`,
          etm
        )
        drop = row ? toEquipmentView(row) : null
      }

      return {
        monster: toMonsterView(saved),
        battle,
        isFirstClear,
        raidTokens,
        bossTokens: result.won ? RAID_BOSS_TOKENS_PER_WIN : 0,
        refineStone: result.won ? difficulty.refineStone : null,
        craftCores,
        drop,
        attemptsLeft: Math.max(0, RAID_ATTEMPTS - attempts - 1),
        resetsAt: getWindow(now, RAID_RESET_HOURS).resetsAt,
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
        buildSetPiece(template.id, grade, rand),
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
