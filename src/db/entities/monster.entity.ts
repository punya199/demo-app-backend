import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm'
import { BaseModelEntity } from './base-model.entity'
import { UserEntity } from './user.entity'

export enum EnumMonsterLine {
  FLAME = 'flame',
  TIDE = 'tide',
  LEAF = 'leaf',
}

export enum EnumMonsterStage {
  EGG = 'egg',
  BABY_1 = 'baby_1',
  BABY_2 = 'baby_2',
  ADULT = 'adult',
  PERFECT = 'perfect',
  ULTIMATE = 'ultimate',
}

export enum EnumMonsterDeathCause {
  OLD_AGE = 'old_age',
  SICKNESS = 'sickness',
  STARVATION = 'starvation',
}

// Game rules for every column here live in src/modules/monster/monster-engine.ts - this entity is
// only the persisted shape of IMonsterState. The *_minutes columns are the engine's per-minute
// counters, so a tick can resume exactly where the previous one stopped.
@Entity({
  name: 'monsters',
})
@Index('IDX_monsters_owner_id_alive', ['ownerId'], {
  unique: true,
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

  @Column({ name: 'species_id', type: 'varchar' })
  speciesId: string

  @Column({ name: 'stage', type: 'varchar' })
  stage: EnumMonsterStage

  @Column({ name: 'fullness', type: 'real' })
  fullness: number

  @Column({ name: 'strength', type: 'real' })
  strength: number

  @Column({ name: 'weight', type: 'integer' })
  weight: number

  @Column({ name: 'poops', type: 'integer' })
  poops: number

  @Column({ name: 'is_sick', type: 'boolean' })
  isSick: boolean

  @Column({ name: 'lights_on', type: 'boolean' })
  lightsOn: boolean

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

  @Column({ name: 'sleep_light_minutes', type: 'integer' })
  sleepLightMinutes: number

  @Column({ name: 'stage_minutes', type: 'integer' })
  stageMinutes: number

  @Column({ name: 'age_minutes', type: 'integer' })
  ageMinutes: number

  @Column({ name: 'born_at', type: 'timestamp with time zone' })
  bornAt: Date

  @Column({ name: 'last_tick_at', type: 'timestamp with time zone' })
  lastTickAt: Date

  @Column({ name: 'last_trained_at', type: 'timestamp with time zone', nullable: true })
  lastTrainedAt: Date | null

  @Column({ name: 'died_at', type: 'timestamp with time zone', nullable: true })
  diedAt: Date | null

  @Column({ name: 'death_cause', type: 'varchar', nullable: true })
  deathCause: EnumMonsterDeathCause | null

  @JoinColumn({ name: 'owner_id', foreignKeyConstraintName: 'FK_monsters_owner_id' })
  @ManyToOne(() => UserEntity)
  owner: UserEntity
}
