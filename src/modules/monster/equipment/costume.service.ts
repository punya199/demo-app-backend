import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { PlayerCostumeEntity } from '../../../db/entities/player-costume.entity'
import { PlayerProfileEntity } from '../../../db/entities/player-profile.entity'
import { MonsterEntity } from '../../../db/entities/monster.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { WalletService } from '../../wallet/wallet.service'
import {
  cleanLoadout,
  COSTUME_SLOTS,
  COSTUMES,
  EnumCostumeSlot,
  findCostume,
  getBuyBlocker,
  ICostume,
  ILoadout,
  isFreeCostume,
  publicLoadout,
  themeProgress,
} from './costume-data'
import { InventoryService } from '../inventory/inventory.service'
import { bossTokenItemId } from '../boss/raid-data'
import { MonsterService } from '../core/monster.service'
import { ProfileService } from '../core/profile.service'
import { COSTUMES_ENABLED } from '../core/monster-rules'

const assertCostumesEnabled = () => {
  if (!COSTUMES_ENABLED) {
    throw new BadRequestException('Costumes are switched off for now')
  }
}

// The selected living pet's costume for each of these players, for screens that show other
// players. Anyone who turned sharing off (or has no pet) is left out; nothing but catalog ids is
// ever returned.
export const loadPublicCostumes = async (userIds: string[], etm: EntityManager) => {
  const result = new Map<string, ILoadout>()
  const ids = [...new Set(userIds)]
  if (ids.length === 0 || !COSTUMES_ENABLED) {
    return result
  }
  const rows = await etm.query<{ owner_id: string; costume: unknown; show_costume: boolean }[]>(
    `SELECT DISTINCT ON (m."owner_id") m."owner_id", m."costume",
            COALESCE(pr."show_costume", true) AS "show_costume"
     FROM "monsters" m
     LEFT JOIN "player_profiles" pr ON pr."user_id" = m."owner_id" AND pr."deleted_at" IS NULL
     WHERE m."owner_id" = ANY($1) AND m."died_at" IS NULL AND m."deleted_at" IS NULL
     ORDER BY m."owner_id", m."selected_at" DESC NULLS LAST, m."born_at" DESC`,
    [ids]
  )
  for (const row of rows) {
    const loadout = publicLoadout(row.costume, row.show_costume)
    if (loadout) {
      result.set(row.owner_id, loadout)
    }
  }
  return result
}

// Gives a costume (a reward); a second grant of the same one changes nothing.
export const grantCostume = async (userId: string, costumeId: string, etm: EntityManager) => {
  const inserted = await etm
    .createQueryBuilder()
    .insert()
    .into(PlayerCostumeEntity)
    .values({ userId, costumeId })
    .orIgnore()
    .returning(['id'])
    .execute()
  return (inserted.raw as unknown[]).length > 0
}

const CURRENCY = { coin: EnumWalletCurrency.COIN, gem: EnumWalletCurrency.GEM } as const

@Injectable()
export class CostumeService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService,
    private readonly inventoryService: InventoryService,
    private readonly walletService: WalletService,
    private readonly profileService: ProfileService
  ) {}

  private async ownedIds(userId: string, etm: EntityManager) {
    const rows = await etm.find(PlayerCostumeEntity, { where: { userId } })
    return new Set([
      ...COSTUMES.filter(isFreeCostume).map(costume => costume.id),
      ...rows.map(row => row.costumeId),
    ])
  }

  // Catalog, what the player owns, what each living pet wears and the privacy switch.
  async getState(userId: string, etm: EntityManager = this.dataSource.manager) {
    const [owned, living, profile] = await Promise.all([
      this.ownedIds(userId, etm),
      this.monsterService.getLiving(userId, etm),
      etm.findOne(PlayerProfileEntity, { where: { userId } }),
    ])
    return {
      catalog: COSTUMES,
      owned: [...owned],
      themes: themeProgress(owned),
      selectedId: living[0]?.id ?? null,
      pets: living.map(pet => ({ id: pet.id, costume: cleanLoadout(pet.costume) })),
      showCostume: profile?.showCostume ?? true,
    }
  }

  private findCostumeOrThrow(costumeId: string): ICostume {
    const costume = findCostume(costumeId)
    if (!costume) {
      throw new NotFoundException('Costume not found')
    }
    return costume
  }

  async buy(userId: string, costumeId: string) {
    assertCostumesEnabled()
    const costume = this.findCostumeOrThrow(costumeId)
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      if (isFreeCostume(costume) || (await this.ownedIds(userId, etm)).has(costume.id)) {
        throw new BadRequestException('You already own this costume')
      }
      const blocker = getBuyBlocker(costume, now)
      if (blocker) {
        throw new BadRequestException(blocker)
      }
      const { currency, amount, bossId } = costume.price
      if (currency === 'boss_token') {
        if (!(await this.inventoryService.spend(userId, bossTokenItemId(bossId!), amount, etm))) {
          throw new BadRequestException('Not enough boss tokens')
        }
      } else {
        await this.walletService.change(
          userId,
          CURRENCY[currency as 'coin' | 'gem'],
          -amount,
          EnumWalletTransactionReason.COSTUME_PURCHASE,
          costume.id,
          etm
        )
      }
      // The unique index decides a race: the loser's insert does nothing and rolls the charge back.
      if (!(await grantCostume(userId, costume.id, etm))) {
        throw new BadRequestException('You already own this costume')
      }
      return this.getState(userId, etm)
    })
  }

  private async lockPet(userId: string, monsterId: string | undefined, etm: EntityManager) {
    const living = await this.monsterService.lockAndTickLiving(userId, new Date(), etm)
    const pet = monsterId ? living.find(row => row.id === monsterId) : living[0]
    if (!pet) {
      throw new NotFoundException('Monster not found')
    }
    return pet
  }

  async equip(userId: string, costumeId: string, monsterId?: string) {
    assertCostumesEnabled()
    const costume = this.findCostumeOrThrow(costumeId)
    return this.dataSource.transaction(async etm => {
      const pet = await this.lockPet(userId, monsterId, etm)
      if (!(await this.ownedIds(userId, etm)).has(costume.id)) {
        throw new BadRequestException('You do not own this costume')
      }
      await etm.save(
        MonsterEntity,
        Object.assign(pet, {
          costume: { ...cleanLoadout(pet.costume), [costume.slot]: costume.id },
        })
      )
      return this.getState(userId, etm)
    })
  }

  async unequip(userId: string, slot: EnumCostumeSlot, monsterId?: string) {
    assertCostumesEnabled()
    if (!COSTUME_SLOTS.includes(slot)) {
      throw new BadRequestException('Unknown costume slot')
    }
    return this.dataSource.transaction(async etm => {
      const pet = await this.lockPet(userId, monsterId, etm)
      const next = cleanLoadout(pet.costume)
      delete next[slot]
      await etm.save(MonsterEntity, Object.assign(pet, { costume: next }))
      return this.getState(userId, etm)
    })
  }

  async setShowCostume(userId: string, show: boolean) {
    assertCostumesEnabled()
    return this.dataSource.transaction(async etm => {
      const profile = await this.profileService.ensureProfile(userId, etm)
      profile.showCostume = show
      await etm.save(PlayerProfileEntity, profile)
      return this.getState(userId, etm)
    })
  }
}
