import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DataSource, EntityManager, IsNull, QueryFailedError } from 'typeorm'
import { CraftJobEntity } from '../../../db/entities/craft-job.entity'
import { CraftPityEntity } from '../../../db/entities/craft-pity.entity'
import { EnumEquipmentLogType, EquipmentLogEntity } from '../../../db/entities/equipment-log.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { WalletService } from '../../wallet/wallet.service'
import {
  buildCraftOverview,
  craftFinishAt,
  findCraftRecipe,
  ICraftRecipe,
  recipeNeeds,
  rollCraftGrade,
} from './craft-data'
import { buildSetPiece } from './equipment-data'
import { grantItem, isEquipmentBagFull, rand, toEquipmentView } from './equipment.service'
import { InventoryService } from '../inventory/inventory.service'

const UNIQUE_VIOLATION = '23505'

const isUniqueViolation = (error: unknown) =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string } | undefined)?.code === UNIQUE_VIOLATION

// The craft queue (docs/tamagotchi/craft.md): one job per player, started with materials and Coin,
// finished by the server clock, claimed into the bag. No cron: everything is decided on read/click.
@Injectable()
export class CraftService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly inventoryService: InventoryService,
    private readonly walletService: WalletService
  ) {}

  private findActiveJob(userId: string, etm: EntityManager, lock = false) {
    return etm.findOne(CraftJobEntity, {
      where: { userId, claimedAt: IsNull() },
      ...(lock && { lock: { mode: 'pessimistic_write' as const } }),
    })
  }

  async getOverview(userId: string, etm: EntityManager = this.dataSource.manager) {
    const now = new Date()
    const job = await this.findActiveJob(userId, etm)
    const { items } = await this.inventoryService.getInventory(userId, etm)
    const pityRows = await etm.find(CraftPityEntity, { where: { userId } })
    return buildCraftOverview({
      job,
      owned: new Map(items.map(item => [item.itemId, item.quantity])),
      pity: new Map(pityRows.map(row => [row.step, row.fails])),
      coin: (await this.walletService.getBalance(userId, etm)).coin,
      now,
    })
  }

  async start(userId: string, recipeId: string, useCatalyst: boolean) {
    const recipe = findCraftRecipe(recipeId)
    if (!recipe) {
      throw new NotFoundException('Recipe not found')
    }
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      // Rule checks first: a refused start must not take anything.
      if (await this.findActiveJob(userId, etm)) {
        throw new ConflictException('A craft is already in the queue')
      }
      await this.assertCanAfford(userId, recipe, useCatalyst, etm)

      // Spend before creating the job, all in this transaction.
      await this.walletService.change(
        userId,
        EnumWalletCurrency.COIN,
        -recipe.coin,
        EnumWalletTransactionReason.CRAFT,
        recipe.id,
        etm
      )
      for (const need of recipeNeeds(recipe, useCatalyst)) {
        if (!(await this.inventoryService.spend(userId, need.itemId, need.qty, etm))) {
          throw new BadRequestException('Not enough materials')
        }
      }
      try {
        // The unique partial index (one unclaimed job per player) decides a race.
        await etm.save(CraftJobEntity, {
          userId,
          recipeId: recipe.id,
          useCatalyst,
          startedAt: now,
          finishAt: craftFinishAt(recipe, now),
          claimedAt: null,
        })
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictException('A craft is already in the queue')
        }
        throw error
      }
      return this.getOverview(userId, etm)
    })
  }

  private async assertCanAfford(
    userId: string,
    recipe: ICraftRecipe,
    useCatalyst: boolean,
    etm: EntityManager
  ) {
    const { items } = await this.inventoryService.getInventory(userId, etm)
    const owned = new Map(items.map(item => [item.itemId, item.quantity]))
    if (recipeNeeds(recipe, useCatalyst).some(need => (owned.get(need.itemId) ?? 0) < need.qty)) {
      throw new BadRequestException('Not enough materials')
    }
    if ((await this.walletService.getBalance(userId, etm)).coin < recipe.coin) {
      throw new BadRequestException('Not enough coins')
    }
  }

  async claim(userId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const job = await this.findActiveJob(userId, etm, true)
      const recipe = job && findCraftRecipe(job.recipeId)
      if (!job || !recipe) {
        throw new NotFoundException('There is no craft to claim')
      }
      if (job.finishAt.getTime() > now.getTime()) {
        throw new BadRequestException('The craft is not finished yet')
      }
      // A full bag refuses before anything is decided: the job stays in the queue.
      if (await isEquipmentBagFull(userId, etm)) {
        throw new ConflictException('Equipment bag is full: free some space, then claim again')
      }
      // The conditional UPDATE is what makes a double click claim once.
      const claimed = await etm
        .createQueryBuilder()
        .update(CraftJobEntity)
        .set({ claimedAt: now })
        .where('id = :id AND claimed_at IS NULL', { id: job.id })
        .execute()
      if (!claimed.affected) {
        throw new ConflictException('This craft was already claimed')
      }

      const failsBefore = job.useCatalyst ? await this.lockPity(userId, recipe.step, etm) : 0
      const result = rollCraftGrade(recipe, job.useCatalyst, failsBefore, rand())
      if (result.fails !== null) {
        await etm.update(CraftPityEntity, { userId, step: recipe.step }, { fails: result.fails })
      }
      const row = await grantItem(
        userId,
        buildSetPiece(recipe.templateId, result.grade, rand),
        `craft:${recipe.id}`,
        etm
      )
      if (!row) {
        throw new ConflictException('Equipment bag is full: free some space, then claim again')
      }
      await etm.save(EquipmentLogEntity, {
        userId,
        equipmentId: row.id,
        type: EnumEquipmentLogType.CRAFT,
        payload: {
          recipeId: recipe.id,
          jobId: job.id,
          grade: result.grade,
          upgraded: result.upgraded,
          useCatalyst: job.useCatalyst,
          failsBefore,
        },
      })
      return {
        item: toEquipmentView(row),
        upgraded: result.upgraded,
        overview: await this.getOverview(userId, etm),
      }
    })
  }

  // The player's failure count for one step, row-locked (created at 0 on first use).
  private async lockPity(userId: string, step: string, etm: EntityManager) {
    await etm
      .createQueryBuilder()
      .insert()
      .into(CraftPityEntity)
      .values({ userId, step, fails: 0 })
      .orIgnore()
      .execute()
    const row = await etm.findOneOrFail(CraftPityEntity, {
      where: { userId, step },
      lock: { mode: 'pessimistic_write' },
    })
    return row.fails
  }
}
