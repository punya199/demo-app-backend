import { EnumEquipmentGrade } from './equipment-data'

// Looks only: costumes never touch stats. The catalog is data (served by GET /costume) and the
// client draws a costume from these fields (emoji layers, a glow colour, a backdrop gradient).
export enum EnumCostumeSlot {
  HAT = 'hat',
  FACE = 'face',
  BACK = 'back',
  AURA = 'aura',
  BACKDROP = 'backdrop',
}

export const COSTUME_SLOTS = Object.values(EnumCostumeSlot)

export type CostumeCurrency = 'coin' | 'gem' | 'boss_token' | 'season'

export interface ICostumePrice {
  currency: CostumeCurrency
  amount: number
  // boss_token only: which boss's token pays for it.
  bossId?: string
}

export interface ICostume {
  id: string
  slot: EnumCostumeSlot
  name: string
  // Hat, face and back are drawn as this emoji; an aura is a `color` glow, a backdrop a `gradient`.
  emoji?: string
  color?: string
  gradient?: string
  rarity: EnumEquipmentGrade
  // A label for building a look; completing a theme's hat, face and back pieces earns a badge.
  theme: string | null
  price: ICostumePrice
  // Limited items stop being sold after this date (ISO). Owned ones stay. None are limited yet.
  endsAt?: string
}

export type ILoadout = Partial<Record<EnumCostumeSlot, string>>

// Items that cost nothing are owned by everyone from the start, with no row to buy.
export const COSTUMES: ICostume[] = [
  {
    id: 'cap',
    slot: EnumCostumeSlot.HAT,
    name: 'หมวกแก๊ป',
    emoji: '🧢',
    rarity: EnumEquipmentGrade.COMMON,
    theme: null,
    price: { currency: 'coin', amount: 150 },
  },
  {
    id: 'grad',
    slot: EnumCostumeSlot.HAT,
    name: 'หมวกรับปริญญา',
    emoji: '🎓',
    rarity: EnumEquipmentGrade.COMMON,
    theme: null,
    price: { currency: 'coin', amount: 150 },
  },
  {
    id: 'straw',
    slot: EnumCostumeSlot.HAT,
    name: 'หมวกฟาง',
    emoji: '👒',
    rarity: EnumEquipmentGrade.RARE,
    theme: null,
    price: { currency: 'coin', amount: 500 },
  },
  {
    id: 'tophat',
    slot: EnumCostumeSlot.HAT,
    name: 'หมวกทรงสูง',
    emoji: '🎩',
    rarity: EnumEquipmentGrade.RARE,
    theme: null,
    price: { currency: 'coin', amount: 600 },
  },
  {
    id: 'crown',
    slot: EnumCostumeSlot.HAT,
    name: 'มงกุฎ',
    emoji: '👑',
    rarity: EnumEquipmentGrade.LEGENDARY,
    theme: null,
    price: { currency: 'gem', amount: 80 },
  },
  {
    id: 'glasses',
    slot: EnumCostumeSlot.FACE,
    name: 'แว่นกลม',
    emoji: '👓',
    rarity: EnumEquipmentGrade.COMMON,
    theme: null,
    price: { currency: 'coin', amount: 120 },
  },
  {
    id: 'shades',
    slot: EnumCostumeSlot.FACE,
    name: 'แว่นกันแดด',
    emoji: '🕶️',
    rarity: EnumEquipmentGrade.RARE,
    theme: null,
    price: { currency: 'coin', amount: 400 },
  },
  {
    id: 'disguise',
    slot: EnumCostumeSlot.FACE,
    name: 'หน้ากากปลอมตัว',
    emoji: '🥸',
    rarity: EnumEquipmentGrade.EPIC,
    theme: null,
    price: { currency: 'gem', amount: 30 },
  },
  {
    id: 'mask',
    slot: EnumCostumeSlot.FACE,
    name: 'หน้ากากการแสดง',
    emoji: '🎭',
    rarity: EnumEquipmentGrade.EPIC,
    theme: null,
    price: { currency: 'boss_token', amount: 1, bossId: 'deep_dweller' },
  },
  {
    id: 'backpack',
    slot: EnumCostumeSlot.BACK,
    name: 'เป้สะพายหลัง',
    emoji: '🎒',
    rarity: EnumEquipmentGrade.COMMON,
    theme: null,
    price: { currency: 'coin', amount: 200 },
  },
  {
    id: 'wings',
    slot: EnumCostumeSlot.BACK,
    name: 'ปีกนางฟ้า',
    emoji: '🪽',
    rarity: EnumEquipmentGrade.EPIC,
    theme: null,
    price: { currency: 'gem', amount: 50 },
  },
  {
    id: 'glowFlame',
    slot: EnumCostumeSlot.AURA,
    name: 'แสงถ่านลุก',
    color: '#ff7a45',
    rarity: EnumEquipmentGrade.RARE,
    theme: null,
    price: { currency: 'coin', amount: 800 },
  },
  {
    id: 'glowTide',
    slot: EnumCostumeSlot.AURA,
    name: 'แสงวารี',
    color: '#45a9ff',
    rarity: EnumEquipmentGrade.RARE,
    theme: null,
    price: { currency: 'coin', amount: 800 },
  },
  {
    id: 'glowLeaf',
    slot: EnumCostumeSlot.AURA,
    name: 'แสงพฤกษ์',
    color: '#5fd04a',
    rarity: EnumEquipmentGrade.RARE,
    theme: null,
    price: { currency: 'coin', amount: 800 },
  },
  {
    id: 'loginCrown',
    slot: EnumCostumeSlot.HAT,
    name: 'มงกุฎดาวประจำเดือน',
    emoji: '🌟',
    rarity: EnumEquipmentGrade.EPIC,
    theme: null,
    // Reward for claiming all 28 days of the monthly login board.
    price: { currency: 'season', amount: 0 },
  },
  {
    id: 'rainbow',
    slot: EnumCostumeSlot.AURA,
    name: 'รัศมีสายรุ้ง',
    color: '#c07cff',
    rarity: EnumEquipmentGrade.LEGENDARY,
    theme: null,
    price: { currency: 'season', amount: 0 },
  },
  {
    id: 'meadow',
    slot: EnumCostumeSlot.BACKDROP,
    name: 'ทุ่งหญ้า',
    gradient: 'linear-gradient(#cfe8b8,#b9d9a0)',
    rarity: EnumEquipmentGrade.COMMON,
    theme: null,
    price: { currency: 'coin', amount: 0 },
  },
  {
    id: 'sunset',
    slot: EnumCostumeSlot.BACKDROP,
    name: 'พระอาทิตย์ตก',
    gradient: 'linear-gradient(#ffcf9e,#f08a6a)',
    rarity: EnumEquipmentGrade.COMMON,
    theme: null,
    price: { currency: 'coin', amount: 300 },
  },
  {
    id: 'night',
    slot: EnumCostumeSlot.BACKDROP,
    name: 'ท้องฟ้ายามค่ำ',
    gradient: 'linear-gradient(#1f2a55,#4a3b7c)',
    rarity: EnumEquipmentGrade.RARE,
    theme: null,
    price: { currency: 'coin', amount: 700 },
  },
  {
    id: 'ribbon',
    slot: EnumCostumeSlot.HAT,
    name: 'ริบบิ้น',
    emoji: '🎀',
    rarity: EnumEquipmentGrade.COMMON,
    theme: 'casual',
    price: { currency: 'coin', amount: 150 },
  },
  {
    id: 'helmet',
    slot: EnumCostumeSlot.HAT,
    name: 'หมวกทหาร',
    emoji: '🪖',
    rarity: EnumEquipmentGrade.COMMON,
    theme: 'knight',
    price: { currency: 'coin', amount: 200 },
  },
  {
    id: 'rescue',
    slot: EnumCostumeSlot.HAT,
    name: 'หมวกกู้ภัย',
    emoji: '⛑️',
    rarity: EnumEquipmentGrade.COMMON,
    theme: 'casual',
    price: { currency: 'coin', amount: 200 },
  },
  {
    id: 'cowboy',
    slot: EnumCostumeSlot.HAT,
    name: 'หมวกคาวบอย',
    emoji: '🤠',
    rarity: EnumEquipmentGrade.RARE,
    theme: 'casual',
    price: { currency: 'coin', amount: 450 },
  },
  {
    id: 'flowers',
    slot: EnumCostumeSlot.HAT,
    name: 'มงกุฎดอกไม้',
    emoji: '🌸',
    rarity: EnumEquipmentGrade.RARE,
    theme: 'spring',
    price: { currency: 'coin', amount: 500 },
  },
  {
    id: 'shroom',
    slot: EnumCostumeSlot.HAT,
    name: 'หมวกเห็ด',
    emoji: '🍄',
    rarity: EnumEquipmentGrade.RARE,
    theme: 'spring',
    price: { currency: 'coin', amount: 450 },
  },
  {
    id: 'snowcrown',
    slot: EnumCostumeSlot.HAT,
    name: 'มงกุฎหิมะ',
    emoji: '❄️',
    rarity: EnumEquipmentGrade.EPIC,
    theme: 'winter',
    price: { currency: 'gem', amount: 35 },
  },
  {
    id: 'pumpkin',
    slot: EnumCostumeSlot.HAT,
    name: 'หมวกฟักทอง',
    emoji: '🎃',
    rarity: EnumEquipmentGrade.EPIC,
    theme: 'festival',
    price: { currency: 'gem', amount: 35 },
  },
  {
    id: 'star',
    slot: EnumCostumeSlot.HAT,
    name: 'ดาวบนยอด',
    emoji: '🌟',
    rarity: EnumEquipmentGrade.LEGENDARY,
    theme: 'royal',
    price: { currency: 'gem', amount: 90 },
  },
  {
    id: 'goggles',
    slot: EnumCostumeSlot.FACE,
    name: 'แว่นดำน้ำ',
    emoji: '🥽',
    rarity: EnumEquipmentGrade.COMMON,
    theme: 'sea',
    price: { currency: 'coin', amount: 150 },
  },
  {
    id: 'facemask',
    slot: EnumCostumeSlot.FACE,
    name: 'หน้ากากอนามัย',
    emoji: '😷',
    rarity: EnumEquipmentGrade.COMMON,
    theme: 'casual',
    price: { currency: 'coin', amount: 100 },
  },
  {
    id: 'monocle',
    slot: EnumCostumeSlot.FACE,
    name: 'แว่นข้างเดียว',
    emoji: '🧐',
    rarity: EnumEquipmentGrade.RARE,
    theme: 'royal',
    price: { currency: 'coin', amount: 400 },
  },
  {
    id: 'snorkel',
    slot: EnumCostumeSlot.FACE,
    name: 'ท่อหายใจ',
    emoji: '🤿',
    rarity: EnumEquipmentGrade.RARE,
    theme: 'sea',
    price: { currency: 'coin', amount: 350 },
  },
  {
    id: 'nerd',
    slot: EnumCostumeSlot.FACE,
    name: 'หน้าหนอนหนังสือ',
    emoji: '🤓',
    rarity: EnumEquipmentGrade.EPIC,
    theme: 'casual',
    price: { currency: 'gem', amount: 30 },
  },
  {
    id: 'imp',
    slot: EnumCostumeSlot.FACE,
    name: 'ยิ้มซน',
    emoji: '😈',
    rarity: EnumEquipmentGrade.EPIC,
    theme: 'spirit',
    price: { currency: 'boss_token', amount: 1, bossId: 'void_sovereign' },
  },
  {
    id: 'umbrella',
    slot: EnumCostumeSlot.BACK,
    name: 'ร่ม',
    emoji: '☂️',
    rarity: EnumEquipmentGrade.COMMON,
    theme: 'casual',
    price: { currency: 'coin', amount: 250 },
  },
  {
    id: 'kite',
    slot: EnumCostumeSlot.BACK,
    name: 'ว่าว',
    emoji: '🪁',
    rarity: EnumEquipmentGrade.COMMON,
    theme: 'festival',
    price: { currency: 'coin', amount: 250 },
  },
  {
    id: 'shield',
    slot: EnumCostumeSlot.BACK,
    name: 'โล่',
    emoji: '🛡️',
    rarity: EnumEquipmentGrade.RARE,
    theme: 'knight',
    price: { currency: 'coin', amount: 600 },
  },
  {
    id: 'sword',
    slot: EnumCostumeSlot.BACK,
    name: 'ดาบ',
    emoji: '🗡️',
    rarity: EnumEquipmentGrade.RARE,
    theme: 'knight',
    price: { currency: 'coin', amount: 600 },
  },
  {
    id: 'guitar',
    slot: EnumCostumeSlot.BACK,
    name: 'กีตาร์',
    emoji: '🎸',
    rarity: EnumEquipmentGrade.RARE,
    theme: 'festival',
    price: { currency: 'coin', amount: 500 },
  },
  {
    id: 'rocket',
    slot: EnumCostumeSlot.BACK,
    name: 'เป้จรวด',
    emoji: '🚀',
    rarity: EnumEquipmentGrade.EPIC,
    theme: 'casual',
    price: { currency: 'gem', amount: 45 },
  },
  {
    id: 'butterfly',
    slot: EnumCostumeSlot.BACK,
    name: 'ปีกผีเสื้อ',
    emoji: '🦋',
    rarity: EnumEquipmentGrade.EPIC,
    theme: 'spring',
    price: { currency: 'gem', amount: 50 },
  },
  {
    id: 'dragon',
    slot: EnumCostumeSlot.BACK,
    name: 'มังกรพิทักษ์',
    emoji: '🐉',
    rarity: EnumEquipmentGrade.LEGENDARY,
    theme: 'spirit',
    price: { currency: 'gem', amount: 100 },
  },
  {
    id: 'glowEarth',
    slot: EnumCostumeSlot.AURA,
    name: 'แสงปฐพี',
    color: '#b08a5a',
    rarity: EnumEquipmentGrade.RARE,
    theme: 'element',
    price: { currency: 'coin', amount: 800 },
  },
  {
    id: 'glowBolt',
    slot: EnumCostumeSlot.AURA,
    name: 'แสงสายฟ้า',
    color: '#f5d63d',
    rarity: EnumEquipmentGrade.RARE,
    theme: 'element',
    price: { currency: 'coin', amount: 800 },
  },
  {
    id: 'glowHoly',
    slot: EnumCostumeSlot.AURA,
    name: 'แสงศักดิ์สิทธิ์',
    color: '#f2d57a',
    rarity: EnumEquipmentGrade.EPIC,
    theme: 'element',
    price: { currency: 'gem', amount: 40 },
  },
  {
    id: 'glowDark',
    slot: EnumCostumeSlot.AURA,
    name: 'แสงมืด',
    color: '#8a5cd6',
    rarity: EnumEquipmentGrade.EPIC,
    theme: 'element',
    price: { currency: 'gem', amount: 40 },
  },
  {
    id: 'glowShadow',
    slot: EnumCostumeSlot.AURA,
    name: 'หมอกเงา',
    color: '#6b7a90',
    rarity: EnumEquipmentGrade.EPIC,
    theme: 'element',
    price: { currency: 'gem', amount: 40 },
  },
  {
    id: 'sakura',
    slot: EnumCostumeSlot.AURA,
    name: 'กลีบซากุระ',
    color: '#ff9ec7',
    rarity: EnumEquipmentGrade.RARE,
    theme: 'spring',
    price: { currency: 'coin', amount: 700 },
  },
  {
    id: 'frost',
    slot: EnumCostumeSlot.AURA,
    name: 'ลมหนาว',
    color: '#8fd8ff',
    rarity: EnumEquipmentGrade.RARE,
    theme: 'winter',
    price: { currency: 'coin', amount: 700 },
  },
  {
    id: 'desert',
    slot: EnumCostumeSlot.BACKDROP,
    name: 'ทะเลทราย',
    gradient: 'linear-gradient(#ffe7b0,#e8b66a)',
    rarity: EnumEquipmentGrade.COMMON,
    theme: null,
    price: { currency: 'coin', amount: 300 },
  },
  {
    id: 'beach',
    slot: EnumCostumeSlot.BACKDROP,
    name: 'ชายหาด',
    gradient: 'linear-gradient(#8fd9ff,#f7e3a6)',
    rarity: EnumEquipmentGrade.COMMON,
    theme: 'sea',
    price: { currency: 'coin', amount: 300 },
  },
  {
    id: 'snowfield',
    slot: EnumCostumeSlot.BACKDROP,
    name: 'ทุ่งหิมะ',
    gradient: 'linear-gradient(#e8f4ff,#bcd8f0)',
    rarity: EnumEquipmentGrade.COMMON,
    theme: 'winter',
    price: { currency: 'coin', amount: 300 },
  },
  {
    id: 'cave',
    slot: EnumCostumeSlot.BACKDROP,
    name: 'ถ้ำคริสตัล',
    gradient: 'linear-gradient(#2b2f3a,#4a4f5e)',
    rarity: EnumEquipmentGrade.COMMON,
    theme: null,
    price: { currency: 'coin', amount: 300 },
  },
  {
    id: 'volcano',
    slot: EnumCostumeSlot.BACKDROP,
    name: 'ภูเขาไฟ',
    gradient: 'linear-gradient(#3b1a1a,#e0572b)',
    rarity: EnumEquipmentGrade.RARE,
    theme: null,
    price: { currency: 'coin', amount: 700 },
  },
  {
    id: 'cherry',
    slot: EnumCostumeSlot.BACKDROP,
    name: 'ป่าซากุระ',
    gradient: 'linear-gradient(#ffd9e6,#f4a6c0)',
    rarity: EnumEquipmentGrade.RARE,
    theme: 'spring',
    price: { currency: 'coin', amount: 700 },
  },
  {
    id: 'cyber',
    slot: EnumCostumeSlot.BACKDROP,
    name: 'กริดนีออน',
    gradient: 'linear-gradient(#0b1030,#1ec8ff 70%,#e04bd0)',
    rarity: EnumEquipmentGrade.EPIC,
    theme: null,
    price: { currency: 'gem', amount: 40 },
  },
  {
    id: 'aurora',
    slot: EnumCostumeSlot.BACKDROP,
    name: 'แสงเหนือ',
    gradient: 'linear-gradient(#15324a,#2fa37a 60%,#7a5cc7)',
    rarity: EnumEquipmentGrade.EPIC,
    theme: null,
    price: { currency: 'gem', amount: 40 },
  },
]

const byId = new Map(COSTUMES.map(costume => [costume.id, costume]))

export const findCostume = (costumeId: string) => byId.get(costumeId)

export const isFreeCostume = (costume: ICostume) =>
  costume.price.currency === 'coin' && costume.price.amount === 0

// Why a costume cannot be bought right now, or null when it can. Season rewards are never sold.
export const getBuyBlocker = (costume: ICostume, now: Date) => {
  if (costume.price.currency === 'season') {
    return 'This costume is a reward and cannot be bought'
  }
  if (costume.endsAt && now.getTime() >= new Date(costume.endsAt).getTime()) {
    return 'This costume is no longer sold'
  }
  return null
}

// Keeps only real slots holding real costumes of the right slot, so whatever is stored or sent
// out can only ever be catalog ids.
export const cleanLoadout = (raw: unknown): ILoadout => {
  const loadout: ILoadout = {}
  if (!raw || typeof raw !== 'object') {
    return loadout
  }
  for (const slot of COSTUME_SLOTS) {
    const id = (raw as Record<string, unknown>)[slot]
    const costume = typeof id === 'string' ? findCostume(id) : undefined
    if (costume && costume.slot === slot) {
      loadout[slot] = costume.id
    }
  }
  return loadout
}

// What other players may see: the loadout, or nothing when its owner turned sharing off.
export const publicLoadout = (loadout: unknown, isShared: boolean): ILoadout | null =>
  isShared ? cleanLoadout(loadout) : null

// Theme progress over the hat, face and back slots: how many pieces of each theme you own.
export const themeProgress = (ownedIds: Set<string>) => {
  const themes = new Map<string, { total: number; owned: number }>()
  for (const costume of COSTUMES) {
    const isLook =
      costume.slot === EnumCostumeSlot.AURA || costume.slot === EnumCostumeSlot.BACKDROP
    if (!costume.theme || isLook) {
      continue
    }
    const row = themes.get(costume.theme) ?? { total: 0, owned: 0 }
    row.total += 1
    row.owned += ownedIds.has(costume.id) ? 1 : 0
    themes.set(costume.theme, row)
  }
  return [...themes.entries()].map(([theme, row]) => ({
    theme,
    ...row,
    isComplete: row.owned === row.total,
  }))
}
