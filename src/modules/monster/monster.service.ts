import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, IsNull, Not, Repository } from 'typeorm'
import { EnumMonsterLine, EnumMonsterStage, MonsterEntity } from '../../db/entities/monster.entity'
import { MonsterDexEntity } from '../../db/entities/monster-dex.entity'
import { EnumMonsterLogType, MonsterLogEntity } from '../../db/entities/monster-log.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../db/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import { calcExpeditionCoins, calcExpeditionDrops } from './idle-data'
import {
  applyAction,
  applyMinigame,
  createEgg,
  EnumMonsterAction,
  getEvolutionProgress,
  IMonsterEvent,
  IMonsterState,
  MonsterRuleError,
  refillStamina,
  tick,
} from './monster-engine'
import {
  AUTO_BATTLE_COOLDOWN_MS,
  DEX_DISCOVERY_GEM_REWARD,
  MINIGAME_COOLDOWN_MS,
  STAMINA_REFILL_GEM_PRICE,
  TRAIN_COOLDOWN_MS,
} from './monster-rules'
import { recordQuestProgress } from './quest.service'
import { getSpecies, SPECIES } from './species-data'

const HISTORY_LIMIT = 50

// Runs a monster-engine rule, turning a broken rule into a 400 with the rule's message.
export const withRuleErrors = <T>(rule: () => T): T => {
  try {
    return rule()
  } catch (error) {
    if (error instanceof MonsterRuleError) {
      throw new BadRequestException(error.message)
    }
    throw error
  }
}

const speciesSummary = (speciesId: string) => {
  const species = getSpecies(speciesId)
  return { id: species.id, name: species.name, emoji: species.emoji, stage: species.stage }
}

const readyAt = (last: Date | null, cooldownMs: number) =>
  last ? new Date(last.getTime() + cooldownMs) : null

export const toMonsterView = (monster: MonsterEntity) => {
  const species = getSpecies(monster.speciesId)
  const evolution = getEvolutionProgress(monster)
  return {
    ...monster,
    name: species.name,
    emoji: species.emoji,
    trainReadyAt: readyAt(monster.lastTrainedAt, TRAIN_COOLDOWN_MS),
    minigameReadyAt: readyAt(monster.lastMinigameAt, MINIGAME_COOLDOWN_MS),
    // What collecting the expedition would pay right now (0 when not out).
    expeditionPendingCoins: calcExpeditionCoins(monster.expeditionMinutes, monster.expeditionRate),
    expeditionPendingDrops: calcExpeditionDrops(monster.expeditionMinutes),
    autoBattleReadyAt: readyAt(monster.lastAutoBattleAt, AUTO_BATTLE_COOLDOWN_MS),
    evolution: {
      ...evolution,
      next: evolution.nextSpeciesId ? speciesSummary(evolution.nextSpeciesId) : null,
      rules: evolution.rules.map(rule => ({ ...rule, to: speciesSummary(rule.to) })),
    },
  }
}

@Injectable()
export class MonsterService {
  constructor(
    @InjectRepository(MonsterEntity)
    private readonly monsterRepository: Repository<MonsterEntity>,
    private readonly dataSource: DataSource,
    private readonly walletService: WalletService
  ) {}

  async getMyMonster(userId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const monster = await this.lockAndTickLatest(userId, now, etm)
      return { monster: monster ? toMonsterView(monster) : null }
    })
  }

  async hatch(userId: string, line: EnumMonsterLine) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      // Tick first: a monster still marked alive in the DB may have died since it was last read.
      const latest = await this.lockAndTickLatest(userId, now, etm)
      if (latest && !latest.diedAt) {
        throw new BadRequestException('You already have a living monster')
      }

      const monster = await etm.save(MonsterEntity, { ownerId: userId, ...createEgg(line, now) })
      await this.saveEvents(
        monster,
        [{ type: EnumMonsterLogType.HATCH, at: now, payload: { line } }],
        etm
      )
      return { monster: toMonsterView(monster) }
    })
  }

  async act(userId: string, action: EnumMonsterAction) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const monster = await this.lockAndTickLatest(userId, now, etm)
      if (!monster) {
        throw new NotFoundException('You do not have a monster yet')
      }

      const result = withRuleErrors(() => applyAction(monster, action, now))
      const saved = await this.saveState(monster, result.state, etm)
      await this.saveEvents(saved, result.events, etm)
      return { monster: toMonsterView(saved) }
    })
  }

  async getHistory(userId: string) {
    const monsters = await this.monsterRepository.find({
      where: { ownerId: userId, diedAt: Not(IsNull()) },
      order: { diedAt: 'DESC' },
      take: HISTORY_LIMIT,
    })
    return { monsters: monsters.map(monster => toMonsterView(monster)) }
  }

  async playMinigame(userId: string, hits: number) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const monster = await this.lockAndTickLatest(userId, now, etm)
      if (!monster) {
        throw new NotFoundException('You do not have a monster yet')
      }
      const result = withRuleErrors(() => applyMinigame(monster, hits, now))
      const saved = await this.saveState(monster, result.state, etm)
      await this.saveEvents(saved, result.events, etm)
      return { monster: toMonsterView(saved), reward: result.events[0].payload.reward as number }
    })
  }

  async refillStamina(userId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const monster = await this.lockAndTickLatest(userId, now, etm)
      if (!monster) {
        throw new NotFoundException('You do not have a monster yet')
      }
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

  async getDex(userId: string) {
    const rows = await this.dataSource.getRepository(MonsterDexEntity).find({ where: { userId } })
    const discovered = new Set(rows.map(row => row.speciesId))
    return {
      species: SPECIES.filter(species => species.stage !== EnumMonsterStage.EGG).map(species => {
        const isDiscovered = discovered.has(species.id)
        // Undiscovered entries keep their slot but not their name, so the Dex doesn't spoil them.
        return {
          id: species.id,
          line: species.line,
          stage: species.stage,
          discovered: isDiscovered,
          name: isDiscovered ? species.name : null,
          emoji: isDiscovered ? species.emoji : null,
        }
      }),
    }
  }

  // Loads the owner's most recent monster with a row lock and catches it up to `now`, so every
  // caller in the same transaction sees (and can act on) the current state.
  async lockAndTickLatest(userId: string, now: Date, etm: EntityManager) {
    const monster = await etm.findOne(MonsterEntity, {
      where: { ownerId: userId },
      order: { bornAt: 'DESC' },
      lock: { mode: 'pessimistic_write' },
    })
    if (!monster || monster.diedAt) {
      return monster
    }

    // Every request from the owner marks them online; tick() uses the previous mark to decide
    // which of the elapsed minutes were online.
    const { state, events } = tick(monster, now)
    const saved = await this.saveState(monster, { ...state, lastSeenAt: now }, etm)
    await this.saveEvents(saved, events, etm)
    return saved
  }

  async saveState(monster: MonsterEntity, state: IMonsterState, etm: EntityManager) {
    return etm.save(MonsterEntity, Object.assign(monster, state))
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
      .filter(event => event.type === EnumMonsterLogType.EVOLVE)
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
