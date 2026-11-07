import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomInt } from 'crypto'
import { DataSource } from 'typeorm'
import { simulateArena } from './arena-engine'
import { arenaBattleView, toArenaFighter } from './arena-fighter'
import { defReductionPct } from '../boss/boss-detail'
import { DummyFightBodyDto } from '../dto/dummy.dto'
import {
  asDummyOf,
  DUMMY_DEF_DEFAULT,
  DUMMY_DEF_MAX,
  DUMMY_ELEMENTS,
  DUMMY_FIGHT_SEC,
  plainDummy,
  summarizeDummyFight,
} from './dummy-data'
import { loadEquipmentBonus } from '../equipment/equipment.service'
import { MonsterService } from '../core/monster.service'
import {
  findRaidBoss,
  findRaidDifficulty,
  getRaidBossArena,
  RAID_BOSSES,
  RAID_DIFFICULTIES,
} from '../boss/raid-data'
import { loadArenaLoadout } from '../passive/skill.service'
import { findWorldBoss, getWorldBossArena, WORLD_BOSS_ROTATION } from '../boss/world-boss-data'

@Injectable()
export class DummyService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly monsterService: MonsterService
  ) {}

  getPresets() {
    return {
      fightSec: DUMMY_FIGHT_SEC,
      defDefault: DUMMY_DEF_DEFAULT,
      defMax: DUMMY_DEF_MAX,
      elements: DUMMY_ELEMENTS,
      raidBosses: RAID_BOSSES.map(boss => ({ id: boss.id, name: boss.name, emoji: boss.emoji })),
      difficulties: RAID_DIFFICULTIES.map(entry => entry.difficulty),
      worldBosses: WORLD_BOSS_ROTATION.map(boss => ({
        id: boss.id,
        name: boss.name,
        emoji: boss.emoji,
      })),
    }
  }

  private buildDummy(body: DummyFightBodyDto) {
    if (body.preset === 'plain') {
      return plainDummy(body.def ?? DUMMY_DEF_DEFAULT, body.element ?? 'flame')
    }
    if (body.preset === 'raid') {
      const boss = findRaidBoss(body.bossId ?? '')
      const difficulty = findRaidDifficulty(body.difficulty ?? '')
      if (!boss || !difficulty) {
        throw new NotFoundException('Boss not found')
      }
      return asDummyOf(getRaidBossArena(boss, difficulty))
    }
    const boss = findWorldBoss(body.bossId ?? '')
    if (!boss) {
      throw new NotFoundException('Boss not found')
    }
    return asDummyOf(getWorldBossArena(boss, boss.hp))
  }

  // Read-only: no lock, no tick, nothing saved, no stamina, attempts or rewards.
  async fight(userId: string, body: DummyFightBodyDto) {
    const etm = this.dataSource.manager
    const monster = await this.monsterService.getLatestAlive(userId, etm)
    if (!monster) {
      throw new BadRequestException('You do not have a monster that can fight')
    }
    const dummy = this.buildDummy(body)
    const player = toArenaFighter(
      monster,
      await loadEquipmentBonus(userId, monster.id, etm),
      await loadArenaLoadout(userId, monster, etm)
    )
    const arena = simulateArena([[player], [dummy]], randomInt(0, 2 ** 31), { record: true })
    return {
      battle: arenaBattleView(arena, player, dummy),
      summary: summarizeDummyFight(arena),
      dummy: { def: dummy.def, defReductionPct: defReductionPct(dummy.def) },
    }
  }
}
