import { ARENA_STATUS } from '../arena/arena-data'
import { DEFENSE_K, getArenaSkill, MAX_DEF_CUT } from '../arena/arena-engine'
import { IArenaFx, IArenaPassive, IArenaSkill } from '../arena/arena-types'
import { IFighter } from '../battle/battle-stats'

type IBattleStats = IFighter['stats']

// What the boss screens show about a boss's stats and skills. All text is built here so the
// numbers always come from the same data the arena engine fights with.

// Base damage cut by DEF alone (the arena formula), in whole percent. Status effects such as
// "DEF down" change it during a fight.
export const defReductionPct = (def: number) =>
  Math.round(Math.min(def / (def + DEFENSE_K), MAX_DEF_CUT / 10000) * 100)

const KIND_LABEL: Record<string, string> = {
  melee: 'ประชิด',
  multi: 'ตีหลายครั้ง',
  shot: 'ยิง',
  spread: 'ยิงกระจาย',
  charge: 'พุ่งชน',
  burst: 'ระเบิดรอบตัว',
  zone: 'พื้นที่',
  beam: 'ลำแสง',
  self: 'เสริมตัวเอง',
  dodge: 'หลบ',
}

const describeFx = (fx: IArenaFx) => {
  const status = ARENA_STATUS[fx.st]
  const target = fx.to === 'self' ? 'ตัวเอง' : 'เป้าหมาย'
  return `${fx.ch >= 100 ? '' : `${fx.ch}% `}${status.label} ${fx.dur} วิ (${target})`
}

export interface IBossSkillView {
  id: string
  name: string
  icon: string
  element: string
  kind: string
  slot: IArenaSkill['slot']
  // Seconds; 0 for a passive.
  cooldown: number
  description: string
}

export const describeSkill = (skill: IArenaSkill): string =>
  [
    `ประเภท: ${KIND_LABEL[skill.kind] ?? skill.kind}`,
    skill.power
      ? `พลัง ${skill.power}%${skill.hits && skill.hits > 1 ? ` × ${skill.hits} ครั้ง` : ''}`
      : null,
    skill.fx?.length ? skill.fx.map(describeFx).join(', ') : null,
    skill.heal ? `ฟื้น HP ${skill.heal}%` : null,
    skill.shield ? `โล่ ${skill.shield}%` : null,
    skill.lifesteal ? `ดูด HP ${skill.lifesteal}%` : null,
    skill.note ?? null,
  ]
    .filter(Boolean)
    .join(' · ')

export const toSkillView = (skillId: string): IBossSkillView => {
  const skill = getArenaSkill(skillId)
  return {
    id: skill.id,
    name: skill.name,
    icon: skill.icon,
    element: skill.el,
    kind: skill.kind,
    slot: skill.slot,
    cooldown: skill.cd,
    description: describeSkill(skill),
  }
}

// The boss's own passive traits as readable lines (only what bosses use).
export const describePassive = (passive: IArenaPassive | undefined): string[] => {
  if (!passive) {
    return []
  }
  const status = (entry: { st: keyof typeof ARENA_STATUS; dur: number; ch: number }) =>
    `${entry.ch}% ${ARENA_STATUS[entry.st].label} ${entry.dur} วิ`
  return [
    passive.attackSpeed ? `โจมตีเร็วขึ้น ${passive.attackSpeed}%` : null,
    passive.damageCut ? `ลดดาเมจที่ได้รับ ${passive.damageCut}%` : null,
    passive.thorns ? `สะท้อนดาเมจ ${passive.thorns}%` : null,
    passive.eva ? `หลบ +${passive.eva}%` : null,
    passive.onBasic ? `ตีธรรมดา: ${status(passive.onBasic)}` : null,
    passive.flatShield ? `เกราะ ${passive.flatShield} ต่อการตี` : null,
    passive.rage ? `โกรธ: ATK +${passive.rage.atk}% หลัง ${passive.rage.sec} วิ` : null,
  ].filter((line): line is string => !!line)
}

export interface IBossDetail {
  stats: IBattleStats
  defReductionPct: number
  skills: IBossSkillView[]
  passives: string[]
  dodge: IBossSkillView | null
}

export const buildBossDetail = (
  stats: IBattleStats,
  skillIds: string[],
  passive?: IArenaPassive,
  dodgeId?: string | null
): IBossDetail => ({
  stats,
  defReductionPct: defReductionPct(stats.def),
  skills: skillIds.map(toSkillView),
  passives: describePassive(passive),
  dodge: dodgeId ? toSkillView(dodgeId) : null,
})
