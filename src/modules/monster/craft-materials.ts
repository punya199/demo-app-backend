import type { CraftEssence, CraftUnique } from './craft-sets'

// The 12 craft materials (docs/tamagotchi/craft.md). They only drop, never sell, and live in the
// normal inventory. Ids are plain strings here so equipment-data.ts can pull this file in without an
// import cycle; EnumMaterialId carries the same ids (craft-data.spec.ts keeps the two in step).

export const CRAFT_ESSENCE_ID: Record<CraftEssence, string> = {
  flame: 'craft_essence_flame',
  tide: 'craft_essence_tide',
  leaf: 'craft_essence_leaf',
  earth: 'craft_essence_earth',
  lightning: 'craft_essence_lightning',
  holy: 'craft_essence_holy',
}
export const CRAFT_RARE_ID = { forge: 'craft_forge_core', rune: 'craft_rune_shard' } as const
export const CRAFT_UNIQUE_ID: Record<CraftUnique, string> = {
  verdant_heart: 'craft_unique_verdant_heart',
  reaper_edge: 'craft_unique_reaper_edge',
  storm_sigil: 'craft_unique_storm_sigil',
}
export const CRAFT_CATALYST_ID = 'craft_catalyst'

export interface ICraftMaterialDef {
  id: string
  name: string
  emoji: string
  description: string
  // Where it drops, for the guide and for "what am I missing".
  source: 'adventure' | 'expedition' | 'raid' | 'world_boss'
  tier: 'common' | 'rare' | 'unique' | 'catalyst'
}

const essence = (element: CraftEssence, name: string, emoji: string): ICraftMaterialDef => ({
  id: CRAFT_ESSENCE_ID[element],
  name: `เอสเซนซ์${name}`,
  emoji,
  description: `วัตถุดิบคราฟต์ธาตุ${name} ได้จากการผจญภัยและสำรวจ`,
  source: 'adventure',
  tier: 'common',
})

export const CRAFT_MATERIAL_DEFS: ICraftMaterialDef[] = [
  essence('flame', 'ไฟ', '🔥'),
  essence('tide', 'น้ำ', '💧'),
  essence('leaf', 'ใบไม้', '🍃'),
  essence('earth', 'ดิน', '🪨'),
  essence('lightning', 'สายฟ้า', '⚡'),
  essence('holy', 'แสง', '✨'),
  {
    id: CRAFT_RARE_ID.forge,
    name: 'แกนหลอมศึก',
    emoji: '⚒️',
    description: 'แกนวัตถุดิบสายบุก ได้จากการชนะ Boss Raid',
    source: 'raid',
    tier: 'rare',
  },
  {
    id: CRAFT_RARE_ID.rune,
    name: 'เศษรูนพิทักษ์',
    emoji: '🔷',
    description: 'แกนวัตถุดิบสายรับและสายดูแล ได้จากการชนะ Boss Raid',
    source: 'raid',
    tier: 'rare',
  },
  {
    id: CRAFT_UNIQUE_ID.verdant_heart,
    name: 'หัวใจพนา',
    emoji: '💚',
    description: 'วัตถุดิบเฉพาะชุดพนาอมตะ ได้จากรางวัลรายสัปดาห์ของ World Boss',
    source: 'world_boss',
    tier: 'unique',
  },
  {
    id: CRAFT_UNIQUE_ID.reaper_edge,
    name: 'คมเคียวเพชฌฆาต',
    emoji: '🗡️',
    description: 'วัตถุดิบเฉพาะชุดเพชฌฆาต ได้จากรางวัลรายสัปดาห์ของ World Boss',
    source: 'world_boss',
    tier: 'unique',
  },
  {
    id: CRAFT_UNIQUE_ID.storm_sigil,
    name: 'ตราพายุ',
    emoji: '🌀',
    description: 'วัตถุดิบเฉพาะชุดพันธนาการพายุ ได้จากรางวัลรายสัปดาห์ของ World Boss',
    source: 'world_boss',
    tier: 'unique',
  },
  {
    id: CRAFT_CATALYST_ID,
    name: 'ตัวเร่งคราฟต์',
    emoji: '🧿',
    description: 'ใช้ตอนเริ่มคราฟต์เพื่อมีโอกาสอัปเกรดเกรด ได้จากรางวัลรายสัปดาห์ของ World Boss',
    source: 'world_boss',
    tier: 'catalyst',
  },
]
