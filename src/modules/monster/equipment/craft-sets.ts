import type { ISetBonus } from './equipment-data'

// The 12 craft-only sets (phase 5.6, docs/tamagotchi/craft.md). Kept apart from equipment-data.ts,
// which pulls these in, so this file may only import TYPES from it (no import cycle).
// 2 pieces: a small stat boost (care sets: care perks). 4 pieces: arena effects, tuned by
// craft-balance.spec.ts so the sets beat each other about as often as they lose.

export type CraftEssence = 'flame' | 'tide' | 'leaf' | 'earth' | 'lightning' | 'holy'
export type CraftUnique = 'verdant_heart' | 'reaper_edge' | 'storm_sigil'

export interface ICraftSet {
  id: string
  // Thai names are placeholders: change them here only.
  name: string
  // Piece names end with this (weapon + prefix, ...).
  prefix: string
  emoji: string
  // Playstyle, for the guide.
  style: string
  // Flagship sets craft at legendary (Catalyst: mythic) and need a unique material.
  flagship: boolean
  essence: CraftEssence
  // Rare core: forge = offence, rune = defence and care.
  rare: 'forge' | 'rune'
  unique?: CraftUnique
  // Care sets are balanced against a lower win band (they pay back on the care side).
  care?: boolean
  bonuses: ISetBonus[]
}

export const CRAFT_SETS: ICraftSet[] = [
  {
    id: 'bulwark',
    name: 'ชุดปราการศิลา',
    prefix: 'ปราการศิลา',
    emoji: '🧱',
    style: 'tank',
    flagship: false,
    essence: 'earth',
    rare: 'rune',
    bonuses: [
      { pieces: 2, pct: { def: 0.1 } },
      { pieces: 4, effect: { damageCut: 0.11, shieldPct: 0.03 } },
    ],
  },
  {
    id: 'evergreen',
    name: 'ชุดพนาอมตะ',
    prefix: 'พนาอมตะ',
    emoji: '🌳',
    style: 'regen',
    flagship: true,
    essence: 'leaf',
    rare: 'rune',
    unique: 'verdant_heart',
    bonuses: [
      { pieces: 2, pct: { hp: 0.1 } },
      { pieces: 4, effect: { lifesteal: 0.1, regenPct: 0.0009 } },
    ],
  },
  {
    id: 'executioner',
    name: 'ชุดเพชฌฆาต',
    prefix: 'เพชฌฆาต',
    emoji: '🪓',
    style: 'burst',
    flagship: true,
    essence: 'flame',
    rare: 'forge',
    unique: 'reaper_edge',
    bonuses: [
      { pieces: 2, pct: { atk: 0.08 } },
      { pieces: 4, effect: { executeBonus: 0.4, critDamage: 0.1 } },
    ],
  },
  {
    id: 'marksman',
    name: 'ชุดพลแม่นปืน',
    prefix: 'พลแม่นปืน',
    emoji: '🎯',
    style: 'crit',
    flagship: false,
    essence: 'lightning',
    rare: 'forge',
    bonuses: [
      { pieces: 2, pct: { atk: 0.06 } },
      { pieces: 4, effect: { critChance: 0.15, defDownOnBasic: 45 } },
    ],
  },
  {
    id: 'tempo',
    name: 'ชุดจังหวะลม',
    prefix: 'จังหวะลม',
    emoji: '🌬️',
    style: 'speed',
    flagship: false,
    essence: 'lightning',
    rare: 'forge',
    bonuses: [
      { pieces: 2, pct: { spd: 0.08 } },
      { pieces: 4, effect: { firstStrike: 1, slowOnBasic: 50, cooldownCut: 0.3 } },
    ],
  },
  {
    id: 'mirage',
    name: 'ชุดมายาภาพ',
    prefix: 'มายาภาพ',
    emoji: '🪞',
    style: 'evasion',
    flagship: false,
    essence: 'tide',
    rare: 'rune',
    bonuses: [
      { pieces: 2, pct: { spd: 0.06 } },
      { pieces: 4, effect: { evasion: 0.12, retort: 0.5 } },
    ],
  },
  {
    id: 'venomancer',
    name: 'ชุดพิษพรายน้ำ',
    prefix: 'พิษพรายน้ำ',
    emoji: '🧪',
    style: 'dot',
    flagship: false,
    essence: 'leaf',
    rare: 'forge',
    bonuses: [
      { pieces: 2, pct: { atk: 0.06 } },
      { pieces: 4, effect: { poisonOnBasic: 35, poisonBonus: 0.12 } },
    ],
  },
  {
    id: 'tempest_binder',
    name: 'ชุดพันธนาการพายุ',
    prefix: 'พันธนาการพายุ',
    emoji: '⛓️',
    style: 'control',
    flagship: true,
    essence: 'tide',
    rare: 'forge',
    unique: 'storm_sigil',
    bonuses: [
      { pieces: 2, pct: { spd: 0.08 } },
      { pieces: 4, effect: { slowOnBasic: 40, stunOnBasic: 14, cooldownCut: 0.17 } },
    ],
  },
  {
    id: 'thornmail',
    name: 'ชุดเกราะหนาม',
    prefix: 'เกราะหนาม',
    emoji: '🌵',
    style: 'reflect',
    flagship: false,
    essence: 'flame',
    rare: 'rune',
    bonuses: [
      { pieces: 2, pct: { def: 0.08 } },
      { pieces: 4, effect: { thorns: 0.15, shieldPct: 0.03 } },
    ],
  },
  {
    id: 'aegis_oracle',
    name: 'ชุดโหราผู้พิทักษ์',
    prefix: 'โหราผู้พิทักษ์',
    emoji: '🔮',
    style: 'support',
    flagship: false,
    essence: 'holy',
    rare: 'rune',
    bonuses: [
      { pieces: 2, pct: { hp: 0.08 } },
      { pieces: 4, effect: { shieldRefresh: 0.05, curseOnBasic: 20 } },
    ],
  },
  {
    id: 'caretaker',
    name: 'ชุดผู้ดูแล',
    prefix: 'ผู้ดูแล',
    emoji: '🧺',
    style: 'care',
    flagship: false,
    care: true,
    essence: 'holy',
    rare: 'rune',
    bonuses: [
      { pieces: 2, pct: { hp: 0.05 }, care: { slowHunger: 10, tidyPet: 15 } },
      { pieces: 4, effect: { regenPct: 0.0039 } },
    ],
  },
  {
    id: 'wayfarer',
    name: 'ชุดนักเดินทาง',
    prefix: 'นักเดินทาง',
    emoji: '🧭',
    style: 'explore',
    flagship: false,
    care: true,
    essence: 'earth',
    rare: 'rune',
    bonuses: [
      { pieces: 2, pct: { hp: 0.05 }, care: { staminaSaver: 10, treasureNose: 10 } },
      { pieces: 4, effect: { shieldPct: 0.14 } },
    ],
  },
]

export const findCraftSet = (setId: string) => CRAFT_SETS.find(set => set.id === setId)
export const isCraftSetId = (setId: string | null | undefined) => !!setId && !!findCraftSet(setId)
export const isFlagshipSetId = (setId: string | null | undefined) =>
  !!setId && !!findCraftSet(setId)?.flagship
