import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import type { IPotential } from '../../modules/monster/monster-potential'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

export enum EnumMonsterLine {
  FLAME = 'flame',
  TIDE = 'tide',
  LEAF = 'leaf',
  EARTH = 'earth',
  LIGHTNING = 'lightning',
  HOLY = 'holy',
  DARK = 'dark',
  SHADOW = 'shadow',
}

export enum EnumMonsterStage {
  EGG = 'egg',
  BABY_1 = 'baby_1',
  BABY_2 = 'baby_2',
  ADULT = 'adult',
  PERFECT = 'perfect',
  ULTIMATE = 'ultimate',
  // Two merged Ultimates: the final form, never evolves or merges again.
  FUSED = 'fused',
}

export enum EnumMonsterDeathCause {
  OLD_AGE = 'old_age',
  SICKNESS = 'sickness',
  STARVATION = 'starvation',
  // Consumed as a parent of a merge (not a real death).
  MERGED = 'merged',
  // Sent home by the owner for a Pet Core (not a real death either).
  RETURNED = 'returned',
}

// Game rules for every column here live in src/modules/monster/monster-engine.ts - this entity is
// only the persisted shape of IMonsterState. The *_minutes columns are the engine's per-minute
// counters, so a tick can resume exactly where the previous one stopped.
@Entity({
  name: 'monsters',
})
@Index('IDX_monsters_owner_id_alive', ['ownerId'], {
  where: 'died_at IS NULL AND deleted_at IS NULL',
})
@Index('IDX_monsters_owner_id_born_at', ['ownerId', 'bornAt'], {
  where: 'deleted_at IS NULL',
})
export class MonsterEntity extends BaseModelEntity {
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string

  @Column({ name: 'line', type: 'varchar' })
  line: EnumMonsterLine

  // Pet potential rolls (see monster-potential.ts); null for monsters from before it existed.
  @Column({ name: 'potential', type: 'jsonb', nullable: true })
  potential: IPotential | null

  @Column({ name: 'species_id', type: 'varchar' })
  speciesId: string

  @Column({ name: 'stage', type: 'varchar' })
  stage: EnumMonsterStage

  @Column({ name: 'fullness', type: 'real' })
  fullness: number

  @Column({ name: 'strength', type: 'real' })
  strength: number

  @Column({ name: 'stamina', type: 'real', default: 100 })
  stamina: number

  @Column({ name: 'weight', type: 'integer' })
  weight: number

  @Column({ name: 'poops', type: 'integer' })
  poops: number

  @Column({ name: 'is_sick', type: 'boolean' })
  isSick: boolean

  @Column({ name: 'care_mistakes', type: 'integer' })
  careMistakes: number

  @Column({ name: 'train_count', type: 'integer' })
  trainCount: number

  @Column({ name: 'wins', type: 'integer', default: 0 })
  wins: number

  @Column({ name: 'losses', type: 'integer', default: 0 })
  losses: number

  @Column({ name: 'poop_minutes', type: 'integer' })
  poopMinutes: number

  @Column({ name: 'hungry_minutes', type: 'integer' })
  hungryMinutes: number

  @Column({ name: 'weak_minutes', type: 'integer' })
  weakMinutes: number

  @Column({ name: 'sick_minutes', type: 'integer' })
  sickMinutes: number

  @Column({ name: 'stage_minutes', type: 'integer' })
  stageMinutes: number

  @Column({ name: 'age_minutes', type: 'integer' })
  ageMinutes: number

  @Column({ name: 'born_at', type: 'timestamp with time zone' })
  bornAt: Date

  @Column({ name: 'last_tick_at', type: 'timestamp with time zone' })
  lastTickAt: Date

  @Column({ name: 'last_seen_at', type: 'timestamp with time zone', nullable: true })
  lastSeenAt: Date | null

  @Column({ name: 'last_trained_at', type: 'timestamp with time zone', nullable: true })
  lastTrainedAt: Date | null

  // Set while on an expedition (see EXPEDITION_* in monster-rules.ts). `expedition_rate` is the
  // coins/hour fixed at departure; `expedition_returned` = it came home and waits to be collected.
  @Column({ name: 'expedition_area_id', type: 'varchar', nullable: true })
  expeditionAreaId: string | null

  @Column({ name: 'expedition_minutes', type: 'integer', default: 0 })
  expeditionMinutes: number

  @Column({ name: 'expedition_rate', type: 'real', default: 0 })
  expeditionRate: number

  @Column({ name: 'expedition_returned', type: 'boolean', default: false })
  expeditionReturned: boolean

  @Column({ name: 'last_auto_battle_at', type: 'timestamp with time zone', nullable: true })
  lastAutoBattleAt: Date | null

  @Column({ name: 'last_minigame_at', type: 'timestamp with time zone', nullable: true })
  lastMinigameAt: Date | null

  // When the owner last picked this monster as the one they play with (battles, expeditions,
  // equipment...). The most recently selected living monster is the active one.
  @Column({ name: 'selected_at', type: 'timestamp with time zone', nullable: true })
  selectedAt: Date | null

  // Chosen by the owner and shown to other players next to the species (see monster-name.ts).
  @Column({ name: 'nickname', type: 'varchar', length: 16, nullable: true })
  nickname: string | null

  @Column({ name: 'last_renamed_at', type: 'timestamp with time zone', nullable: true })
  lastRenamedAt: Date | null

  // What the pet wears: slot -> costume id (see src/modules/monster/costume-data.ts).
  @Column({ name: 'costume', type: 'jsonb', default: () => `'{}'` })
  costume: Record<string, string>

  // Arena skill slots (innate comes from the species): { s1, s2, dodge } skill ids, or null for none
  // chosen yet. Cleaned against unlocks and equip rules on every read (see arena-fighter.ts).
  @Column({ name: 'skill_loadout', type: 'jsonb', nullable: true })
  skillLoadout: { s1: string | null; s2: string | null; dodge: string | null } | null

  @Column({ name: 'died_at', type: 'timestamp with time zone', nullable: true })
  diedAt: Date | null

  @Column({ name: 'death_cause', type: 'varchar', nullable: true })
  deathCause: EnumMonsterDeathCause | null

  @JoinColumn({ name: 'owner_id', foreignKeyConstraintName: 'FK_monsters_owner_id' })
  @ManyToOne(() => UserEntity)
  owner: UserEntity
}
