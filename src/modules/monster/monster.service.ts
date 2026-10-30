import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, EntityManager, IsNull, Not, Repository } from 'typeorm'
import { EnumMonsterLine, MonsterEntity } from '../../db/entities/monster.entity'
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
import { getSpecies } from './species-data'

const HISTORY_LIMIT = 50

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
        monster.id,
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

      let result: { state: IMonsterState; events: IMonsterEvent[] }
      try {
        result = applyAction(monster, action, now)
      } catch (error) {
        if (error instanceof MonsterRuleError) {
          throw new BadRequestException(error.message)
        }
        throw error
      }

      const saved = await this.saveState(monster, result.state, etm)
      await this.saveEvents(monster.id, result.events, etm)
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

  // Loads the owner's most recent monster with a row lock and catches it up to `now`, so every
  // caller in the same transaction sees (and can act on) the current state.
  private async lockAndTickLatest(userId: string, now: Date, etm: EntityManager) {
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
    await this.saveEvents(monster.id, events, etm)
    return saved
  }

  private async saveState(monster: MonsterEntity, state: IMonsterState, etm: EntityManager) {
    return etm.save(MonsterEntity, Object.assign(monster, state))
  }

  private async saveEvents(monsterId: string, events: IMonsterEvent[], etm: EntityManager) {
    if (!events.length) {
      return
    }
    await etm.save(
      MonsterLogEntity,
      events.map(event => ({
        monsterId,
        type: event.type,
        payload: { ...event.payload, at: event.at.toISOString() },
      }))
    )
  }
}
