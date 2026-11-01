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
import { toFighter } from './battle-stats'
import { calcExpeditionCoins, calcExpeditionDrops } from './idle-data'
import {
  applyAction,
  createEgg,
  EnumMonsterAction,
  getEvolutionProgress,
  IMonsterEvent,
  IMonsterState,
  MonsterRuleError,
  tick,
} from './monster-engine'
import {
  AUTO_BATTLE_COOLDOWN_MS,
  DEX_DISCOVERY_GEM_REWARD,
  MAX_LIVING_MONSTERS,
  TRAIN_COOLDOWN_MS,
} from './monster-rules'
import { recordQuestProgress } from './quest.service'
import { getSpecies, SPECIES } from './species-data'

const HISTORY_LIMIT = 50

const SELECTED_ORDER = {
  selectedAt: { direction: 'DESC', nulls: 'LAST' },
  bornAt: 'DESC',
} as const

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
    // Fighting stats from care (hunger, strength, weight) before gear; an egg can't fight.
    battleStats: species.stage === EnumMonsterStage.EGG ? null : toFighter(monster).stats,
    trainReadyAt: readyAt(monster.lastTrainedAt, TRAIN_COOLDOWN_MS),
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

  // The selected monster (`monster`, what every other screen plays with) plus every living one.
  async getMyMonster(userId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const living = await this.lockAndTickLiving(userId, now, etm)
      const selected = await this.lockAndTickLatest(userId, now, etm)
      return {
        monster: selected ? toMonsterView(selected) : null,
        monsters: living.map(toMonsterView),
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

      const monster = await etm.save(MonsterEntity, {
        ownerId: userId,
        ...createEgg(line, now),
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
    for (const row of rows) {
      const { state, events } = tick(row, now)
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
