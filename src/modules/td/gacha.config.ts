// One place for every gacha number. Placeholders until balancing; the client receives these via
// GET /td/gacha, so what players see always matches what the server rolls.
export type TdRarity = 'common' | 'rare' | 'epic' | 'legendary'
export type TdRole = 'aoe' | 'support' | 'dps'

export interface ITdHeroDef {
  id: string
  name: string
  role: TdRole
  rarity: TdRarity
}

// Weights are percentages and must sum to 100 (checked in gacha.spec.ts).
export const GACHA_RATES: Record<TdRarity, number> = {
  common: 60,
  rare: 30,
  epic: 8,
  legendary: 2,
}
export const GACHA_RARITIES: TdRarity[] = ['common', 'rare', 'epic', 'legendary']

export const GACHA_SINGLE_COST = 150
export const GACHA_TEN_COST = 1350
// The Nth pull without a Legendary is a guaranteed Legendary.
export const GACHA_PITY_LIMIT = 50
export const GACHA_DUPLICATE_SHARDS: Record<TdRarity, number> = {
  common: 10,
  rare: 25,
  epic: 60,
  legendary: 150,
}

export const TD_HEROES: ITdHeroDef[] = [
  { id: 'cinder-witch', name: 'Cinder Witch', role: 'aoe', rarity: 'common' },
  { id: 'frost-herald', name: 'Frost Herald', role: 'aoe', rarity: 'rare' },
  { id: 'storm-caller', name: 'Storm Caller', role: 'aoe', rarity: 'epic' },
  { id: 'sun-oracle', name: 'Sun Oracle', role: 'aoe', rarity: 'legendary' },
  { id: 'moss-healer', name: 'Moss Healer', role: 'support', rarity: 'common' },
  { id: 'tide-bard', name: 'Tide Bard', role: 'support', rarity: 'rare' },
  { id: 'iron-warden', name: 'Iron Warden', role: 'support', rarity: 'epic' },
  { id: 'dawn-priestess', name: 'Dawn Priestess', role: 'support', rarity: 'legendary' },
  { id: 'twig-archer', name: 'Twig Archer', role: 'dps', rarity: 'common' },
  { id: 'ember-lancer', name: 'Ember Lancer', role: 'dps', rarity: 'rare' },
  { id: 'glacier-sniper', name: 'Glacier Sniper', role: 'dps', rarity: 'epic' },
  { id: 'void-blade', name: 'Void Blade', role: 'dps', rarity: 'legendary' },
]
