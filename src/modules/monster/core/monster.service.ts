import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, IsNull, Not, Repository } from 'typeorm'
import {
  EnumMonsterDeathCause,
  EnumMonsterLine,
  EnumMonsterStage,
  MonsterEntity,
} from '../../../db/entities/monster.entity'
import { MonsterDexEntity } from '../../../db/entities/monster-dex.entity'
import { EnumMonsterLogType, MonsterLogEntity } from '../../../db/entities/monster-log.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../../db/entities/wallet-transaction.entity'
import { WalletService } from '../../wallet/wallet.service'
import { randomInt } from 'crypto'
import { rollPotential } from './monster-potential'
import {
  applyAction,
  applyMinigame,
  createEgg,
  EnumMonsterAction,
  IMonsterEvent,
  IMonsterState,
  refillStamina,
  tick,
} from './monster-engine'
import {
  DEX_DISCOVERY_GEM_REWARD,
  MAX_LIVING_MONSTERS,
  RARE_EGG_RAID_TOKEN_PRICE,
  MERGE_COIN_COST,
  MERGE_GEM_COST,
  STAMINA_REFILL_GEM_PRICE,
} from './monster-rules'
import { addToBag } from '../inventory/inventory-bag'
import { assertMergeOpen, createFused } from './monster-merge'
import { assertCanReturnHome, PET_CORES_PER_RETURN, petCoreItemId } from './pet-core'
import { loadPassiveBonus } from '../passive/passive.service'
import { loadSpecialBonus } from './special-bonus'
import { normalizeNickname, RENAME_COOLDOWN_MS } from './monster-name'
import { recordQuestProgress } from '../adventure/quest.service'
import { RARE_EGG_LINES } from './species-data'

import {
  dexView,
  evolutionPathOf,
  releaseGear,
  SELECTED_ORDER,
  toMonsterView,
  withRuleErrors,
} from './monster-view'

export { releaseGear, toMonsterView, withRuleErrors }

const HISTORY_LIMIT = 50

const rand = () => randomInt(0, 1_000_000) / 1_000_000

@Injectable()
export class MonsterService {
  constructor(
    @InjectRepository(MonsterEntity)
    private readonly monsterRepository: Repository<MonsterEntity>,
    private readonly dataSource: DataSource,
    private readonly walletService: WalletService
  ) {}

  // The selected monster (`monster`, what every other screen plays with) plus every living one.
  async getMyMonster(userId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const living = await this.lockAndTickLiving(userId, now, etm)
      const selected = await this.lockAndTickLatest(userId, now, etm)
      return {
        monster: selected ? toMonsterView(selected) : null,
        // Slot order is fixed by birth, so selecting a pet never reshuffles the slots.
        monsters: [...living]
          .sort((a, b) => a.bornAt.getTime() - b.bornAt.getTime())
          .map(toMonsterView),
        maxMonsters: MAX_LIVING_MONSTERS,
      }
    })
  }

  async hatch(userId: string, line: EnumMonsterLine) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      // Tick first: a monster still marked alive in the DB may have died since it was last read.
      const living = await this.lockAndTickLiving(userId, now, etm)
      if (living.length >= MAX_LIVING_MONSTERS) {
        throw new BadRequestException(`You can raise at most ${MAX_LIVING_MONSTERS} monsters`)
      }

      // Rare (spiritual) eggs are paid for in Raid Tokens, in the same transaction as the hatch.
      if (RARE_EGG_LINES.includes(line)) {
        await this.walletService.change(
          userId,
          EnumWalletCurrency.RAID_TOKEN,
          -RARE_EGG_RAID_TOKEN_PRICE,
          EnumWalletTransactionReason.RARE_EGG,
          line,
          etm
        )
      }

      const monster = await etm.save(MonsterEntity, {
        ownerId: userId,
        ...createEgg(line, now, rollPotential(rand)),
        selectedAt: now,
      })
      await this.saveEvents(
        monster,
        [{ type: EnumMonsterLogType.HATCH, at: now, payload: { line } }],
        etm
      )
      return { monster: toMonsterView(monster) }
    })
  }

  async rename(userId: string, monsterId: string, input: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const living = await this.lockAndTickLiving(userId, now, etm)
      const monster = living.find(row => row.id === monsterId)
      if (!monster) {
        throw new NotFoundException('Monster not found')
      }
      let nickname: string | null
      try {
        nickname = normalizeNickname(input)
      } catch (error) {
        throw new BadRequestException((error as Error).message)
      }
      if (
        monster.lastRenamedAt &&
        now.getTime() - monster.lastRenamedAt.getTime() < RENAME_COOLDOWN_MS
      ) {
        throw new BadRequestException('Pet was renamed recently')
      }
      const saved = await etm.save(
        MonsterEntity,
        Object.assign(monster, { nickname, lastRenamedAt: now })
      )
      return { monster: toMonsterView(saved) }
    })
  }

  async select(userId: string, monsterId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const living = await this.lockAndTickLiving(userId, now, etm)
      const monster = living.find(row => row.id === monsterId)
      if (!monster) {
        throw new NotFoundException('Monster not found')
      }
      const saved = await etm.save(MonsterEntity, Object.assign(monster, { selectedAt: now }))
      return { monster: toMonsterView(saved) }
    })
  }

  // Ultimate Merge: consumes two of the player's Ultimates (they leave the slots as "merged") and
  // hatches one Fused monster, all in one transaction so a failed charge keeps both parents.
  async merge(userId: string, firstId: string, secondId: string, baseId: string) {
    if (firstId === secondId) {
      throw new BadRequestException('Pick two different monsters')
    }
    if (baseId !== firstId && baseId !== secondId) {
      throw new BadRequestException('The base must be one of the two monsters')
    }
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const living = await this.lockAndTickLiving(userId, now, etm)
      const first = living.find(row => row.id === firstId)
      const second = living.find(row => row.id === secondId)
      if (!first || !second) {
        throw new NotFoundException('Monster not found')
      }
      const state = withRuleErrors(() => {
        assertMergeOpen(first, second)
        return createFused(first, second, baseId === firstId ? first : second, now)
      })

      await this.walletService.change(
        userId,
        EnumWalletCurrency.COIN,
        -MERGE_COIN_COST,
        EnumWalletTransactionReason.MONSTER_MERGE,
        null,
        etm
      )
      const wallet = await this.walletService.change(
        userId,
        EnumWalletCurrency.GEM,
        -MERGE_GEM_COST,
        EnumWalletTransactionReason.MONSTER_MERGE,
        null,
        etm
      )

      const baseMonster = baseId === firstId ? first : second
      // The fused pet keeps the name of the parent it is based on.
      const created = await etm.save(MonsterEntity, {
        ownerId: userId,
        ...state,
        nickname: baseMonster.nickname,
        selectedAt: now,
      })
      for (const parent of [first, second]) {
        await etm.save(
          MonsterEntity,
          Object.assign(parent, {
            diedAt: now,
            deathCause: EnumMonsterDeathCause.MERGED,
            selectedAt: null,
          })
        )
        await releaseGear(parent.id, etm)
        await etm.save(MonsterLogEntity, {
          monsterId: parent.id,
          type: EnumMonsterLogType.DEATH,
          payload: { cause: EnumMonsterDeathCause.MERGED, into: created.id, at: now.toISOString() },
        })
      }
      await this.saveEvents(
        created,
        [
          {
            type: EnumMonsterLogType.FUSE,
            at: now,
            payload: { from: [firstId, secondId], baseId, to: state.speciesId },
          },
        ],
        etm
      )
      return { monster: toMonsterView(created), wallet }
    })
  }

  // กลับดาว: the pet leaves for good and the owner gets a Pet Core of its species. The gear it wore
  // goes back to the bag; passives, skills and costumes belong to the account, so they stay.
  async returnHome(userId: string, monsterId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const monster = (await this.lockAndTickLiving(userId, now, etm)).find(
        row => row.id === monsterId
      )
      if (!monster) {
        throw new NotFoundException('Monster not found')
      }
      withRuleErrors(() => assertCanReturnHome(monster))

      const coreItemId = petCoreItemId(monster.speciesId)
      await addToBag(etm, userId, coreItemId, PET_CORES_PER_RETURN)
      await etm.save(
        MonsterEntity,
        Object.assign(monster, {
          diedAt: now,
          deathCause: EnumMonsterDeathCause.RETURNED,
          selectedAt: null,
        })
      )
      await releaseGear(monster.id, etm)
      await etm.save(MonsterLogEntity, {
        monsterId: monster.id,
        type: EnumMonsterLogType.DEATH,
        payload: {
          cause: EnumMonsterDeathCause.RETURNED,
          core: coreItemId,
          at: now.toISOString(),
        },
      })
      return { itemId: coreItemId, quantity: PET_CORES_PER_RETURN }
    })
  }

  async act(userId: string, action: EnumMonsterAction, monsterId?: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const monster = monsterId
        ? (await this.lockAndTickLiving(userId, now, etm)).find(row => row.id === monsterId)
        : await this.lockAndTickLatest(userId, now, etm)
      if (!monster) {
        throw new NotFoundException('You do not have a monster yet')
      }

      const result = withRuleErrors(() => applyAction(monster, action, now))
      const saved = await this.saveState(monster, result.state, etm)
      await this.saveEvents(saved, result.events, etm)
      return { monster: toMonsterView(saved) }
    })
  }

  async playMinigame(userId: string, hits: number, monsterId?: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const monster = await this.lockAndTickTarget(userId, now, etm, monsterId)
      const result = withRuleErrors(() => applyMinigame(monster, hits, now))
      const saved = await this.saveState(monster, result.state, etm)
      await this.saveEvents(saved, result.events, etm)
      return { monster: toMonsterView(saved), reward: result.events[0].payload.reward as number }
    })
  }

  async refillStamina(userId: string, monsterId?: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const monster = await this.lockAndTickTarget(userId, now, etm, monsterId)
      // Check the refill is allowed before charging for it.
      const result = withRuleErrors(() => refillStamina(monster, now))
      const wallet = await this.walletService.change(
        userId,
        EnumWalletCurrency.GEM,
        -STAMINA_REFILL_GEM_PRICE,
        EnumWalletTransactionReason.STAMINA_REFILL,
        monster.id,
        etm
      )
      const saved = await this.saveState(monster, result.state, etm)
      await this.saveEvents(saved, result.events, etm)
      return { monster: toMonsterView(saved), wallet }
    })
  }

  // The forms one of the owner's monsters has been, egg first, read from its evolve logs.
  async getEvolutionPath(userId: string, monsterId: string) {
    const monster = await this.monsterRepository.findOne({
      where: { id: monsterId, ownerId: userId },
    })
    if (!monster) {
      throw new NotFoundException('Monster not found')
    }
    const logs = await this.dataSource.getRepository(MonsterLogEntity).find({
      where: { monsterId, type: EnumMonsterLogType.EVOLVE },
    })
    const path = evolutionPathOf(logs, monster.speciesId)
    return { monsterId, path }
  }

  async getHistory(userId: string) {
    const monsters = await this.monsterRepository.find({
      where: { ownerId: userId, diedAt: Not(IsNull()) },
      order: { diedAt: 'DESC' },
      take: HISTORY_LIMIT,
    })
    return { monsters: monsters.map(monster => toMonsterView(monster)) }
  }

  async getDex(userId: string) {
    const rows = await this.dataSource.getRepository(MonsterDexEntity).find({ where: { userId } })
    return { species: dexView(new Set(rows.map(row => row.speciesId))) }
  }

  // Every living pet, selected one first, without locking or ticking (read-only displays).
  async getLiving(userId: string, etm: EntityManager) {
    return etm.find(MonsterEntity, {
      where: { ownerId: userId, diedAt: IsNull() },
      order: SELECTED_ORDER,
    })
  }

  // The owner's selected monster if it is hatched and alive, without locking or ticking: for
  // read-only displays such as the equipment screen's stat totals.
  async getLatestAlive(userId: string, etm: EntityManager) {
    const monster = await etm.findOne(MonsterEntity, {
      where: { ownerId: userId, diedAt: IsNull() },
      order: SELECTED_ORDER,
    })
    return monster && monster.stage !== EnumMonsterStage.EGG ? monster : null
  }

  // Loads every living monster of the owner with a row lock, caught up to `now`. A request marks
  // the owner online, and tick() uses the previous mark to decide which elapsed minutes were online.
  // Monsters that died while away are left out (tick() already saved their death).
  async lockAndTickLiving(userId: string, now: Date, etm: EntityManager) {
    const rows = await etm.find(MonsterEntity, {
      where: { ownerId: userId, diedAt: IsNull() },
      order: SELECTED_ORDER,
      lock: { mode: 'pessimistic_write' },
    })
    const living: MonsterEntity[] = []
    const { hungerDrainMultiplier } = await loadPassiveBonus(userId, etm)
    for (const row of rows) {
      const special = await loadSpecialBonus(row.id, etm)
      const { state, events } = tick(
        row,
        now,
        hungerDrainMultiplier * special.hungerDrainMultiplier,
        special.poopRateMultiplier
      )
      const saved = await this.saveState(row, { ...state, lastSeenAt: now }, etm)
      await this.saveEvents(saved, events, etm)
      if (!saved.diedAt) {
        living.push(saved)
      }
    }
    return living
  }

  // The selected monster, ticked and locked: the living one picked most recently, else the most
  // recently born (dead) one so callers can still say "your monster died".
  async lockAndTickLatest(userId: string, now: Date, etm: EntityManager) {
    const living = await this.lockAndTickLiving(userId, now, etm)
    if (living.length) {
      return living[0]
    }
    return etm.findOne(MonsterEntity, { where: { ownerId: userId }, order: { bornAt: 'DESC' } })
  }

  // The monster an action targets: the given living one, or the selected one.
  private async lockAndTickTarget(
    userId: string,
    now: Date,
    etm: EntityManager,
    monsterId?: string
  ) {
    const monster = monsterId
      ? (await this.lockAndTickLiving(userId, now, etm)).find(row => row.id === monsterId)
      : await this.lockAndTickLatest(userId, now, etm)
    if (!monster) {
      throw new NotFoundException('You do not have a monster yet')
    }
    return monster
  }

  async saveState(monster: MonsterEntity, state: IMonsterState, etm: EntityManager) {
    const isDying = !monster.diedAt && !!state.diedAt
    const saved = await etm.save(MonsterEntity, Object.assign(monster, state))
    if (isDying) {
      await releaseGear(saved.id, etm)
    }
    return saved
  }

  async saveEvents(monster: MonsterEntity, events: IMonsterEvent[], etm: EntityManager) {
    if (!events.length) {
      return
    }
    await etm.save(
      MonsterLogEntity,
      events.map(event => ({
        monsterId: monster.id,
        type: event.type,
        payload: { ...event.payload, at: event.at.toISOString() },
      }))
    )

    await recordQuestProgress(monster.ownerId, new Date(), events, etm)

    const evolvedTo = events
      .filter(
        event => event.type === EnumMonsterLogType.EVOLVE || event.type === EnumMonsterLogType.FUSE
      )
      .map(event => ({ speciesId: event.payload.to as string, at: event.at }))
    if (evolvedTo.length) {
      const inserted = await etm
        .createQueryBuilder()
        .insert()
        .into(MonsterDexEntity)
        .values(
          evolvedTo.map(entry => ({
            userId: monster.ownerId,
            speciesId: entry.speciesId,
            firstSeenAt: entry.at,
          }))
        )
        .orIgnore()
        .returning(['speciesId'])
        .execute()
      // ON CONFLICT DO NOTHING returns only the rows it inserted, i.e. new discoveries.
      const discovered = (inserted.raw as { species_id: string }[]).map(row => row.species_id)
      if (discovered.length) {
        await this.walletService.change(
          monster.ownerId,
          EnumWalletCurrency.GEM,
          discovered.length * DEX_DISCOVERY_GEM_REWARD,
          EnumWalletTransactionReason.DEX_DISCOVERY,
          discovered.join(','),
          etm
        )
      }
    }
  }
}
