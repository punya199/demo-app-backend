export enum EnumShopItemId {
  PREMIUM_MEAT = 'premium_meat',
  PROTEIN = 'protein',
  DIET_TEA = 'diet_tea',
  TRAINING_MANUAL = 'training_manual',
}

export interface IShopItem {
  id: EnumShopItemId
  name: string
  emoji: string
  description: string
  price: number
}

// Bought items wait in the inventory until used (POST /inventory/use); their effects live in
// applyShopItem() in monster-engine.ts.
export const SHOP_ITEMS: IShopItem[] = [
  {
    id: EnumShopItemId.PREMIUM_MEAT,
    name: 'เนื้อชั้นดี',
    emoji: '🥩',
    description: 'ความอิ่ม +2, น้ำหนัก +1',
    price: 15,
  },
  {
    id: EnumShopItemId.PROTEIN,
    name: 'โปรตีนเชค',
    emoji: '🥤',
    description: 'ความแข็งแรง +2, น้ำหนัก +1',
    price: 15,
  },
  {
    id: EnumShopItemId.DIET_TEA,
    name: 'ชาลดน้ำหนัก',
    emoji: '🍵',
    description: 'น้ำหนัก −5',
    price: 30,
  },
  {
    id: EnumShopItemId.TRAINING_MANUAL,
    name: 'คู่มือฝึกพิเศษ',
    emoji: '📘',
    description: 'นับเป็นการฝึก 1 ครั้ง ไม่ติด cooldown',
    price: 60,
  },
]

export const findShopItem = (itemId: string) =>
  SHOP_ITEMS.find(item => (item.id as string) === itemId)
