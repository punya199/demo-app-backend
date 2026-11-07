import { DEFENSE_K, MAX_DEF_CUT } from '../arena/arena-engine'
import { IArenaSkill } from '../arena/arena-types'
import {
  buildBossDetail,
  defReductionPct,
  describePassive,
  describeSkill,
  toSkillView,
} from './boss-detail'
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

describe('boss detail text', () => {
  const base = { id: 's', name: 'S', icon: 'i', el: 'fire', src: 'enemy', slot: 'active', cd: 5 }

  it('describes every part of a skill, and falls back to the raw kind', () => {
    const text = describeSkill({
      ...base,
      kind: 'unknown_kind',
      power: 120,
      hits: 3,
      fx: [
        { st: 'burn', dur: 4, ch: 50 },
        { st: 'burn', dur: 2, ch: 100, to: 'self' },
      ],
      heal: 10,
      shield: 20,
      lifesteal: 30,
      note: 'extra',
    } as unknown as IArenaSkill)
    expect(text).toContain('ประเภท: unknown_kind')
    expect(text).toContain('พลัง 120% × 3 ครั้ง')
    expect(text).toContain('50% เผาไหม้ 4 วิ (เป้าหมาย)')
    expect(text).toContain('เผาไหม้ 2 วิ (ตัวเอง)')
    expect(text).not.toContain('100% เผาไหม้')
    expect(text).toContain('ฟื้น HP 10%')
    expect(text).toContain('โล่ 20%')
    expect(text).toContain('ดูด HP 30%')
    expect(text.endsWith('extra')).toBe(true)
  })

  it('omits the hit count for a single hit and empty parts', () => {
    const text = describeSkill({ ...base, kind: 'melee', power: 100, hits: 1, fx: [] } as never)
    expect(text).toBe('ประเภท: ประชิด · พลัง 100%')
  })

  it('lists every passive trait of a boss', () => {
    const lines = describePassive({
      attackSpeed: 10,
      damageCut: 20,
      thorns: 30,
      eva: 5,
      onBasic: { st: 'burn', dur: 3, ch: 40 },
      flatShield: 99,
      rage: { sec: 30, atk: 50 },
    })
    expect(lines).toHaveLength(7)
    expect(lines).toContain('โกรธ: ATK +50% หลัง 30 วิ')
    expect(lines).toContain('ตีธรรมดา: 40% เผาไหม้ 3 วิ')
    expect(describePassive({})).toEqual([])
  })

  it('adds the dodge skill when the boss has one', () => {
    const stats = { hp: 1, atk: 1, def: 0, spd: 1 }
    const detail = buildBossDetail(stats, [], undefined, 'dg_step')
    expect(detail.dodge?.id).toBe('dg_step')
    expect(buildBossDetail(stats, [], undefined, null).dodge).toBeNull()
  })
})
