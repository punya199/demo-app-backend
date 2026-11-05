import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { DataSource, EntityManager } from 'typeorm'
import { AdventureProgressEntity } from '../../db/entities/adventure-progress.entity'
import {
  EnumWalletCurrency,
  EnumWalletTransactionReason,
} from '../../db/entities/wallet-transaction.entity'
import { WalletService } from '../wallet/wallet.service'
import {
  ADVENTURE_AREAS,
  findAdventureStage,
  FIRST_CLEAR_MULTIPLIER,
  isStageUnlocked,
} from './adventure-data'
import { ARENA_HP_SCALE, ARENA_TICK } from './arena/arena-rules'
import { getArenaSkill, simulateArena } from './arena/arena-engine'
import {
  arenaEnemyOf,
  cleanArenaLoadout,
  findArenaStage,
  toArenaFighter,
} from './arena/arena-fighter'
import { toArenaReplay } from './arena/arena-replay'
import { IArenaStage } from './arena/arena-types'
import { loadUnlockedArenaSkills } from './skill.service'
import { DROP_GRADE_RATES_BY_AREA, rollGrade } from './equipment-data'
import { grantEquipment, loadEquipmentBonus, toEquipmentView } from './equipment.service'
import { loadPassiveBonus } from './passive.service'
import { loadSpecialBonus } from './special-bonus'
import { applyAdventureSkip, applyBattleOutcome, assertCanAdventure } from './monster-engine'
import { ADVENTURE_STAMINA_COST, EQUIPMENT_DROP_CHANCE_BP } from './monster-rules'
import { toMonsterView, withRuleErrors, MonsterService } from './monster.service'

// A stage's arena enemy for screens: final stats and its skills with tuned numbers.
const arenaEnemyView = (stage: IArenaStage | undefined) => {
  if (!stage) {
    return null
  }
  const fighter = arenaEnemyOf(stage)
  return {
    name: fighter.name,
    emoji: fighter.emoji,
    element: fighter.element,
    isBoss: stage.boss,
    // HP as it is in the fight (the arena triples every HP pool).
    stats: {
      hp: Math.round(fighter.hp * ARENA_HP_SCALE),
      atk: fighter.atk,
      def: fighter.def,
      spd: fighter.spd,
    },
    eva: fighter.eva,
    acc: fighter.acc,
    res: fighter.res,
    skills: stage.skills.map(id => getArenaSkill(id)),
  }
}

@Injectable()
export class AdventureService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService,
    private readonly walletService: WalletService
  ) {}

  async getAdventure(userId: string) {
    const progress = await this.dataSource
      .getRepository(AdventureProgressEntity)
      .find({ where: { userId } })
    const clearCountByStage = new Map(progress.map(row => [row.stageId, row.clearCount]))
    const cleared = new Set(clearCountByStage.keys())

    return {
      areas: ADVENTURE_AREAS.map(area => ({
        id: area.id,
        name: area.name,
        emoji: area.emoji,
        recommendedStage: area.recommendedStage,
        stages: area.stages.map(stage => ({
          id: stage.id,
          isBoss: stage.isBoss,
          enemy: arenaEnemyView(findArenaStage(stage.id)),
          reward: stage.reward,
          firstClearReward: stage.reward * FIRST_CLEAR_MULTIPLIER,
          firstClearGems: stage.firstClearGems,
          clearCount: clearCountByStage.get(stage.id) ?? 0,
          unlocked: isStageUnlocked(stage.id, cleared),
        })),
      })),
    }
  }

  async battle(userId: string, stageId: string) {
    const now = new Date()
    const entry = findAdventureStage(stageId)
    if (!entry) {
      throw new NotFoundException('Stage not found')
    }

    return this.dataSource.transaction(async etm => {
      // The monster row lock also serializes concurrent battles of the same user.
      const monster = await this.monsterService.lockAndTickLatest(userId, now, etm)
      if (!monster) {
        throw new NotFoundException('You do not have a monster yet')
      }

      const progress = await etm.find(AdventureProgressEntity, { where: { userId } })
      const cleared = new Set(progress.map(row => row.stageId))
      if (!isStageUnlocked(stageId, cleared)) {
        throw new BadRequestException('Stage is locked')
      }
      const special = await loadSpecialBonus(monster.id, etm)
      const staminaCost = this.staminaCost(special.staminaCostMultiplier)
      withRuleErrors(() => assertCanAdventure(monster, staminaCost))

      // Adventure fights run in the real-time arena with the pet's skill loadout.
      const arenaStage = findArenaStage(stageId)
      if (!arenaStage) {
        throw new NotFoundException('Stage not found')
      }
      const unlocked = await loadUnlockedArenaSkills(userId, etm)
      const loadout = cleanArenaLoadout(monster, monster.skillLoadout, unlocked)
      const player = toArenaFighter(
        monster,
        await loadEquipmentBonus(userId, monster.id, etm),
        loadout
      )
      const enemy = arenaEnemyOf(arenaStage)
      const seed = randomInt(0, 2 ** 31)
      const arena = simulateArena([[player], [enemy]], seed)
      const result = { won: arena.winner === 0, rounds: Math.ceil(arena.ticks / ARENA_TICK) }

      const isFirstClear = result.won && !cleared.has(stageId)
      let reward = 0
      if (result.won) {
        reward = entry.stage.reward * (isFirstClear ? FIRST_CLEAR_MULTIPLIER : 1)
      }
      const gemReward = isFirstClear ? entry.stage.firstClearGems : 0

      const outcome = withRuleErrors(() =>
        applyBattleOutcome(
          monster,
          result.won,
          { stageId, seed, rounds: result.rounds, reward, gemReward },
          now,
          staminaCost
        )
      )
      const saved = await this.monsterService.saveState(monster, outcome.state, etm)
      await this.monsterService.saveEvents(saved, outcome.events, etm)

      let wallet = await this.walletService.getBalance(userId, etm)
      if (result.won) {
        const existing = progress.find(row => row.stageId === stageId)
        if (existing) {
          existing.clearCount += 1
          await etm.save(AdventureProgressEntity, existing)
        } else {
          await etm.save(AdventureProgressEntity, {
            userId,
            stageId,
            clearCount: 1,
            firstClearedAt: now,
          })
        }
        wallet = await this.walletService.change(
          userId,
          EnumWalletCurrency.COIN,
          reward,
          EnumWalletTransactionReason.BATTLE_REWARD,
          stageId,
          etm
        )
        if (isFirstClear && gemReward > 0) {
          wallet = await this.walletService.change(
            userId,
            EnumWalletCurrency.GEM,
            gemReward,
            EnumWalletTransactionReason.BOSS_FIRST_CLEAR,
            stageId,
            etm
          )
        }
      }

      // A win may drop a piece for the area's grades.
      let drop: ReturnType<typeof toEquipmentView> | null = null
      let dropBagFull = false
      if (result.won) {
        const rolled = await this.rollDrops(
          userId,
          entry.area.id,
          stageId,
          1,
          special.dropMultiplier,
          etm
        )
        drop = rolled.drops[0] ?? null
        dropBagFull = rolled.lost > 0
      }

      return {
        monster: toMonsterView(saved),
        battle: {
          kind: 'arena' as const,
          stageId,
          won: result.won,
          // Seconds the fight lasted.
          rounds: result.rounds,
          replay: toArenaReplay(arena),
          player: { name: player.name, emoji: player.emoji, element: player.element },
          enemy: arenaEnemyView(arenaStage),
          reward,
          gemReward,
          isFirstClear,
          drop,
          dropBagFull,
        },
        wallet,
      }
    })
  }

  // Skip: `runs` wins of a stage cleared before, without fighting. Each run costs a fight's
  // stamina and pays what a repeat win does (coins and a drop roll); bosses included.
  async skip(userId: string, stageId: string, runs: number) {
    const now = new Date()
    const entry = findAdventureStage(stageId)
    if (!entry) {
      throw new NotFoundException('Stage not found')
    }

    return this.dataSource.transaction(async etm => {
      const monster = await this.monsterService.lockAndTickLatest(userId, now, etm)
      if (!monster) {
        throw new NotFoundException('You do not have a monster yet')
      }
      const existing = await etm.findOne(AdventureProgressEntity, { where: { userId, stageId } })
      if (!existing) {
        throw new BadRequestException('Clear this stage once before skipping it')
      }
      const special = await loadSpecialBonus(monster.id, etm)
      const reward = entry.stage.reward
      // The rule check (run count, stamina for every run) comes before anything is paid out.
      const outcome = withRuleErrors(() =>
        applyAdventureSkip(
          monster,
          stageId,
          runs,
          reward,
          now,
          this.staminaCost(special.staminaCostMultiplier)
        )
      )
      const saved = await this.monsterService.saveState(monster, outcome.state, etm)
      await this.monsterService.saveEvents(saved, outcome.events, etm)

      existing.clearCount += runs
      await etm.save(AdventureProgressEntity, existing)
      const wallet = await this.walletService.change(
        userId,
        EnumWalletCurrency.COIN,
        reward * runs,
        EnumWalletTransactionReason.ADVENTURE_SKIP_REWARD,
        stageId,
        etm
      )
      const { drops, lost } = await this.rollDrops(
        userId,
        entry.area.id,
        stageId,
        runs,
        special.dropMultiplier,
        etm
      )

      return {
        monster: toMonsterView(saved),
        skip: { stageId, runs, coins: reward * runs, drops, dropsLost: lost },
        wallet,
      }
    })
  }

  private staminaCost(multiplier: number) {
    return Math.max(1, Math.round(ADVENTURE_STAMINA_COST * multiplier))
  }

  // One drop roll per won run, for the area's grades. A full bag loses the piece (counted in `lost`).
  private async rollDrops(
    userId: string,
    areaId: string,
    stageId: string,
    runs: number,
    dropMultiplier: number,
    etm: EntityManager
  ) {
    const drops: ReturnType<typeof toEquipmentView>[] = []
    let lost = 0
    const rates = DROP_GRADE_RATES_BY_AREA[areaId]
    if (!rates) {
      return { drops, lost }
    }
    const chance =
      EQUIPMENT_DROP_CHANCE_BP *
      (await loadPassiveBonus(userId, etm)).equipmentDropMultiplier *
      dropMultiplier
    for (let run = 0; run < runs; run++) {
      if (randomInt(0, 10_000) >= chance) {
        continue
      }
      const row = await grantEquipment(
        userId,
        rollGrade(rates, randomInt(0, 1_000_000) / 1_000_000),
        `battle:${stageId}`,
        etm
      )
      if (row) {
        drops.push(toEquipmentView(row))
      } else {
        lost += 1
      }
    }
    return { drops, lost }
  }
}
