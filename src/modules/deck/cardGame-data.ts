const clubs_10 = '/images/cards/clubs_10.webp'
const clubs_2 = '/images/cards/clubs_2.webp'
const clubs_3 = '/images/cards/clubs_3.webp'
const clubs_4 = '/images/cards/clubs_4.webp'
const clubs_5 = '/images/cards/clubs_5.webp'
const clubs_6 = '/images/cards/clubs_6.webp'
const clubs_7 = '/images/cards/clubs_7.webp'
const clubs_8 = '/images/cards/clubs_8.webp'
const clubs_9 = '/images/cards/clubs_9.webp'
const clubs_A = '/images/cards/clubs_A.webp'
const clubs_J = '/images/cards/clubs_J.webp'
const clubs_K = '/images/cards/clubs_K.webp'
const clubs_Q = '/images/cards/clubs_Q.webp'
const diamonds_10 = '/images/cards/diamonds_10.webp'
const diamonds_2 = '/images/cards/diamonds_2.webp'
const diamonds_3 = '/images/cards/diamonds_3.webp'
const diamonds_4 = '/images/cards/diamonds_4.webp'
const diamonds_5 = '/images/cards/diamonds_5.webp'
const diamonds_6 = '/images/cards/diamonds_6.webp'
const diamonds_7 = '/images/cards/diamonds_7.webp'
const diamonds_8 = '/images/cards/diamonds_8.webp'
const diamonds_9 = '/images/cards/diamonds_9.webp'
const diamonds_A = '/images/cards/diamonds_A.webp'
const diamonds_J = '/images/cards/diamonds_J.webp'
const diamonds_K = '/images/cards/diamonds_K.webp'
const diamonds_Q = '/images/cards/diamonds_Q.webp'
const hearts_10 = '/images/cards/hearts_10.webp'
const hearts_2 = '/images/cards/hearts_2.webp'
const hearts_3 = '/images/cards/hearts_3.webp'
const hearts_4 = '/images/cards/hearts_4.webp'
const hearts_5 = '/images/cards/hearts_5.webp'
const hearts_6 = '/images/cards/hearts_6.webp'
const hearts_7 = '/images/cards/hearts_7.webp'
const hearts_8 = '/images/cards/hearts_8.webp'
const hearts_9 = '/images/cards/hearts_9.webp'
const hearts_A = '/images/cards/hearts_A.webp'
const hearts_J = '/images/cards/hearts_J.webp'
const hearts_K = '/images/cards/hearts_K.webp'
const hearts_Q = '/images/cards/hearts_Q.webp'
const spades_10 = '/images/cards/spades_10.webp'
const spades_2 = '/images/cards/spades_2.webp'
const spades_3 = '/images/cards/spades_3.webp'
const spades_4 = '/images/cards/spades_4.webp'
const spades_5 = '/images/cards/spades_5.webp'
const spades_6 = '/images/cards/spades_6.webp'
const spades_7 = '/images/cards/spades_7.webp'
const spades_8 = '/images/cards/spades_8.webp'
const spades_9 = '/images/cards/spades_9.webp'
const spades_A = '/images/cards/spades_A.webp'
const spades_J = '/images/cards/spades_J.webp'
const spades_K = '/images/cards/spades_K.webp'
const spades_Q = '/images/cards/spades_Q.webp'

type ICardDataType = 'spades' | 'hearts' | 'diamonds' | 'clubs'
export type INameDataType =
  | 'A'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K'

export interface ICardData {
  name: INameDataType
  type: ICardDataType
  value: number
  image: string
}

export const cardDeck: ICardData[] = [
  { name: 'A', type: 'hearts', value: 14, image: hearts_A },
  { name: '2', type: 'hearts', value: 2, image: hearts_2 },
  { name: '3', type: 'hearts', value: 3, image: hearts_3 },
  { name: '4', type: 'hearts', value: 4, image: hearts_4 },
  { name: '5', type: 'hearts', value: 5, image: hearts_5 },
  { name: '6', type: 'hearts', value: 6, image: hearts_6 },
  { name: '7', type: 'hearts', value: 7, image: hearts_7 },
  { name: '8', type: 'hearts', value: 8, image: hearts_8 },
  { name: '9', type: 'hearts', value: 9, image: hearts_9 },
  { name: '10', type: 'hearts', value: 10, image: hearts_10 },
  { name: 'J', type: 'hearts', value: 11, image: hearts_J },
  { name: 'Q', type: 'hearts', value: 12, image: hearts_Q },
  { name: 'K', type: 'hearts', value: 13, image: hearts_K },

  { name: 'A', type: 'clubs', value: 14, image: clubs_A },
  { name: '2', type: 'clubs', value: 2, image: clubs_2 },
  { name: '3', type: 'clubs', value: 3, image: clubs_3 },
  { name: '4', type: 'clubs', value: 4, image: clubs_4 },
  { name: '5', type: 'clubs', value: 5, image: clubs_5 },
  { name: '6', type: 'clubs', value: 6, image: clubs_6 },
  { name: '7', type: 'clubs', value: 7, image: clubs_7 },
  { name: '8', type: 'clubs', value: 8, image: clubs_8 },
  { name: '9', type: 'clubs', value: 9, image: clubs_9 },
  { name: '10', type: 'clubs', value: 10, image: clubs_10 },
  { name: 'J', type: 'clubs', value: 11, image: clubs_J },
  { name: 'Q', type: 'clubs', value: 12, image: clubs_Q },
  { name: 'K', type: 'clubs', value: 13, image: clubs_K },

  { name: 'A', type: 'spades', value: 14, image: spades_A },
  { name: '2', type: 'spades', value: 2, image: spades_2 },
  { name: '3', type: 'spades', value: 3, image: spades_3 },
  { name: '4', type: 'spades', value: 4, image: spades_4 },
  { name: '5', type: 'spades', value: 5, image: spades_5 },
  { name: '6', type: 'spades', value: 6, image: spades_6 },
  { name: '7', type: 'spades', value: 7, image: spades_7 },
  { name: '8', type: 'spades', value: 8, image: spades_8 },
  { name: '9', type: 'spades', value: 9, image: spades_9 },
  { name: '10', type: 'spades', value: 10, image: spades_10 },
  { name: 'J', type: 'spades', value: 11, image: spades_J },
  { name: 'Q', type: 'spades', value: 12, image: spades_Q },
  { name: 'K', type: 'spades', value: 13, image: spades_K },

  { name: 'A', type: 'diamonds', value: 14, image: diamonds_A },
  { name: '2', type: 'diamonds', value: 2, image: diamonds_2 },
  { name: '3', type: 'diamonds', value: 3, image: diamonds_3 },
  { name: '4', type: 'diamonds', value: 4, image: diamonds_4 },
  { name: '5', type: 'diamonds', value: 5, image: diamonds_5 },
  { name: '6', type: 'diamonds', value: 6, image: diamonds_6 },
  { name: '7', type: 'diamonds', value: 7, image: diamonds_7 },
  { name: '8', type: 'diamonds', value: 8, image: diamonds_8 },
  { name: '9', type: 'diamonds', value: 9, image: diamonds_9 },
  { name: '10', type: 'diamonds', value: 10, image: diamonds_10 },
  { name: 'J', type: 'diamonds', value: 11, image: diamonds_J },
  { name: 'Q', type: 'diamonds', value: 12, image: diamonds_Q },
  { name: 'K', type: 'diamonds', value: 13, image: diamonds_K },
]

export type ICardTitleData = Record<INameDataType, string>

export const cardTitleData: ICardTitleData = {
  A: 'กินคนเดียว',
  '2': 'หาเพื่อนกินด้วย 1 คน',
  '3': 'หาเพื่อนกินด้วย 2 คน',
  '4': 'คนขวากิน',
  '5': 'กินทุกคน',
  '6': 'คนซ้ายกิน',
  '7': 'เลือก 1 คนมาดวลเกมกัน คนแพ้กิน คนจับคิดเกม',
  '8': 'พักผ่อน',
  '9': 'เล่นเกมกันทั้งวง คนจับคิดเกม',
  '10': 'ทาแป้งให้หน้าขาว',
  J: 'จับหน้า ใครจับตามช้าสุดหรือผิดกิน ต่อ1การจั่วของใครก็ได้',
  Q: 'เพื่อนห้ามตอบคนที่จับได้ไพ่ใบนี้ ใครตอบมีเสียงกิน',
  K: 'สั่งใครกินก็ได้ ตามจำนวน ไพ่ K ที่ออกไปแล้ว',
}
