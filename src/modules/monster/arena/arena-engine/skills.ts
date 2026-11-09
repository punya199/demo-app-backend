import { ARENA_TUNING } from '../arena-data'
import { MAX_BUFF_UPTIME, skillTierPct } from '../arena-rules'
import { ArenaLine, IArenaPassive, IArenaSkill } from '../arena-types'
import { ARENA_SKILL_BY_ID } from './constants'

export type Tuning = typeof ARENA_TUNING

const scalePassive = (p: IArenaPassive, pow: number): IArenaPassive => {
  const k = (v: number) => Math.round(((v * pow) / 100) * 10) / 10
  const out: IArenaPassive = { ...p }
  if (p.rebirthPct) out.rebirthPct = k(p.rebirthPct)
  if (p.regenPct) out.regenPct = k(p.regenPct)
  if (p.damageCut) out.damageCut = k(p.damageCut)
  if (p.tenacity) out.tenacity = k(p.tenacity)
  if (p.basicLifesteal) out.basicLifesteal = k(p.basicLifesteal)
  if (p.eva) out.eva = k(p.eva)
  if (p.dodgeCdCut) out.dodgeCdCut = k(p.dodgeCdCut)
  if (p.meleeRetort) {
    out.meleeRetort = {
      ...p.meleeRetort,
      power: k(p.meleeRetort.power),
      ch: Math.min(100, k(p.meleeRetort.ch)),
    }
  }
  if (p.onBasic) out.onBasic = { ...p.onBasic, ch: Math.min(100, k(p.onBasic.ch)) }
  if (p.lastStand) out.lastStand = { ...p.lastStand, shield: k(p.lastStand.shield) }
  if (p.enrage) out.enrage = { ...p.enrage, atk: k(p.enrage.atk) }
  if (p.afterDodge) out.afterDodge = { ...p.afterDodge, bonus: k(p.afterDodge.bonus) }
  return out
}

// A skill with the balance tuning and its stage tier applied (cooldown and strength multipliers in
// percent). The tier (SKILL_TIER_PCT) multiplies the tuned strength, so skills of one stage stay as
// balanced against each other as the tuning left them.
export const tunedSkill = (skill: IArenaSkill, tuning: Tuning = ARENA_TUNING): IArenaSkill => {
  const tier = skill.slot === 'dodge' ? 100 : skillTierPct(skill.src)
  const t = tuning[skill.id] ?? (tier !== 100 ? {} : undefined)
  if (!t) {
    return skill
  }
  const pow = Math.round(((t.pow ?? 100) * tier) / 100)
  const out: IArenaSkill = { ...skill }
  if (t.cd) out.cd = Math.round(skill.cd * t.cd) / 100
  if (skill.power) out.power = Math.round((skill.power * pow) / 100)
  if (skill.heal) out.heal = Math.round((skill.heal * pow) / 100)
  if (skill.shield) out.shield = Math.round((skill.shield * pow) / 100)
  // Strength also stretches status durations (and regen per second).
  const dur = t.dur !== undefined ? Math.round((t.dur * tier) / 100) : pow
  if (skill.fx && dur !== 100) {
    out.fx = skill.fx.map(e => ({
      ...e,
      dur: Math.round(e.dur * dur) / 100,
      ...(e.val && { val: Math.round(e.val * dur) / 100 }),
    }))
  }
  // A self buff lasts at most MAX_BUFF_UPTIME of the cooldown; strength the cap cuts off goes into
  // the buff's size instead (up to x2.5), so strong buffs get bigger, not permanent.
  if (out.fx && out.cd) {
    const cap = Math.round(out.cd * MAX_BUFF_UPTIME) / 100
    out.fx = out.fx.map(e => {
      if (e.to !== 'self' || e.dur <= cap) {
        return e
      }
      return { ...e, dur: cap, mag: Math.min(250, Math.round((e.dur * 100) / cap)) }
    })
  }
  if (skill.passive && pow !== 100) out.passive = scalePassive(skill.passive, pow)
  if (skill.dodge && (t.cd || t.chance)) {
    out.dodge = {
      ...skill.dodge,
      cd: Math.round(skill.dodge.cd * (t.cd || 100)) / 100,
      chance: skill.dodge.chance + (t.chance || 0),
    }
  }
  return out
}

export const getArenaSkill = (id: string) => tunedSkill(ARENA_SKILL_BY_ID[id])

// Whether a monster may put a skill in a slot: its own element (a fused form: either parent's) or
// neutral; never its innate twice; at most one passive in the whole loadout, the innate included.
export const canEquipArenaSkill = (
  monster: { elements: ArenaLine[]; innate: string | null },
  skill: IArenaSkill,
  loadout: string[] = []
) => {
  if (skill.src === 'enemy') return false
  if (skill.slot === 'dodge') return true
  if (skill.el !== 'neutral' && !monster.elements.includes(skill.el)) return false
  if (skill.id === monster.innate) return false
  if (skill.slot === 'passive') {
    const ids = [monster.innate, ...loadout].filter((id): id is string => !!id)
    if (ids.some(id => ARENA_SKILL_BY_ID[id]?.slot === 'passive')) return false
  }
  return true
}
