import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { DataSource, EntityManager } from 'typeorm'
import { WorldBossDamageEntity } from '../../db/entities/world-boss-damage.entity'
import { WorldBossEntity } from '../../db/entities/world-boss.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../db/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { toFighter } from './battle-stats'
import { countFightsToday } from './daily-fights'
import { defaultDisplayName } from './display-name'
import {
  buildSetPiece,
  EnumEquipmentGrade,
  EnumEquipmentSlot,
  findSetPieceTemplate,
} from './equipment-data'
import {
  grantItem,
  isEquipmentBagFull,
  loadEquipmentBonus,
  toEquipmentView,
} from './equipment.service'
import { InventoryService } from './inventory.service'
import { applyPvpOutcome, assertCanBattle } from './monster-engine'
import { WORLD_BOSS_DAILY_HITS, WORLD_BOSS_ROUNDS } from './monster-rules'
import { toMonsterView, withRuleErrors, MonsterService } from './monster.service'
import { bossTokenItemId, isStageAtLeast, RAID_EXCHANGE_COST } from './raid-data'
import { simulateTeamBattle } from './team-battle'
import {
  calcWorldBossReward,
  claimRolls,
  findWorldBoss,
  getWeek,
  getWorldBossFighter,
  getWorldBossOfWeek,
} from './world-boss-data'
import { EnumMonsterStage } from '../../db/entities/monster.entity'

const RANKING_LIMIT = 20
const MIN_STAGE = EnumMonsterStage.ADULT

@Injectable()
export class WorldBossService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService,
    private readonly inventoryService: InventoryService,
    private readonly walletService: WalletService
  ) {}

  // The row for this week's boss, created by whoever asks first (no job).
  private async ensureCurrent(now: Date, etm: EntityManager) {
    const week = getWeek(now)
    const boss = getWorldBossOfWeek(week)
    await etm
      .createQueryBuilder()
      .insert()
      .into(WorldBossEntity)
      .values({
        week: week.key,
        bossId: boss.id,
        maxHp: boss.hp,
        hp: boss.hp,
        startsAt: week.startsAt,
        endsAt: week.endsAt,
      })
      .orIgnore()
      .execute()
    return etm.findOneOrFail(WorldBossEntity, { where: { week: week.key } })
  }

  private async rankOf(worldBossId: string, damage: number, etm: EntityManager) {
    const [row] = await etm.query<{ better: number }[]>(
      `SELECT count(*)::int AS "better" FROM "world_boss_damage"
       WHERE "world_boss_id" = $1 AND "damage" > $2 AND "deleted_at" IS NULL`,
      [worldBossId, damage]
    )
    return row.better + 1
  }

  private isEnded(boss: WorldBossEntity, now: Date) {
    return !!boss.defeatedAt || now >= boss.endsAt
  }

  private previewReward(
    boss: WorldBossEntity,
    row: WorldBossDamageEntity,
    rank: number,
    userId: string
  ) {
    const rolls = claimRolls(boss.id, userId)
    return calcWorldBossReward(
      {
        rank,
        hits: row.hits,
        defeated: !!boss.defeatedAt,
        isKillingBlow: boss.killedByUserId === userId,
      },
      rolls.pieceRoll
    )
  }

  async getStatus(userId: string) {
    const now = new Date()
    const etm = this.dataSource.manager
    const boss = await this.ensureCurrent(now, etm)
    const definition = findWorldBoss(boss.bossId)!
    const [mine, participants, fights] = await Promise.all([
      etm.findOne(WorldBossDamageEntity, { where: { worldBossId: boss.id, userId } }),
      etm.count(WorldBossDamageEntity, { where: { worldBossId: boss.id } }),
      countFightsToday(userId, 'world_boss', now, etm),
    ])

    // Weeks that have ended (or whose boss fell) with a reward still waiting for this player.
    const waiting = await etm.query<{ week: string; boss_id: string }[]>(
      `SELECT b."week", b."boss_id" FROM "world_boss_damage" d
       JOIN "world_bosses" b ON b."id" = d."world_boss_id"
       WHERE d."user_id" = $1 AND d."reward_claimed_at" IS NULL AND d."deleted_at" IS NULL
         AND b."deleted_at" IS NULL AND (b."ends_at" <= $2 OR b."defeated_at" IS NOT NULL)
       ORDER BY b."starts_at" DESC LIMIT 6`,
      [userId, now]
    )
    const claimable = await Promise.all(
      waiting.map(async entry => {
        const past = await etm.findOneOrFail(WorldBossEntity, { where: { week: entry.week } })
        const row = await etm.findOneOrFail(WorldBossDamageEntity, {
          where: { worldBossId: past.id, userId },
        })
        const rank = await this.rankOf(past.id, row.damage, etm)
        return {
          week: past.week,
          bossName: findWorldBoss(past.bossId)?.name ?? past.bossId,
          rank,
          defeated: !!past.defeatedAt,
          reward: this.previewReward(past, row, rank, userId),
        }
      })
    )

    return {
      week: boss.week,
      endsAt: boss.endsAt,
      boss: {
        id: definition.id,
        name: definition.name,
        emoji: definition.emoji,
        setId: definition.setId,
        hp: boss.hp,
        maxHp: boss.maxHp,
        isDefeated: !!boss.defeatedAt,
      },
      hitsLeft: Math.max(0, WORLD_BOSS_DAILY_HITS - fights),
      participants,
      myDamage: mine?.damage ?? 0,
      myHits: mine?.hits ?? 0,
      myRank: mine ? await this.rankOf(boss.id, mine.damage, etm) : null,
      claimable,
    }
  }

  async attack(userId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      // Lock order is always monster, then boss: every attacker takes them the same way.
      const monster = await this.monsterService.lockAndTickLatest(userId, now, etm)
      if (!monster) {
        throw new NotFoundException('You do not have a monster yet')
      }
      withRuleErrors(() => assertCanBattle(monster))
      if (!isStageAtLeast(monster.stage, MIN_STAGE)) {
        throw new BadRequestException('Your monster is too young for the world boss')
      }
      if ((await countFightsToday(userId, 'world_boss', now, etm)) >= WORLD_BOSS_DAILY_HITS) {
        throw new BadRequestException('Daily world boss limit reached')
      }

      await this.ensureCurrent(now, etm)
      // Locking the boss row for the fight makes the HP the fight sees the HP that is subtracted,
      // so the damage recorded is exactly what the boss lost, however many attack at once.
      const boss = await etm.findOneOrFail(WorldBossEntity, {
        where: { week: getWeek(now).key },
        lock: { mode: 'pessimistic_write' },
      })
      if (this.isEnded(boss, now)) {
        throw new BadRequestException('World boss is not active')
      }
      const definition = findWorldBoss(boss.bossId)!

      const player = toFighter(monster, await loadEquipmentBonus(userId, etm))
      const enemy = getWorldBossFighter(definition, boss.hp)
      const seed = randomInt(0, 2 ** 31)
      const result = simulateTeamBattle([player], enemy, seed, WORLD_BOSS_ROUNDS)

      boss.hp = result.bossHpAfter
      if (result.bossDefeated) {
        boss.defeatedAt = now
        boss.killedByUserId = userId
      }
      await etm.save(WorldBossEntity, boss)
      await etm.query(
        `INSERT INTO "world_boss_damage" ("world_boss_id", "user_id", "damage", "hits")
         VALUES ($1, $2, $3, 1)
         ON CONFLICT ("world_boss_id", "user_id") WHERE deleted_at IS NULL
         DO UPDATE SET "damage" = "world_boss_damage"."damage" + $3,
                       "hits" = "world_boss_damage"."hits" + 1, "updated_at" = now()`,
        [boss.id, userId, result.damageDealt]
      )

      const outcome = withRuleErrors(() =>
        applyPvpOutcome(
          monster,
          result.bossDefeated,
          { week: boss.week, damage: result.damageDealt, seed, rounds: result.rounds },
          now,
          'world_boss'
        )
      )
      const saved = await this.monsterService.saveState(monster, outcome.state, etm)
      await this.monsterService.saveEvents(saved, outcome.events, etm)

      const used = await countFightsToday(userId, 'world_boss', now, etm)
      return {
        monster: toMonsterView(saved),
        battle: {
          rounds: result.rounds,
          events: result.events,
          player,
          enemy,
          damage: result.damageDealt,
          survived: result.survivors.length > 0,
        },
        damage: result.damageDealt,
        bossHp: boss.hp,
        maxHp: boss.maxHp,
        isKillingBlow: result.bossDefeated,
        hitsLeft: Math.max(0, WORLD_BOSS_DAILY_HITS - used),
      }
    })
  }

  // Top damage dealers of a week. Players appear by their arena name only; ids never leave.
  async getRanking(userId: string, requestedWeek?: string) {
    const week = requestedWeek ?? getWeek(new Date()).key
    const rows = await this.dataSource.query<
      {
        rank: number
        user_id: string
        damage: number
        hits: number
        display_name: string | null
        emoji: string | null
      }[]
    >(
      `SELECT * FROM (
         SELECT RANK() OVER (ORDER BY d."damage" DESC)::int AS "rank", d."user_id", d."damage", d."hits",
                p."display_name", p."fighter"->>'emoji' AS "emoji"
         FROM "world_boss_damage" d
         JOIN "world_bosses" b ON b."id" = d."world_boss_id"
         LEFT JOIN "pvp_defenses" p ON p."user_id" = d."user_id" AND p."deleted_at" IS NULL
         WHERE b."week" = $1 AND d."deleted_at" IS NULL AND b."deleted_at" IS NULL
       ) ranked
       ORDER BY "rank", "hits" DESC
       LIMIT ${RANKING_LIMIT}`,
      [week]
    )
    return {
      week,
      entries: rows.map(row => ({
        rank: row.rank,
        displayName: row.display_name ?? defaultDisplayName(row.user_id),
        emoji: row.emoji,
        damage: row.damage,
        hits: row.hits,
        isMe: row.user_id === userId,
      })),
    }
  }

  // A finished week's rewards, once. The piece roll comes from the ids (claimRolls), so a retry
  // after clearing bag space gives the same result and can't be used to re-roll.
  async claim(userId: string, week: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const boss = await etm.findOne(WorldBossEntity, { where: { week } })
      if (!boss) {
        throw new NotFoundException('World boss week not found')
      }
      if (!this.isEnded(boss, now)) {
        throw new BadRequestException('World boss has not ended yet')
      }
      const row = await etm.findOne(WorldBossDamageEntity, {
        where: { worldBossId: boss.id, userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!row || row.rewardClaimedAt) {
        throw new BadRequestException('No world boss reward to claim')
      }

      const rank = await this.rankOf(boss.id, row.damage, etm)
      const reward = this.previewReward(boss, row, rank, userId)
      if (reward.pieceGrade && (await isEquipmentBagFull(userId, etm))) {
        throw new BadRequestException('Equipment bag is full')
      }

      const claimed = await etm
        .createQueryBuilder()
        .update(WorldBossDamageEntity)
        .set({ rewardClaimedAt: now })
        .where('id = :id AND reward_claimed_at IS NULL', { id: row.id })
        .execute()
      if (!claimed.affected) {
        throw new BadRequestException('No world boss reward to claim')
      }

      const reason = EnumWalletTransactionReason.WORLD_BOSS_REWARD
      let wallet = await this.walletService.change(
        userId,
        EnumWalletCurrency.COIN,
        reward.coin,
        reason,
        week,
        etm
      )
      wallet = await this.walletService.change(
        userId,
        EnumWalletCurrency.RAID_TOKEN,
        reward.raidToken,
        reason,
        week,
        etm
      )
      await this.inventoryService.add(userId, bossTokenItemId(boss.bossId), etm, reward.bossToken)

      let drop: ReturnType<typeof toEquipmentView> | null = null
      if (reward.pieceGrade) {
        const definition = findWorldBoss(boss.bossId)!
        const { slot } = claimRolls(boss.id, userId)
        const template = findSetPieceTemplate(definition.setId, slot)!
        const piece = await grantItem(
          userId,
          buildSetPiece(template.id, reward.pieceGrade),
          `world_boss:${week}`,
          etm
        )
        drop = piece ? toEquipmentView(piece) : null
      }
      return { week, rank, reward, drop, wallet }
    })
  }

  // The world boss's tokens buy a piece of its set. Rare and epic only, and only for a player who
  // has collected a reward from that boss before.
  async exchange(
    userId: string,
    bossId: string,
    slot: EnumEquipmentSlot,
    grade: EnumEquipmentGrade
  ) {
    const definition = findWorldBoss(bossId)
    const cost = RAID_EXCHANGE_COST[grade]
    if (!definition || !cost || grade === EnumEquipmentGrade.LEGENDARY) {
      throw new NotFoundException('Exchange not found')
    }
    const template = findSetPieceTemplate(definition.setId, slot)!

    return this.dataSource.transaction(async etm => {
      const [taken] = await etm.query<{ found: number }[]>(
        `SELECT 1 AS "found" FROM "world_boss_damage" d
         JOIN "world_bosses" b ON b."id" = d."world_boss_id"
         WHERE d."user_id" = $1 AND b."boss_id" = $2 AND d."reward_claimed_at" IS NOT NULL
           AND d."deleted_at" IS NULL LIMIT 1`,
        [userId, bossId]
      )
      if (!taken) {
        throw new BadRequestException('Take part in this world boss first')
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
