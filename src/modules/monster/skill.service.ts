import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { MonsterDexEntity } from '../../db/entities/monster-dex.entity'
import { MonsterEntity } from '../../db/entities/monster.entity'
import { ARENA_SKILLS, ARENA_STATUS } from './arena/arena-data'
import {
  arenaElementsOf,
  arenaInnateOf,
  arenaSkillSource,
  cleanArenaLoadout,
  hasArenaSkills,
  IArenaLoadout,
  unlockedArenaSkillIds,
} from './arena/arena-fighter'
import { ARENA_SKILL_BY_ID, canEquipArenaSkill, getArenaSkill } from './arena/arena-engine'
import { MonsterService } from './monster.service'

// The skill catalog as players see it: tuned numbers and which species unlocks each skill.
export const ARENA_SKILL_CATALOG = ARENA_SKILLS.map(skill => ({
  ...getArenaSkill(skill.id),
  source: arenaSkillSource(skill.src),
}))

export const loadUnlockedArenaSkills = async (userId: string, etm: EntityManager) => {
  const rows = await etm.find(MonsterDexEntity, { where: { userId } })
  return new Set(unlockedArenaSkillIds(rows.map(row => row.speciesId)))
}

const petView = (pet: MonsterEntity, unlocked: Set<string>) => ({
  id: pet.id,
  speciesId: pet.speciesId,
  stage: pet.stage,
  elements: arenaElementsOf(pet),
  hasSkills: hasArenaSkills(pet.stage),
  innate: arenaInnateOf(pet),
  loadout: cleanArenaLoadout(pet, pet.skillLoadout, unlocked),
})

@Injectable()
export class SkillService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService
  ) {}

  // Catalog, what the player has unlocked, and each living pet's innate skill and slots.
  async getState(userId: string, etm: EntityManager = this.dataSource.manager) {
    const [living, unlocked] = await Promise.all([
      this.monsterService.getLiving(userId, etm),
      loadUnlockedArenaSkills(userId, etm),
    ])
    return {
      catalog: ARENA_SKILL_CATALOG,
      statuses: ARENA_STATUS,
      unlocked: [...unlocked],
      selectedId: living[0]?.id ?? null,
      pets: living.map(pet => petView(pet, unlocked)),
    }
  }

  // Sets a pet's two skill slots and its dodge. Every pick must be unlocked and legal for the pet;
  // null empties a slot.
  async setLoadout(userId: string, loadout: IArenaLoadout, monsterId?: string) {
    return this.dataSource.transaction(async etm => {
      const living = await this.monsterService.lockAndTickLiving(userId, new Date(), etm)
      const pet = monsterId ? living.find(row => row.id === monsterId) : living[0]
      if (!pet) {
        throw new NotFoundException('Monster not found')
      }
      if (!hasArenaSkills(pet.stage)) {
        throw new BadRequestException('Eggs and baby forms cannot use skills yet')
      }
      const unlocked = await loadUnlockedArenaSkills(userId, etm)
      const owner = { elements: arenaElementsOf(pet), innate: arenaInnateOf(pet) }
      const check = (id: string | null, slot: 'skill' | 'dodge', others: string[]) => {
        if (!id) return
        const skill = ARENA_SKILL_BY_ID[id]
        if (!skill || skill.src === 'enemy') throw new NotFoundException('Skill not found')
        if (!unlocked.has(id)) throw new BadRequestException('This skill is not unlocked yet')
        if ((slot === 'dodge') !== (skill.slot === 'dodge')) {
          throw new BadRequestException(
            slot === 'dodge'
              ? 'Only a dodge skill fits the dodge slot'
              : 'A dodge skill only fits the dodge slot'
          )
        }
        if (!canEquipArenaSkill(owner, skill, others)) {
          throw new BadRequestException(
            skill.slot === 'passive'
              ? 'Only one passive skill per loadout (the innate skill counts)'
              : 'This monster cannot use that skill'
          )
        }
      }
      if (loadout.s1 && loadout.s1 === loadout.s2) {
        throw new BadRequestException('The same skill cannot fill both slots')
      }
      check(loadout.s1, 'skill', [])
      check(loadout.s2, 'skill', loadout.s1 ? [loadout.s1] : [])
      check(loadout.dodge, 'dodge', [])
      await etm.update(MonsterEntity, pet.id, { skillLoadout: loadout })
      return this.getState(userId, etm)
    })
  }
}
