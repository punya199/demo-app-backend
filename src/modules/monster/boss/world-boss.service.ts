import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { isUUID } from 'class-validator'
import { randomInt } from 'crypto'
import { DataSource, EntityManager } from 'typeorm'
import { EnumFriendshipStatus, FriendshipEntity } from '../../../db/entities/friendship.entity'
import { RentalEntity } from '../../../db/entities/rental.entity'
import { SupportUnitEntity } from '../../../db/entities/support-unit.entity'
import { WorldBossDamageEntity } from '../../../db/entities/world-boss-damage.entity'
import { WorldBossEntity } from '../../../db/entities/world-boss.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { WalletService } from '../../wallet/wallet.service'
import { simulateArena } from '../arena/arena-engine'
import { arenaBattleView, arenaSpecOfFighter, toArenaFighter } from '../arena/arena-fighter'
import { IArenaFighterSpec } from '../arena/arena-types'
import { IFighter } from '../battle/battle-stats'
import { countFightsInWindow, getWindow } from '../arena/daily-fights'
import { defaultDisplayName } from '../core/display-name'
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
import { loadPublicCostumes } from '../equipment/costume.service'
import { InventoryService } from '../inventory/inventory.service'
import { applyPvpOutcome, assertCanBattle } from '../core/monster-engine'
import {
  FRIEND_POINTS_RENTAL,
  RENTAL_FEE,
  RENTAL_OWNER_DAILY_CAP,
  WORLD_BOSS_HITS,
  WORLD_BOSS_RESET_HOURS,
} from '../core/monster-rules'
import { toMonsterView, withRuleErrors, MonsterService } from '../core/monster.service'
import { worldBossCraftDrops } from '../equipment/craft-data'
import { isCraftSetId } from '../equipment/craft-sets'
import { calcRentalFee, orderPair } from '../social/social-data'
import { getQuestDayStart } from '../adventure/quest-data'
import { bossTokenItemId, isStageAtLeast, RAID_EXCHANGE_COST } from './raid-data'
import { loadArenaLoadout } from '../passive/skill.service'
import {
  claimRolls,
  findWorldBoss,
  getWeek,
  getWorldBossArena,
  splitWorldBossDamage,
} from './world-boss-data'
import { EnumMonsterStage } from '../../../db/entities/monster.entity'
import {
  detailOf,
  ensureCurrent,
  isEnded,
  previewReward,
  rankingRows,
  rankOf,
} from './world-boss-queries'

const MIN_STAGE = EnumMonsterStage.ADULT

@Injectable()
export class WorldBossService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService,
    private readonly inventoryService: InventoryService,
    private readonly walletService: WalletService
  ) {}

  async getStatus(userId: string) {
    const now = new Date()
    const etm = this.dataSource.manager
    const boss = await ensureCurrent(now, etm)
    const definition = findWorldBoss(boss.bossId)!
    const [mine, participants, fights] = await Promise.all([
      etm.findOne(WorldBossDamageEntity, { where: { worldBossId: boss.id, userId } }),
      etm.count(WorldBossDamageEntity, { where: { worldBossId: boss.id } }),
      countFightsInWindow(userId, 'world_boss', WORLD_BOSS_RESET_HOURS, now, etm),
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
        const rank = await rankOf(past.id, row.damage, etm)
        return {
          week: past.week,
          bossName: findWorldBoss(past.bossId)?.name ?? past.bossId,
          rank,
          defeated: !!past.defeatedAt,
          reward: previewReward(past, row, rank, userId),
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
        sprite: definition.sprite,
        setId: definition.setId,
        setName: SET_DEFINITIONS[definition.setId].name,
        element: definition.element,
        shield: definition.shield ?? 0,
        enrage: definition.enrage ?? null,
        ability: definition.ability,
        hp: boss.hp,
        maxHp: boss.maxHp,
        isDefeated: !!boss.defeatedAt,
        detail: detailOf(definition, boss.hp),
      },
      hitsLeft: Math.max(0, WORLD_BOSS_HITS - fights),
      resetsAt: getWindow(now, WORLD_BOSS_RESET_HOURS).resetsAt,
      participants,
      myDamage: mine?.damage ?? 0,
      myHits: mine?.hits ?? 0,
      myRank: mine ? await rankOf(boss.id, mine.damage, etm) : null,
      claimable,
    }
  }

  async attack(userId: string, supportId?: string) {
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
      if (
        (await countFightsInWindow(userId, 'world_boss', WORLD_BOSS_RESET_HOURS, now, etm)) >=
        WORLD_BOSS_HITS
      ) {
        throw new BadRequestException('World boss hits used up until the next reset')
      }

      await ensureCurrent(now, etm)
      // Locking the boss row for the fight makes the HP the fight sees the HP that is subtracted,
      // so the damage recorded is exactly what the boss lost, however many attack at once.
      const boss = await etm.findOneOrFail(WorldBossEntity, {
        where: { week: getWeek(now).key },
        lock: { mode: 'pessimistic_write' },
      })
      if (isEnded(boss, now)) {
        throw new BadRequestException('World boss is not active')
      }
      const definition = findWorldBoss(boss.bossId)!

      const player = toArenaFighter(
        monster,
        await loadEquipmentBonus(userId, monster.id, etm),
        await loadArenaLoadout(userId, monster, etm)
      )
      const enemy = getWorldBossArena(definition, boss.hp)
      const rental = supportId ? await this.rentAlly(userId, supportId, now, etm) : null
      const team = rental ? [player, rental.ally] : [player]
      const seed = randomInt(0, 2 ** 31)
      const arena = simulateArena([team, [enemy]], seed, { record: true })
      const battle = arenaBattleView(arena, player, enemy)
      const bossDefeated = arena.fighters[team.length].hp === 0
      // The renter's ranking counts only their own damage; the ally's still empties the boss.
      const {
        own: ownDamage,
        ally: allyDamage,
        hpAfter,
      } = splitWorldBossDamage(
        boss.hp,
        team.map((_, index) => arena.fighters[index].dealt),
        bossDefeated
      )

      boss.hp = hpAfter
      if (bossDefeated) {
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
        [boss.id, userId, ownDamage]
      )
      if (rental) {
        await etm.save(RentalEntity, {
          renterId: userId,
          ownerId: rental.ownerId,
          supportUnitId: rental.unitId,
          worldBossId: boss.id,
          fee: rental.fee,
          allyDamage,
        })
      }

      const outcome = withRuleErrors(() =>
        applyPvpOutcome(
          monster,
          bossDefeated,
          { week: boss.week, damage: ownDamage, seed, rounds: battle.rounds },
          now,
          'world_boss'
        )
      )
      const saved = await this.monsterService.saveState(monster, outcome.state, etm)
      await this.monsterService.saveEvents(saved, outcome.events, etm)

      const used = await countFightsInWindow(userId, 'world_boss', WORLD_BOSS_RESET_HOURS, now, etm)
      return {
        monster: toMonsterView(saved),
        battle: { ...battle, damage: ownDamage, survived: arena.fighters[0].hp > 0 },
        damage: ownDamage,
        ally: rental
          ? {
              name: rental.ally.name,
              emoji: rental.ally.emoji,
              sprite: rental.ally.sprite ?? null,
              damage: allyDamage,
              fee: rental.fee,
            }
          : null,
        bossHp: boss.hp,
        maxHp: boss.maxHp,
        isKillingBlow: bossDefeated,
        hitsLeft: Math.max(0, WORLD_BOSS_HITS - used),
        resetsAt: getWindow(now, WORLD_BOSS_RESET_HOURS).resetsAt,
      }
    })
  }

  // Rents a friend's support unit for one fight. Only friends' units can be rented, and the
  // answer for "not a friend" is the same as for "no such unit" so ids can't be probed.
  private async rentAlly(userId: string, supportId: string, now: Date, etm: EntityManager) {
    const unit = isUUID(supportId)
      ? await etm.findOne(SupportUnitEntity, { where: { id: supportId } })
      : null
    const friendship =
      unit && unit.userId !== userId
        ? await etm.findOne(FriendshipEntity, {
            where: { ...orderPair(userId, unit.userId), status: EnumFriendshipStatus.ACCEPTED },
          })
        : null
    if (!unit || !friendship) {
      throw new BadRequestException('Support unit is not available')
    }

    // Both wallets are locked in user-id order first, so two players renting from each other at the
    // same moment wait for each other. The owner's earnings so far today are then stable.
    await this.walletService.lockWallets([userId, unit.userId], etm)
    const [earned] = await etm.query<{ total: number }[]>(
      `SELECT COALESCE(SUM("fee"), 0)::int AS "total" FROM "rentals"
       WHERE "owner_id" = $1 AND "created_at" >= $2 AND "deleted_at" IS NULL`,
      [unit.userId, getQuestDayStart(now)]
    )
    const fee = calcRentalFee(earned.total, RENTAL_FEE, RENTAL_OWNER_DAILY_CAP)
    if (fee > 0) {
      await this.walletService.change(
        userId,
        EnumWalletCurrency.COIN,
        -fee,
        EnumWalletTransactionReason.RENTAL_FEE,
        unit.id,
        etm
      )
      await this.walletService.change(
        unit.userId,
        EnumWalletCurrency.COIN,
        fee,
        EnumWalletTransactionReason.RENTAL_INCOME,
        unit.id,
        etm
      )
    }
    await etm.query(`UPDATE "friendships" SET "points" = "points" + $2 WHERE "id" = $1`, [
      friendship.id,
      FRIEND_POINTS_RENTAL,
    ])
    const ally =
      (unit.arenaFighter as unknown as IArenaFighterSpec | null) ??
      arenaSpecOfFighter(unit.fighter as unknown as IFighter)
    return { ally, ownerId: unit.userId, unitId: unit.id, fee }
  }

  // Top damage dealers of a week. Players appear by their arena name only; ids never leave.
  async getRanking(userId: string, requestedWeek?: string) {
    const week = requestedWeek ?? getWeek(new Date()).key
    const rows = await rankingRows(week, this.dataSource)
    const costumes = await loadPublicCostumes(
      rows.map(row => row.user_id),
      this.dataSource.manager
    )
    return {
      week,
      entries: rows.map(row => ({
        costume: costumes.get(row.user_id) ?? null,
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
      if (!isEnded(boss, now)) {
        throw new BadRequestException('World boss has not ended yet')
      }
      const row = await etm.findOne(WorldBossDamageEntity, {
        where: { worldBossId: boss.id, userId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!row || row.rewardClaimedAt) {
        throw new BadRequestException('No world boss reward to claim')
      }

      const rank = await rankOf(boss.id, row.damage, etm)
      const reward = previewReward(boss, row, rank, userId)
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
      for (const [materialId, quantity] of Object.entries(reward.refineStones)) {
        await this.inventoryService.add(userId, materialId, etm, quantity)
      }
      // A unique craft material (kind fixed by claimRolls) and Catalysts; ranks 1-3 get more.
      const craftDrops = worldBossCraftDrops(rank, claimRolls(boss.id, userId).craftKindRoll)
      for (const material of craftDrops) {
        await this.inventoryService.add(userId, material.itemId, etm, material.qty)
      }

      let drop: ReturnType<typeof toEquipmentView> | null = null
      if (reward.pieceGrade) {
        const definition = findWorldBoss(boss.bossId)!
        const { slot, rng } = claimRolls(boss.id, userId)
        const template = findSetPieceTemplate(definition.setId, slot)!
        const piece = await grantItem(
          userId,
          buildSetPiece(template.id, reward.pieceGrade, rng),
          `world_boss:${week}`,
          etm
        )
        drop = piece ? toEquipmentView(piece) : null
      }
      return { week, rank, reward, craftDrops, drop, wallet }
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
    // Legendary and mythic pieces, and anything of a craft set, are never for sale.
    const sellable = grade !== EnumEquipmentGrade.LEGENDARY && grade !== EnumEquipmentGrade.MYTHIC
    if (!definition || !cost || !sellable || isCraftSetId(definition.setId)) {
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
