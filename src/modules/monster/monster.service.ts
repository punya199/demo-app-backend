import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, IsNull, Not, Repository } from 'typeorm'
import { EnumMonsterLine, EnumMonsterStage, MonsterEntity } from '../../db/entities/monster.entity'
import { MonsterDexEntity } from '../../db/entities/monster-dex.entity'
import { EnumMonsterLogType, MonsterLogEntity } from '../../db/entities/monster-log.entity'
import {
  applyAction,
  createEgg,
  EnumMonsterAction,
  IMonsterEvent,
  IMonsterState,
  isSleeping,
  MonsterRuleError,
  tick,
} from './monster-engine'
import { TRAIN_COOLDOWN_MS } from './monster-rules'
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

export const toMonsterView = (monster: MonsterEntity, now: Date) => {
  const species = getSpecies(monster.speciesId)
  return {
    ...monster,
    name: species.name,
    emoji: species.emoji,
    isSleeping: isSleeping(monster, now),
    trainReadyAt: monster.lastTrainedAt
      ? new Date(monster.lastTrainedAt.getTime() + TRAIN_COOLDOWN_MS)
      : null,
  }
}

@Injectable()
export class MonsterService {
  constructor(
    @InjectRepository(MonsterEntity)
    private readonly monsterRepository: Repository<MonsterEntity>,
    private readonly dataSource: DataSource
  ) {}

  async getMyMonster(userId: string) {
    const now = new Date()
    return this.dataSource.transaction(async etm => {
      const monster = await this.lockAndTickLatest(userId, now, etm)
      return { monster: monster ? toMonsterView(monster, now) : null }
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
      return { monster: toMonsterView(monster, now) }
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
      return { monster: toMonsterView(saved, now) }
    })
  }

  async getHistory(userId: string) {
    const now = new Date()
    const monsters = await this.monsterRepository.find({
      where: { ownerId: userId, diedAt: Not(IsNull()) },
      order: { diedAt: 'DESC' },
      take: HISTORY_LIMIT,
    })
    return { monsters: monsters.map(monster => toMonsterView(monster, now)) }
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

    const { state, events } = tick(monster, now)
    if (state.lastTickAt.getTime() === monster.lastTickAt.getTime()) {
      return monster
    }
    const saved = await this.saveState(monster, state, etm)
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

    const evolvedTo = events
      .filter(event => event.type === EnumMonsterLogType.EVOLVE)
      .map(event => ({ speciesId: event.payload.to as string, at: event.at }))
    if (evolvedTo.length) {
      await etm
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
        .execute()
    }
  }
}
