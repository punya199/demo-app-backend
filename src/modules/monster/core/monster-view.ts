import { BadRequestException } from '@nestjs/common'
import { EntityManager } from 'typeorm'
import { EquipmentItemEntity } from '../../../db/entities/equipment-item.entity'
import { EnumMonsterStage, MonsterEntity } from '../../../db/entities/monster.entity'
import { MonsterLogEntity } from '../../../db/entities/monster-log.entity'
import { toFighter } from '../battle/battle-stats'
import { calcExpeditionCoins, calcExpeditionDrops } from '../adventure/idle-data'
import { getEvolutionProgress, MonsterRuleError } from './monster-engine'
import { MINIGAME_COOLDOWN_MS, TRAIN_COOLDOWN_MS } from './monster-rules'
import { buildPotentialView } from './monster-potential'
import { getSpecies, SPECIES } from './species-data'

// A dead or merged pet takes nothing with it: the gear it wore goes back to the bag.
export const releaseGear = (monsterId: string, etm: EntityManager) =>
  etm.update(
    EquipmentItemEntity,
    { monsterId, equipped: true },
    { equipped: false, monsterId: null }
  )

export const SELECTED_ORDER = {
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
  return {
    id: species.id,
    name: species.name,
    emoji: species.emoji,
    sprite: species.sprite,
    stage: species.stage,
  }
}

const readyAt = (last: Date | null, cooldownMs: number) =>
  last ? new Date(last.getTime() + cooldownMs) : null

export const toMonsterView = (monster: MonsterEntity) => {
  const species = getSpecies(monster.speciesId)
  const evolution = getEvolutionProgress(monster)
  return {
    ...monster,
    name: species.name,
    // What the owner calls it, falling back to the species name.
    displayName: monster.nickname ?? species.name,
    emoji: species.emoji,
    sprite: species.sprite,
    // Fighting stats from care (hunger, strength, weight) before gear; an egg can't fight.
    // Min / max / rolled value per stat for this form (see monster-potential.ts).
    potentialView: buildPotentialView(species.stats, monster.potential),
    battleStats: species.stage === EnumMonsterStage.EGG ? null : toFighter(monster).stats,
    trainReadyAt: readyAt(monster.lastTrainedAt, TRAIN_COOLDOWN_MS),
    // What collecting the expedition would pay right now (0 when not out).
    expeditionPendingCoins: calcExpeditionCoins(monster.expeditionMinutes, monster.expeditionRate),
    expeditionPendingDrops: calcExpeditionDrops(monster.expeditionMinutes),
    minigameReadyAt: readyAt(monster.lastMinigameAt, MINIGAME_COOLDOWN_MS),
    evolution: {
      ...evolution,
      next: evolution.nextSpeciesId ? speciesSummary(evolution.nextSpeciesId) : null,
      rules: evolution.rules.map(rule => ({ ...rule, to: speciesSummary(rule.to) })),
    },
  }
}

// The forms a monster has been, egg first, from its evolve logs.
export const evolutionPathOf = (logs: MonsterLogEntity[], speciesId: string) => {
  // Several evolutions caught up in one tick share a timestamp, so follow the from -> to links
  // instead of trusting the log order. A merged monster has no evolve logs: just its own form.
  const next = new Map(logs.map(log => [log.payload.from as string, log.payload.to as string]))
  const reached = new Set(next.values())
  let current = [...next.keys()].find(from => !reached.has(from)) ?? speciesId
  const path = [current]
  while (next.has(current) && path.length <= next.size) {
    current = next.get(current)!
    path.push(current)
  }
  return path
}

export const dexView = (discovered: Set<string>) =>
  SPECIES.filter(species => species.stage !== EnumMonsterStage.EGG).map(species => {
    const isDiscovered = discovered.has(species.id)
    // Undiscovered entries keep their slot but not their name, so the Dex doesn't spoil them.
    return {
      id: species.id,
      line: species.line,
      stage: species.stage,
      discovered: isDiscovered,
      name: isDiscovered ? species.name : null,
      emoji: isDiscovered ? species.emoji : null,
      sprite: isDiscovered ? species.sprite : null,
    }
  })
