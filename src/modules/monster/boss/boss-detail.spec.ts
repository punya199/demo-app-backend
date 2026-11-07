import { DEFENSE_K, MAX_DEF_CUT } from '../arena/arena-engine'
import { buildBossDetail, defReductionPct, describePassive, toSkillView } from './boss-detail'
import { IWorldBoss, WORLD_BOSS_ROTATION } from './world-boss-data'
import { RAID_BOSSES } from './raid-data'

describe('boss detail', () => {
  it('cuts damage by DEF / (DEF + K), never below 0 or above the cap', () => {
    expect(defReductionPct(0)).toBe(0)
    expect(defReductionPct(DEFENSE_K)).toBe(50)
    expect(defReductionPct(10_000)).toBe(MAX_DEF_CUT / 100)
  })

  it('describes every skill, passive and dodge every boss has', () => {
    for (const boss of [...WORLD_BOSS_ROTATION, ...RAID_BOSSES] as Partial<IWorldBoss>[]) {
      const detail = buildBossDetail(
        { hp: 1, atk: 1, def: 10, spd: 1 },
        boss.arenaSkills!,
        boss.arenaPassive,
        boss.arenaDodge
      )
      expect(detail.skills).toHaveLength(boss.arenaSkills!.length)
      detail.skills.forEach(skill => {
        expect(skill.name).toBeTruthy()
        expect(skill.description).toContain('ประเภท')
      })
    }
  })

  it('lists the status a skill applies', () => {
    expect(toSkillView('e_volcano').description).toContain('เผาไหม้')
  })

  it('has nothing to say for a boss without a passive', () => {
    expect(describePassive(undefined)).toEqual([])
  })
})
