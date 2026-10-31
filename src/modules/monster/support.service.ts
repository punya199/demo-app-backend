import { BadRequestException, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { EnumFriendshipStatus, FriendshipEntity } from '../../db/entities/friendship.entity'
import { SupportUnitEntity } from '../../db/entities/support-unit.entity'
import { IFighter, toFighter } from './battle-stats'
import { loadEquipmentBonus } from './equipment.service'
import { MAX_STAMINA, RENTAL_FEE, SUPPORT_COOLDOWN_MS } from './monster-rules'
import { MonsterService } from './monster.service'
import { isPvpStage } from './pvp-data'
import { ProfileService } from './profile.service'

const toUnitView = (unit: SupportUnitEntity) => {
  const fighter = unit.fighter as unknown as IFighter
  return {
    supportId: unit.id,
    emoji: fighter.emoji,
    name: fighter.name,
    stage: unit.stage,
    stats: fighter.stats,
    effects: fighter.effects ?? null,
    setAt: unit.setAt,
    readyAt: new Date(unit.setAt.getTime() + SUPPORT_COOLDOWN_MS),
  }
}

// The monster a player offers to friends. It is a frozen copy (like an arena defense, but separate)
// and only world bosses can use it: PvP never takes an ally.
@Injectable()
export class SupportService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService,
    private readonly profileService: ProfileService
  ) {}

  async getMine(userId: string) {
    const unit = await this.dataSource.manager.findOne(SupportUnitEntity, { where: { userId } })
    return { support: unit ? toUnitView(unit) : null }
  }

  async setSupport(userId: string) {
    const now = new Date()
    await this.dataSource.transaction(async etm => {
      const monster = await this.monsterService.lockAndTickLatest(userId, now, etm)
      if (!monster || monster.diedAt || !isPvpStage(monster.stage)) {
        throw new BadRequestException('Your monster is too young to be a support unit')
      }
      const existing = await etm.findOne(SupportUnitEntity, { where: { userId } })
      if (existing && now.getTime() - existing.setAt.getTime() < SUPPORT_COOLDOWN_MS) {
        throw new BadRequestException('Support unit was changed recently')
      }
      // Stamina counts as full: a rented unit is never weaker for having fought lately.
      const fighter = toFighter(
        { ...monster, stamina: MAX_STAMINA },
        await loadEquipmentBonus(userId, etm)
      )
      await this.profileService.ensureProfile(userId, etm)
      await etm.query(
        `INSERT INTO "support_units" ("user_id", "fighter", "stage", "set_at")
         VALUES ($1, $2, $3, $4)
         ON CONFLICT ("user_id") WHERE deleted_at IS NULL
         DO UPDATE SET "fighter" = $2, "stage" = $3, "set_at" = $4, "updated_at" = now()`,
        [userId, JSON.stringify(fighter), monster.stage, now]
      )
    })
    return this.getMine(userId)
  }

  // Friends' support units, never anyone else's.
  async getRentable(userId: string) {
    const etm = this.dataSource.manager
    const friendships = await etm.find(FriendshipEntity, {
      where: [
        { userLow: userId, status: EnumFriendshipStatus.ACCEPTED },
        { userHigh: userId, status: EnumFriendshipStatus.ACCEPTED },
      ],
    })
    const friendIds = friendships.map(row => (row.userLow === userId ? row.userHigh : row.userLow))
    if (friendIds.length === 0) {
      return { fee: RENTAL_FEE, units: [] }
    }
    const [units, names] = await Promise.all([
      etm
        .createQueryBuilder(SupportUnitEntity, 'unit')
        .where('unit.userId IN (:...friendIds)', { friendIds })
        .getMany(),
      this.profileService.getNames(friendIds, etm),
    ])
    return {
      fee: RENTAL_FEE,
      units: units.map(unit => ({ ...toUnitView(unit), ownerName: names.get(unit.userId)! })),
    }
  }
}
