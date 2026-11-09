import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DataSource, EntityManager, IsNull, QueryFailedError } from 'typeorm'
import { CraftJobEntity } from '../../../db/entities/craft-job.entity'
import { PlayerFurnitureEntity } from '../../../db/entities/player-furniture.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { WalletService } from '../../wallet/wallet.service'
import { MonsterService } from '../core/monster.service'
import { InventoryService } from '../inventory/inventory.service'
import {
  EnumFurnitureKind,
  farmEffects,
  FarmTiers,
  farmUpgradeBlocker,
  findFurnitureRecipe,
  FURNITURE_BONUS,
  FURNITURE_BUY_COIN,
  FURNITURE_KINDS,
  furnitureRecipeId,
  IFurnitureRecipe,
  MAX_FURNITURE_TIER,
} from './farm-data'
import { loadFarmTiers } from './farm-effects'

const MINUTE_MS = 60_000
const UNIQUE_VIOLATION = '23505'

const isUniqueViolation = (error: unknown) =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string } | undefined)?.code === UNIQUE_VIOLATION

export interface IFarmUpgradeView {
  // Tier 1 is bought, tiers 2 and 3 are crafted in the shared craft queue.
  via: 'buy' | 'craft'
  toTier: number
  coin: number
  minutes: number
  materials: { itemId: string; qty: number; owned: number }[]
  canStart: boolean
}

export interface IFarmFurnitureView {
  kind: EnumFurnitureKind
  tier: number
  // Bonus on the timer's minutes now and at the next tier.
  bonus: number
  nextBonus: number | null
  next: IFarmUpgradeView | null
}

export interface IFarmView {
  furniture: IFarmFurnitureView[]
  // The furniture craft in the queue, if any (the queue is shared with equipment crafts).
  queue: {
    kind: EnumFurnitureKind
    toTier: number
    startedAt: string
    finishAt: string
    status: 'running' | 'ready'
  } | null
  // True while an equipment craft holds the queue, so a furniture craft cannot start.
  queueBusy: boolean
  // The timer minutes in effect: fullness and strength drain, poop rate and hunger-to-sick.
  effects: ReturnType<typeof farmEffects>
  coin: number
}

// The Farm: furniture tiers per player. Effects are applied by the tick engine on the server (see
// docs/adr/0001-farm-effects-are-server-side.md); this service only owns buying and upgrading.
@Injectable()
export class FarmService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService,
    private readonly inventoryService: InventoryService,
    private readonly walletService: WalletService
  ) {}

  private findActiveJob(userId: string, etm: EntityManager, lock = false) {
    return etm.findOne(CraftJobEntity, {
      where: { userId, claimedAt: IsNull() },
      ...(lock && { lock: { mode: 'pessimistic_write' as const } }),
    })
  }

  async getFarm(userId: string, etm: EntityManager = this.dataSource.manager): Promise<IFarmView> {
    const now = new Date()
    const tiers = await loadFarmTiers(userId, etm)
    const job = await this.findActiveJob(userId, etm)
    const { items } = await this.inventoryService.getInventory(userId, etm)
    const owned = new Map(items.map(item => [item.itemId, item.quantity]))
    const coin = (await this.walletService.getBalance(userId, etm)).coin
    const jobRecipe = job && findFurnitureRecipe(job.recipeId)

    const furniture = FURNITURE_KINDS.map(kind => {
      const tier = tiers[kind]
      const toTier = tier + 1
      let next: IFarmUpgradeView | null = null
      if (toTier <= MAX_FURNITURE_TIER) {
        const recipe =
          toTier >= 2 ? findFurnitureRecipe(furnitureRecipeId(kind, toTier)) : undefined
        const materials = (recipe?.materials ?? []).map(need => ({
          ...need,
          owned: owned.get(need.itemId) ?? 0,
        }))
        const price = recipe?.coin ?? FURNITURE_BUY_COIN
        next = {
          via: recipe ? 'craft' : 'buy',
          toTier,
          coin: price,
          minutes: recipe?.minutes ?? 0,
          materials,
          canStart:
            coin >= price && materials.every(need => need.owned >= need.qty) && (!recipe || !job),
        }
      }
      return {
        kind,
        tier,
        bonus: FURNITURE_BONUS[kind][tier],
        nextBonus: toTier <= MAX_FURNITURE_TIER ? FURNITURE_BONUS[kind][toTier] : null,
        next,
      }
    })
    return {
      furniture,
      queue:
        job && jobRecipe
          ? {
              kind: jobRecipe.kind,
              toTier: jobRecipe.tier,
              startedAt: job.startedAt.toISOString(),
              finishAt: job.finishAt.toISOString(),
              status: job.finishAt.getTime() <= now.getTime() ? 'ready' : 'running',
            }
          : null,
      queueBusy: !!job && !jobRecipe,
      effects: farmEffects(tiers),
      coin,
    }
  }

  // Tier 1: bought with Coin. Monsters are ticked first so the minutes since their last tick are
  // simulated with the furniture the player owned then, never retroactively with the new one.
  async buy(userId: string, kind: EnumFurnitureKind) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      await this.monsterService.lockAndTickLiving(userId, now, etm)
      const tiers = await loadFarmTiers(userId, etm)
      const blocked = farmUpgradeBlocker(kind, 1, tiers)
      if (blocked) {
        throw new BadRequestException(blocked)
      }
      await this.walletService.change(
        userId,
        EnumWalletCurrency.COIN,
        -FURNITURE_BUY_COIN,
        EnumWalletTransactionReason.FARM_FURNITURE,
        `${kind}:1`,
        etm
      )
      try {
        await etm.save(PlayerFurnitureEntity, { userId, kind, tier: 1 })
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException('This furniture is already owned')
        }
        throw error
      }
      return this.getFarm(userId, etm)
    })
  }

  // Tiers 2 and 3: start a craft in the shared queue (the same one job per player as equipment).
  async startUpgrade(userId: string, kind: EnumFurnitureKind) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const tiers = await loadFarmTiers(userId, etm)
      const toTier = tiers[kind] + 1
      const recipe = findFurnitureRecipe(furnitureRecipeId(kind, toTier))
      const blocked = farmUpgradeBlocker(kind, toTier, tiers)
      if (!recipe || blocked) {
        throw new BadRequestException(blocked ?? 'Buy tier 1 first, or this is the top tier')
      }
      if (await this.findActiveJob(userId, etm)) {
        throw new ConflictException('A craft is already in the queue')
      }
      await this.assertCanAfford(userId, recipe, etm)
      await this.walletService.change(
        userId,
        EnumWalletCurrency.COIN,
        -recipe.coin,
        EnumWalletTransactionReason.FARM_FURNITURE,
        recipe.id,
        etm
      )
      for (const need of recipe.materials) {
        if (!(await this.inventoryService.spend(userId, need.itemId, need.qty, etm))) {
          throw new BadRequestException('Not enough materials')
        }
      }
      try {
        await etm.save(CraftJobEntity, {
          userId,
          recipeId: recipe.id,
          useCatalyst: false,
          startedAt: now,
          finishAt: new Date(now.getTime() + recipe.minutes * MINUTE_MS),
          claimedAt: null,
        })
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException('A craft is already in the queue')
        }
        throw error
      }
      return this.getFarm(userId, etm)
    })
  }

  private async assertCanAfford(userId: string, recipe: IFurnitureRecipe, etm: EntityManager) {
    const { items } = await this.inventoryService.getInventory(userId, etm)
    const owned = new Map(items.map(item => [item.itemId, item.quantity]))
    if (recipe.materials.some(need => (owned.get(need.itemId) ?? 0) < need.qty)) {
      throw new BadRequestException('Not enough materials')
    }
    if ((await this.walletService.getBalance(userId, etm)).coin < recipe.coin) {
      throw new BadRequestException('Not enough coins')
    }
  }

  // Collect a finished furniture craft: the tier goes up and applies from now on. The old tier
  // worked the whole time the craft was running.
  async claim(userId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const job = await this.findActiveJob(userId, etm, true)
      const recipe = job && findFurnitureRecipe(job.recipeId)
      if (!job || !recipe) {
        throw new NotFoundException('There is no furniture craft to claim')
      }
      if (job.finishAt.getTime() > now.getTime()) {
        throw new BadRequestException('The craft is not finished yet')
      }
      await this.monsterService.lockAndTickLiving(userId, now, etm)
      const tiers: FarmTiers = await loadFarmTiers(userId, etm)
      if (tiers[recipe.kind] !== recipe.tier - 1) {
        throw new ConflictException('This furniture is no longer at the tier this craft expects')
      }
      const claimed = await etm
        .createQueryBuilder()
        .update(CraftJobEntity)
        .set({ claimedAt: now })
        .where('id = :id AND claimed_at IS NULL', { id: job.id })
        .execute()
      if (!claimed.affected) {
        throw new ConflictException('This craft was already claimed')
      }
      await etm.update(PlayerFurnitureEntity, { userId, kind: recipe.kind }, { tier: recipe.tier })
      return this.getFarm(userId, etm)
    })
  }
}
