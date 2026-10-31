import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource, EntityManager, In, MoreThanOrEqual } from 'typeorm'
import {
  EnumFriendInteractionKind,
  FriendInteractionEntity,
} from '../../db/entities/friend-interaction.entity'
import { EnumFriendshipStatus, FriendshipEntity } from '../../db/entities/friendship.entity'
import { PlayerProfileEntity } from '../../db/entities/player-profile.entity'
import { SupportUnitEntity } from '../../db/entities/support-unit.entity'
import { toFighter } from './battle-stats'
import { getSpecies } from './species-data'
import { loadEquipmentBonus } from './equipment.service'
import { InventoryService } from './inventory.service'
import {
  FRIEND_LIMIT,
  FRIEND_POINTS_GIFT,
  FRIEND_POINTS_GREET,
  FRIEND_REQUEST_LIMIT,
  GIFTS_PER_DAY,
  GREETS_PER_DAY_PER_FRIEND,
} from './monster-rules'
import { MonsterService } from './monster.service'
import { ProfileService } from './profile.service'
import { getQuestDayStart } from './quest-data'
import { EnumShopItemId } from './shop-data'
import { isValidFriendCode, normalizeFriendCode, orderPair } from './social-data'

// Friends are addressed only by the id of the friendship row, never by the other player's user id,
// and shown only by their profile name. Adding someone needs the friend code they gave out.
@Injectable()
export class FriendService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly profileService: ProfileService,
    private readonly inventoryService: InventoryService,
    private readonly monsterService: MonsterService
  ) {}

  private otherOf(row: FriendshipEntity, userId: string) {
    return row.userLow === userId ? row.userHigh : row.userLow
  }

  private async countFriends(userId: string, etm: EntityManager) {
    return etm.count(FriendshipEntity, {
      where: [
        { userLow: userId, status: EnumFriendshipStatus.ACCEPTED },
        { userHigh: userId, status: EnumFriendshipStatus.ACCEPTED },
      ],
    })
  }

  // Friends the player has, plus requests they have sent that are still waiting.
  private async countFriendSlots(userId: string, etm: EntityManager) {
    const rows = await etm.find(FriendshipEntity, {
      where: [{ userLow: userId }, { userHigh: userId }],
    })
    return rows.filter(
      row => row.status === EnumFriendshipStatus.ACCEPTED || row.requestedBy === userId
    ).length
  }

  // The friendship an accepted friend relation id points at, if the player is one of the two.
  private async findAccepted(userId: string, relationId: string, etm: EntityManager, lock = false) {
    const row = await etm.findOne(FriendshipEntity, {
      where: [
        { id: relationId, userLow: userId, status: EnumFriendshipStatus.ACCEPTED },
        { id: relationId, userHigh: userId, status: EnumFriendshipStatus.ACCEPTED },
      ],
      ...(lock && { lock: { mode: 'pessimistic_write' as const } }),
    })
    if (!row) {
      throw new NotFoundException('Friend not found')
    }
    return row
  }

  async list(userId: string) {
    const now = new Date()
    const etm = this.dataSource.manager
    const rows = await etm.find(FriendshipEntity, {
      where: [{ userLow: userId }, { userHigh: userId }],
      order: { createdAt: 'ASC' },
    })
    const otherIds = rows.map(row => this.otherOf(row, userId))
    const accepted = rows.filter(row => row.status === EnumFriendshipStatus.ACCEPTED)
    const [names, units, greeted, giftsToday] = await Promise.all([
      this.profileService.getNames(otherIds, etm),
      otherIds.length
        ? etm.find(SupportUnitEntity, { where: { userId: In(otherIds) } })
        : Promise.resolve([]),
      accepted.length
        ? etm.find(FriendInteractionEntity, {
            where: {
              actorId: userId,
              kind: EnumFriendInteractionKind.GREET,
              createdAt: MoreThanOrEqual(getQuestDayStart(now)),
            },
          })
        : Promise.resolve([]),
      etm.count(FriendInteractionEntity, {
        where: {
          actorId: userId,
          kind: EnumFriendInteractionKind.GIFT,
          createdAt: MoreThanOrEqual(getQuestDayStart(now)),
        },
      }),
    ])
    const hasUnit = new Set(units.map(unit => unit.userId))
    const greetedRelations = new Set(greeted.map(entry => entry.friendshipId))
    const monsters = new Map(
      await Promise.all(
        accepted.map(async row => {
          const friendId = this.otherOf(row, userId)
          const monster = await this.monsterService.getLatestAlive(friendId, etm)
          return [
            row.id,
            monster ? { emoji: getEmoji(monster.speciesId), stage: monster.stage } : null,
          ] as const
        })
      )
    )

    return {
      friendLimit: FRIEND_LIMIT,
      giftsLeft: Math.max(0, GIFTS_PER_DAY - giftsToday),
      friends: accepted.map(row => {
        const friendId = this.otherOf(row, userId)
        return {
          relationId: row.id,
          displayName: names.get(friendId)!,
          monster: monsters.get(row.id) ?? null,
          points: row.points,
          hasSupport: hasUnit.has(friendId),
          canGreet: !greetedRelations.has(row.id),
        }
      }),
      incoming: rows
        .filter(row => row.status === EnumFriendshipStatus.PENDING && row.requestedBy !== userId)
        .map(row => ({ relationId: row.id, displayName: names.get(this.otherOf(row, userId))! })),
      outgoing: rows
        .filter(row => row.status === EnumFriendshipStatus.PENDING && row.requestedBy === userId)
        .map(row => ({ relationId: row.id, displayName: names.get(this.otherOf(row, userId))! })),
    }
  }

  // Sends a request by friend code. If that player already asked you, the two requests meet and
  // you become friends. Two players asking each other at once hit the same unique row.
  async request(userId: string, friendCodeInput: string) {
    const code = normalizeFriendCode(friendCodeInput)
    if (!isValidFriendCode(code)) {
      throw new BadRequestException('Invalid friend code')
    }
    await this.dataSource.transaction(async etm => {
      await this.profileService.ensureProfile(userId, etm)
      const target = await etm.findOne(PlayerProfileEntity, { where: { friendCode: code } })
      if (!target) {
        throw new NotFoundException('Friend code not found')
      }
      if (target.userId === userId) {
        throw new BadRequestException('You cannot add yourself')
      }
      const pair = orderPair(userId, target.userId)

      for (let attempt = 0; attempt < 2; attempt++) {
        const existing = await etm.findOne(FriendshipEntity, { where: pair })
        if (existing) {
          if (existing.status === EnumFriendshipStatus.ACCEPTED) {
            throw new BadRequestException('Already friends')
          }
          if (existing.requestedBy === userId) {
            throw new BadRequestException('Friend request already sent')
          }
          // They asked first: accepting is the same as asking back.
          if ((await this.countFriendSlots(userId, etm)) >= FRIEND_LIMIT) {
            throw new BadRequestException('Friend list is full')
          }
          await etm.update(
            FriendshipEntity,
            { id: existing.id },
            { status: EnumFriendshipStatus.ACCEPTED }
          )
          return
        }
        if ((await this.countFriendSlots(userId, etm)) >= FRIEND_LIMIT) {
          throw new BadRequestException('Friend list is full')
        }
        const waiting = await etm.count(FriendshipEntity, {
          where: [
            { userLow: target.userId, status: EnumFriendshipStatus.PENDING },
            { userHigh: target.userId, status: EnumFriendshipStatus.PENDING },
          ],
        })
        if (waiting >= FRIEND_REQUEST_LIMIT) {
          throw new BadRequestException('That player has too many pending requests')
        }
        const inserted = await etm
          .createQueryBuilder()
          .insert()
          .into(FriendshipEntity)
          .values({ ...pair, requestedBy: userId, status: EnumFriendshipStatus.PENDING, points: 0 })
          .orIgnore()
          .execute()
        if ((inserted.raw as unknown[] | undefined)?.length) {
          return
        }
        // Lost a race with the other side's request: look again and meet it.
      }
    })
    return this.list(userId)
  }

  async respond(userId: string, relationId: string, accept: boolean) {
    await this.dataSource.transaction(async etm => {
      const row = await etm.findOne(FriendshipEntity, {
        where: [
          { id: relationId, userLow: userId, status: EnumFriendshipStatus.PENDING },
          { id: relationId, userHigh: userId, status: EnumFriendshipStatus.PENDING },
        ],
        lock: { mode: 'pessimistic_write' },
      })
      if (!row || row.requestedBy === userId) {
        throw new NotFoundException('Friend request not found')
      }
      if (!accept) {
        await etm.softDelete(FriendshipEntity, { id: row.id })
        return
      }
      if ((await this.countFriends(userId, etm)) >= FRIEND_LIMIT) {
        throw new BadRequestException('Friend list is full')
      }
      await etm.update(FriendshipEntity, { id: row.id }, { status: EnumFriendshipStatus.ACCEPTED })
    })
    return this.list(userId)
  }

  // Either side can end a friendship or withdraw a request.
  async remove(userId: string, relationId: string) {
    const removed = await this.dataSource.manager.findOne(FriendshipEntity, {
      where: [
        { id: relationId, userLow: userId },
        { id: relationId, userHigh: userId },
      ],
    })
    if (!removed) {
      throw new NotFoundException('Friend not found')
    }
    await this.dataSource.manager.softDelete(FriendshipEntity, { id: removed.id })
    return this.list(userId)
  }

  // A read-only look at a friend's current monster.
  async visit(userId: string, relationId: string) {
    const etm = this.dataSource.manager
    const row = await this.findAccepted(userId, relationId, etm)
    const friendId = this.otherOf(row, userId)
    const [names, monster] = await Promise.all([
      this.profileService.getNames([friendId], etm),
      this.monsterService.getLatestAlive(friendId, etm),
    ])
    return {
      displayName: names.get(friendId)!,
      points: row.points,
      monster: monster
        ? {
            emoji: getEmoji(monster.speciesId),
            name: getName(monster.speciesId),
            stage: monster.stage,
            ageMinutes: monster.ageMinutes,
            isSick: monster.isSick,
            isExploring: !!monster.expeditionAreaId,
            wins: monster.wins,
            losses: monster.losses,
            stats: toFighter(monster, await loadEquipmentBonus(friendId, etm)).stats,
          }
        : null,
    }
  }

  // One greeting per friend per day. The friendship row lock queues repeated calls.
  async greet(userId: string, relationId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const row = await this.findAccepted(userId, relationId, etm, true)
      const today = await etm.count(FriendInteractionEntity, {
        where: {
          friendshipId: row.id,
          actorId: userId,
          kind: EnumFriendInteractionKind.GREET,
          createdAt: MoreThanOrEqual(getQuestDayStart(now)),
        },
      })
      if (today >= GREETS_PER_DAY_PER_FRIEND) {
        throw new BadRequestException('You already greeted this friend today')
      }
      await etm.save(FriendInteractionEntity, {
        friendshipId: row.id,
        actorId: userId,
        kind: EnumFriendInteractionKind.GREET,
        payload: {},
      })
      row.points += FRIEND_POINTS_GREET
      await etm.save(FriendshipEntity, row)
      return { points: row.points }
    })
  }

  // A gift is a consumable out of the sender's own bag, so it can't create coins out of nothing.
  async gift(userId: string, relationId: string, itemId: EnumShopItemId) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      // The daily limit spans every friend, so one lock per sender queues their parallel gifts.
      await etm.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${userId}:gift`])
      const row = await this.findAccepted(userId, relationId, etm, true)
      const sent = await etm.count(FriendInteractionEntity, {
        where: {
          actorId: userId,
          kind: EnumFriendInteractionKind.GIFT,
          createdAt: MoreThanOrEqual(getQuestDayStart(now)),
        },
      })
      if (sent >= GIFTS_PER_DAY) {
        throw new BadRequestException('Daily gift limit reached')
      }
      if (!(await this.inventoryService.spend(userId, itemId, 1, etm))) {
        throw new BadRequestException('You do not have this item')
      }
      await this.inventoryService.add(this.otherOf(row, userId), itemId, etm)
      await etm.save(FriendInteractionEntity, {
        friendshipId: row.id,
        actorId: userId,
        kind: EnumFriendInteractionKind.GIFT,
        payload: { itemId },
      })
      row.points += FRIEND_POINTS_GIFT
      await etm.save(FriendshipEntity, row)
      return {
        points: row.points,
        giftsLeft: Math.max(0, GIFTS_PER_DAY - sent - 1),
        ...(await this.inventoryService.getInventory(userId, etm)),
      }
    })
  }
}

const getEmoji = (speciesId: string) => getSpecies(speciesId).emoji
const getName = (speciesId: string) => getSpecies(speciesId).name
