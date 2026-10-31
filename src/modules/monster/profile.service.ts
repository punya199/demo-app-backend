import { Injectable } from '@nestjs/common'
import { randomInt } from 'crypto'
import { DataSource, EntityManager } from 'typeorm'
import { PlayerProfileEntity } from '../../db/entities/player-profile.entity'
import { defaultDisplayName } from './display-name'
import { generateFriendCode } from './social-data'

const MAX_CODE_ATTEMPTS = 8

// The one place a player's public name and friend code live. PvP, the World Boss ranking, friends
// and rentals all show `displayName`; nothing shows the username.
@Injectable()
export class ProfileService {
  constructor(private readonly dataSource: DataSource) {}

  // Returns the player's profile, creating it (default name, fresh friend code) on first use.
  async ensureProfile(userId: string, etm: EntityManager = this.dataSource.manager) {
    const existing = await etm.findOne(PlayerProfileEntity, { where: { userId } })
    if (existing) {
      return existing
    }
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      // ON CONFLICT DO NOTHING covers both a parallel request creating the profile and the (very
      // unlikely) friend code collision; either way we look again and retry only if still missing.
      await etm
        .createQueryBuilder()
        .insert()
        .into(PlayerProfileEntity)
        .values({
          userId,
          displayName: defaultDisplayName(userId),
          friendCode: generateFriendCode(max => randomInt(0, max)),
        })
        .orIgnore()
        .execute()
      const created = await etm.findOne(PlayerProfileEntity, { where: { userId } })
      if (created) {
        return created
      }
    }
    throw new Error('Could not create a profile')
  }

  async setDisplayName(
    userId: string,
    displayName: string,
    etm: EntityManager = this.dataSource.manager
  ) {
    const profile = await this.ensureProfile(userId, etm)
    profile.displayName = displayName.trim()
    return etm.save(PlayerProfileEntity, profile)
  }

  // Names for a set of players, with the default tag for anyone who has no profile yet.
  async getNames(userIds: string[], etm: EntityManager = this.dataSource.manager) {
    const names = new Map<string, string>()
    if (userIds.length === 0) {
      return names
    }
    const rows = await etm
      .createQueryBuilder(PlayerProfileEntity, 'profile')
      .where('profile.userId IN (:...userIds)', { userIds })
      .getMany()
    for (const row of rows) {
      names.set(row.userId, row.displayName)
    }
    for (const userId of userIds) {
      if (!names.has(userId)) {
        names.set(userId, defaultDisplayName(userId))
      }
    }
    return names
  }
}
