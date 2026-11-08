import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'

const STAGE_ORDER = [
  EnumMonsterStage.EGG,
  EnumMonsterStage.BABY_1,
  EnumMonsterStage.BABY_2,
  EnumMonsterStage.ADULT,
  EnumMonsterStage.PERFECT,
  EnumMonsterStage.ULTIMATE,
  EnumMonsterStage.FUSED,
]

export const isStageAtLeast = (stage: EnumMonsterStage, minimum: EnumMonsterStage) =>
  STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(minimum)

export interface IEvolutionRule {
  to: string
  // Care conditions are checked against the counters of the stage being left (they reset on
  // evolving). minWins counts the monster's lifetime wins.
  maxCareMistakes?: number
  minTrainCount?: number
  minWins?: number
}

export interface IBattleStats {
  hp: number
  atk: number
  def: number
  spd: number
}

export interface ISkill {
  name: string
  power: number
}

export interface ISpecies {
  id: string
  line: EnumMonsterLine
  stage: EnumMonsterStage
  name: string
  emoji: string
  // The pixel-art sprite the client draws (demo-app tamagotchi/sprites); null = no art yet, the
  // client shows the emoji.
  sprite: string | null
  minWeight: number
  // Base battle stats before care modifiers (see battle-stats.ts). An egg has none and can't fight.
  stats: IBattleStats
  skill: ISkill
  // Checked in order; the first rule whose conditions all pass wins. A rule with no conditions is
  // the fallback. No matching rule = the monster stays in this stage.
  evolutions: IEvolutionRule[]
  // Fused forms only: the skill follows the line of the parent the player chose as the base.
  skillByLine?: Record<EnumMonsterLine, ISkill>
}

export const STAGE_BASE_STATS: Record<EnumMonsterStage, IBattleStats> = {
  [EnumMonsterStage.EGG]: { hp: 0, atk: 0, def: 0, spd: 0 },
  [EnumMonsterStage.BABY_1]: { hp: 24, atk: 5, def: 3, spd: 5 },
  [EnumMonsterStage.BABY_2]: { hp: 40, atk: 8, def: 5, spd: 7 },
  [EnumMonsterStage.ADULT]: { hp: 70, atk: 14, def: 9, spd: 11 },
  [EnumMonsterStage.PERFECT]: { hp: 105, atk: 21, def: 14, spd: 15 },
  [EnumMonsterStage.ULTIMATE]: { hp: 150, atk: 30, def: 20, spd: 20 },
  // Ultimate x MERGE_POWER_MULTIPLIER (pinned by a test).
  [EnumMonsterStage.FUSED]: { hp: 195, atk: 39, def: 26, spd: 26 },
}

// Each line leans toward one stat: flame hits hard, tide is tanky, leaf is fast. Earth, lightning,
// holy, dark and shadow carry a small extra factor (x0.98-1.03) so 1v1 win rates of all lines sit
// near 50% (simulated over every same-stage form). Flame, tide and leaf are left as they were: the
// PvP rivals and raid bosses are calibrated against them (pvp-data.spec.ts, raid-data.spec.ts).
const LINE_BIAS: Record<EnumMonsterLine, IBattleStats> = {
  [EnumMonsterLine.FLAME]: { hp: 1, atk: 1.15, def: 1, spd: 1 },
  [EnumMonsterLine.TIDE]: { hp: 1.15, atk: 1, def: 1.1, spd: 1 },
  [EnumMonsterLine.LEAF]: { hp: 1.05, atk: 1, def: 1, spd: 1.15 },
  [EnumMonsterLine.EARTH]: { hp: 1.128, atk: 1.025, def: 1.179, spd: 0.974 },
  [EnumMonsterLine.LIGHTNING]: { hp: 0.977, atk: 1.075, def: 0.928, spd: 1.124 },
  [EnumMonsterLine.HOLY]: { hp: 1.13, atk: 0.976, def: 1.13, spd: 1.027 },
  [EnumMonsterLine.DARK]: { hp: 0.939, atk: 1.186, def: 0.988, spd: 0.988 },
  [EnumMonsterLine.SHADOW]: { hp: 0.923, atk: 1.077, def: 0.975, spd: 1.231 },
}

// Alternate branches lean a different way from their line: flame turns agile, tide turns fierce,
// leaf turns sturdy.
const ALT_BIAS: Record<EnumMonsterLine, IBattleStats> = {
  [EnumMonsterLine.FLAME]: { hp: 1, atk: 1, def: 1, spd: 1.2 },
  [EnumMonsterLine.TIDE]: { hp: 0.95, atk: 1.2, def: 1, spd: 1 },
  [EnumMonsterLine.LEAF]: { hp: 1.1, atk: 1, def: 1.2, spd: 0.95 },
  [EnumMonsterLine.EARTH]: { hp: 0.95, atk: 1.2, def: 1, spd: 1 },
  [EnumMonsterLine.LIGHTNING]: { hp: 1.1, atk: 1, def: 1.2, spd: 0.95 },
  [EnumMonsterLine.HOLY]: { hp: 0.95, atk: 1.2, def: 1, spd: 1 },
  [EnumMonsterLine.DARK]: { hp: 1, atk: 1, def: 1, spd: 1.2 },
  [EnumMonsterLine.SHADOW]: { hp: 0.95, atk: 1.2, def: 1, spd: 1 },
}

type EnumFormQuality = 'normal' | 'good' | 'poor'

const QUALITY_MULTIPLIER: Record<EnumFormQuality, number> = {
  normal: 1,
  good: 1.1,
  poor: 0.95,
}

export const scaleStats = (base: IBattleStats, multiplier: IBattleStats | number): IBattleStats => {
  const factor = (key: keyof IBattleStats) =>
    typeof multiplier === 'number' ? multiplier : multiplier[key]
  return {
    hp: Math.round(base.hp * factor('hp')),
    atk: Math.round(base.atk * factor('atk')),
    def: Math.round(base.def * factor('def')),
    spd: Math.round(base.spd * factor('spd')),
  }
}

type FormKey =
  | 'egg'
  | 'baby1'
  | 'baby2'
  | 'adultGood'
  | 'adultPoor'
  | 'adultAlt'
  | 'perfectGood'
  | 'perfectPoor'
  | 'perfectAlt'
  | 'ultimate'
  | 'ultimateAlt'

// [name, emoji, skill name]
type FormNames = Record<FormKey, [string, string, string]>

// Sprite ids of each line's forms, in FormKey order: egg, baby1, baby2, adult good/poor/alt,
// perfect good/poor/alt, ultimate, ultimateAlt.
const spriteRow = (ids: string): Record<FormKey, string> => {
  const keys: FormKey[] = [
    'egg',
    'baby1',
    'baby2',
    'adultGood',
    'adultPoor',
    'adultAlt',
    'perfectGood',
    'perfectPoor',
    'perfectAlt',
    'ultimate',
    'ultimateAlt',
  ]
  const list = ids.split(' ')
  return Object.fromEntries(keys.map((key, i) => [key, list[i]])) as Record<FormKey, string>
}

export const LINE_SPRITES: Record<EnumMonsterLine, Record<FormKey, string>> = {
  [EnumMonsterLine.FLAME]: spriteRow(
    'egg wisp coal gecko smoke raptor frill lava dragon sunking phoenix'
  ),
  [EnumMonsterLine.TIDE]: spriteRow(
    'wegg drop bubble swordwhale jelly shark armorwhale octopus seadragon whaleC leviathan'
  ),
  [EnumMonsterLine.LEAF]: spriteRow(
    'legg seed sprout leafdeer mushroom wolf stag stump barkwolf forestdeer wolfking'
  ),
  [EnumMonsterLine.EARTH]: spriteRow(
    'eegg pebble clay tortoise worm rhino pillarturtle boulder orerhino mountturtle crystalrhino'
  ),
  [EnumMonsterLine.LIGHTNING]: spriteRow(
    'begg spark cloudpuff tbird staticcat stormfox hawk gloomcloud boltfox thunderking foxking'
  ),
  [EnumMonsterLine.HOLY]: spriteRow(
    'hegg glint lamb wingsheep cherub lioncub qilin bellcrab winglion sunqilin lionking'
  ),
  [EnumMonsterLine.DARK]: spriteRow(
    'degg mote batling spider rat vampbat eyespider zrat batlord spiderqueen batemperor'
  ),
  [EnumMonsterLine.SHADOW]: spriteRow(
    'segg wbaby kbaby knight shyghost lantern knight2 mistblob soulwraith knightlord wraithlord'
  ),
}

// The awakened form of each line (the same line twice). Hybrids of two lines have no art yet.
const AWAKENED_SPRITES: Record<EnumMonsterLine, string> = {
  [EnumMonsterLine.FLAME]: 'avatar',
  [EnumMonsterLine.TIDE]: 'wfused',
  [EnumMonsterLine.LEAF]: 'lfused',
  [EnumMonsterLine.EARTH]: 'efused',
  [EnumMonsterLine.LIGHTNING]: 'bfused',
  [EnumMonsterLine.HOLY]: 'hfused',
  [EnumMonsterLine.DARK]: 'dfused',
  [EnumMonsterLine.SHADOW]: 'sfused',
}

const SKILL_POWER = 1.6
const ULTIMATE_SKILL_POWER = 1.8

const lineSpecies = (line: EnumMonsterLine, names: FormNames): ISpecies[] => {
  const id = (key: string) => `${line}_${key}`
  const species = (
    key: FormKey,
    stage: EnumMonsterStage,
    quality: EnumFormQuality,
    minWeight: number,
    evolutions: IEvolutionRule[]
  ): ISpecies => ({
    id: id(key),
    line,
    stage,
    name: names[key][0],
    emoji: names[key][1],
    sprite: LINE_SPRITES[line][key],
    minWeight,
    stats: scaleStats(
      scaleStats(
        scaleStats(STAGE_BASE_STATS[stage], LINE_BIAS[line]),
        key.endsWith('Alt') ? ALT_BIAS[line] : 1
      ),
      QUALITY_MULTIPLIER[quality]
    ),
    skill: {
      name: names[key][2],
      power: stage === EnumMonsterStage.ULTIMATE ? ULTIMATE_SKILL_POWER : SKILL_POWER,
    },
    evolutions,
  })

  // The alternate perfect form is the veteran branch: a proven fighter that was also well cared for.
  const toPerfect = (maxCareMistakes: number, minTrainCount: number): IEvolutionRule[] => [
    { to: id('perfectAlt'), maxCareMistakes, minTrainCount, minWins: 8 },
    { to: id('perfectGood'), maxCareMistakes, minTrainCount },
    { to: id('perfectPoor') },
  ]

  return [
    species('egg', EnumMonsterStage.EGG, 'normal', 1, [{ to: id('baby1') }]),
    species('baby1', EnumMonsterStage.BABY_1, 'normal', 5, [{ to: id('baby2') }]),
    species('baby2', EnumMonsterStage.BABY_2, 'normal', 10, [
      { to: id('adultAlt'), maxCareMistakes: 3, minTrainCount: 8 },
      { to: id('adultGood'), maxCareMistakes: 3 },
      { to: id('adultPoor') },
    ]),
    species('adultGood', EnumMonsterStage.ADULT, 'good', 20, toPerfect(2, 6)),
    species('adultAlt', EnumMonsterStage.ADULT, 'good', 20, toPerfect(2, 6)),
    species('adultPoor', EnumMonsterStage.ADULT, 'poor', 20, toPerfect(1, 10)),
    species('perfectGood', EnumMonsterStage.PERFECT, 'good', 30, [
      { to: id('ultimate'), maxCareMistakes: 1, minTrainCount: 10, minWins: 5 },
    ]),
    species('perfectPoor', EnumMonsterStage.PERFECT, 'poor', 30, []),
    species('perfectAlt', EnumMonsterStage.PERFECT, 'good', 30, [
      { to: id('ultimateAlt'), maxCareMistakes: 1, minTrainCount: 10, minWins: 12 },
      { to: id('ultimate'), maxCareMistakes: 1, minTrainCount: 10, minWins: 5 },
    ]),
    species('ultimate', EnumMonsterStage.ULTIMATE, 'good', 40, []),
    species('ultimateAlt', EnumMonsterStage.ULTIMATE, 'good', 40, []),
  ]
}

export const SPECIES: ISpecies[] = [
  ...lineSpecies(EnumMonsterLine.FLAME, {
    egg: ['ไข่เพลิง', '🥚', '-'],
    baby1: ['ประกายจิ๋ว', '✨', 'ประกายไฟ'],
    baby2: ['ถ่านน้อย', '🔥', 'ถ่านลุก'],
    adultGood: ['เพลิงจอมซน', '🦎', 'หางเพลิง'],
    adultPoor: ['ควันกรุ่น', '💨', 'ควันพิษ'],
    adultAlt: ['เพลิงนักรบ', '🦖', 'ฟันเพลิง'],
    perfectGood: ['อัคนีแผงคอ', '🦎', 'กรงเล็บอัคคี'],
    perfectPoor: ['ลาวาอ้วน', '🌋', 'ลาวาทับ'],
    perfectAlt: ['มังกรเพลิงรบ', '🐲', 'ลมหายใจมังกร'],
    ultimate: ['ราชันมังกรสุริยะ', '🐉', 'สุริยะแผดเผา'],
    ultimateAlt: ['มังกรปีกฟีนิกซ์', '🦅', 'ปีกอัคนี'],
  }),
  ...lineSpecies(EnumMonsterLine.TIDE, {
    egg: ['ไข่วารี', '🥚', '-'],
    baby1: ['หยดน้ำ', '💧', 'กระเซ็น'],
    baby2: ['ฟองจิ๋ว', '🫧', 'ฟองสบู่'],
    adultGood: ['ลูกวาฬดาบ', '🐋', 'ดาบน้ำ'],
    adultPoor: ['แมงกะพรุนขี้เซา', '🪼', 'หนวดช็อต'],
    adultAlt: ['ฉลามหนาม', '🦈', 'เขี้ยวคลื่น'],
    perfectGood: ['วาฬเกราะ', '🐋', 'คลื่นเกราะ'],
    perfectPoor: ['หมึกขี้เกียจ', '🐙', 'หมึกพ่น'],
    perfectAlt: ['มังกรทะเลลึก', '🐉', 'น้ำวนมังกร'],
    ultimate: ['ราชาวาฬผลึก', '🐋', 'หอกเขาผลึก'],
    ultimateAlt: ['เลวีอาธานคลื่นคลั่ง', '🐉', 'สายน้ำนิรันดร์'],
  }),
  ...lineSpecies(EnumMonsterLine.LEAF, {
    egg: ['ไข่พฤกษ์', '🥚', '-'],
    baby1: ['เมล็ดจิ๋ว', '🌰', 'เมล็ดดีด'],
    baby2: ['ต้นอ่อน', '🌱', 'ใบมีด'],
    adultGood: ['กวางใบไม้', '🦌', 'เขาพฤกษา'],
    adultPoor: ['เห็ดง่วง', '🍄', 'สปอร์หลับ'],
    adultAlt: ['หมาป่าไพร', '🐺', 'เขี้ยวไพร'],
    perfectGood: ['กวางเขาพฤกษา', '🦌', 'เขาไพรสามคม'],
    perfectPoor: ['ตอไม้แก่', '🪵', 'รากฟาด'],
    perfectAlt: ['หมาป่าเปลือกไม้', '🐺', 'เถาวัลย์ฟาด'],
    ultimate: ['เทพพนาลัย', '🌳', 'พนาพิโรธ'],
    ultimateAlt: ['ราชาหมาป่าพงไพร', '🐺', 'พิทักษ์พนา'],
  }),
  ...lineSpecies(EnumMonsterLine.EARTH, {
    egg: ['ไข่ศิลา', '🥚', '-'],
    baby1: ['ก้อนกรวด', '🪨', 'กรวดกระเด็น'],
    baby2: ['ก้อนดินเหนียว', '🧱', 'ปั้นทับ'],
    adultGood: ['เต่าศิลา', '🐢', 'กระดองศิลา'],
    adultPoor: ['หนอนดินเกียจคร้าน', '🪱', 'เลื้อยทับ'],
    adultAlt: ['แรดผา', '🦏', 'งาผา'],
    perfectGood: ['เต่าผาหิน', '🐢', 'กระทืบผา'],
    perfectPoor: ['ก้อนหินขี้เกียจ', '🗿', 'ทับกด'],
    perfectAlt: ['แรดเกราะแร่', '🦏', 'หนามแร่'],
    ultimate: ['เต่าภูเขา', '🏔️', 'ธรณีสั่น'],
    ultimateAlt: ['ไททันแรดคริสตัล', '💎', 'ผลึกพิโรธ'],
  }),
  ...lineSpecies(EnumMonsterLine.LIGHTNING, {
    egg: ['ไข่อสนี', '🥚', '-'],
    baby1: ['ประกายไฟฟ้า', '⚡', 'ช็อตจิ๋ว'],
    baby2: ['ลูกเมฆฟ้า', '☁️', 'ฟ้าร้อง'],
    adultGood: ['นกฟ้าผ่า', '🐦', 'ปีกฟ้าผ่า'],
    adultPoor: ['แมวไฟสถิต', '🐱', 'ขนพองช็อต'],
    adultAlt: ['จิ้งจอกพายุ', '🦊', 'ข่วนสายฟ้า'],
    perfectGood: ['เหยี่ยวพายุ', '🦅', 'โฉบอสนี'],
    perfectPoor: ['เมฆหม่นขี้เกียจ', '🌥️', 'ฟ้าคำราม'],
    perfectAlt: ['จิ้งจอกอสนี', '🦊', 'หางอสนี'],
    ultimate: ['วิหคราชาอสนี', '🌩️', 'อสนีบาต'],
    ultimateAlt: ['ราชาจิ้งจอกอสนี', '🦊', 'หางปาอสนี'],
  }),
  ...lineSpecies(EnumMonsterLine.HOLY, {
    egg: ['ไข่รัศมี', '🥚', '-'],
    baby1: ['ประกายแสง', '🌟', 'แสงวาบ'],
    baby2: ['ลูกแกะแสง', '🐑', 'ขนทอง'],
    adultGood: ['แกะปีกทิพย์', '🐑', 'ปีกทิพย์'],
    adultPoor: ['ทูตน้อยขี้เซา', '👼', 'พรหลับ'],
    adultAlt: ['สิงห์น้อยรัศมี', '🦁', 'อุ้งเล็บรัศมี'],
    perfectGood: ['กิเลนรัศมี', '🦄', 'ศรเขากิเลน'],
    perfectPoor: ['ระฆังแตก', '🔔', 'เสียงก้อง'],
    perfectAlt: ['ราชสีห์ปีกขาว', '🦁', 'ปีกขาวเจิดจ้า'],
    ultimate: ['กิเลนสุริยเทพ', '🌞', 'ตะวันชำระ'],
    ultimateAlt: ['มหาราชสีห์เทวะ', '👑', 'พิพากษาสวรรค์'],
  }),
  ...lineSpecies(EnumMonsterLine.DARK, {
    egg: ['ไข่รัตติกาล', '🥚', '-'],
    baby1: ['ละอองมืด', '🌑', 'หมอกคำสาป'],
    baby2: ['ลูกค้างคาว', '🦇', 'เสียงกรีด'],
    adultGood: ['แมงมุมคำสาป', '🕷️', 'ใยสาป'],
    adultPoor: ['หนูท่อมืด', '🐀', 'กัดโสโครก'],
    adultAlt: ['ค้างคาวเขี้ยวโลหิต', '🦇', 'เขี้ยวโลหิต'],
    perfectGood: ['แมงมุมอสูรตาแดง', '🕷️', 'นัยน์ตาอาฆาต'],
    perfectPoor: ['หนูซากศพขี้เกียจ', '🧟', 'คลานทับ'],
    perfectAlt: ['ค้างคาวอสูรราชันย์', '🦇', 'พิโรธรัตติกาล'],
    ultimate: ['ราชินีแมงมุมรัตติกาล', '🕸️', 'อวสานแสง'],
    ultimateAlt: ['จักรพรรดิค้างคาวคำสาป', '🦇', 'คำสาปนิรันดร์'],
  }),
  ...lineSpecies(EnumMonsterLine.SHADOW, {
    egg: ['ไข่เงา', '🥚', '-'],
    baby1: ['เงาจิ๋ว', '🌫️', 'พรางตัว'],
    baby2: ['หมวกผีน้อย', '👻', 'ย่องเบา'],
    adultGood: ['อัศวินเงา', '🛡️', 'พัดดาบเงา'],
    adultPoor: ['ผีเงาขี้อาย', '👻', 'ลอยหนี'],
    adultAlt: ['ภูตตะเกียงเงา', '🏮', 'ไฟโคมเงียบ'],
    perfectGood: ['อัศวินเงาเกราะทมิฬ', '🛡️', 'โล่ทมิฬ'],
    perfectPoor: ['ม่านหมอกขี้เกียจ', '🌁', 'กลืนกลบ'],
    perfectAlt: ['ภูตโคมวิญญาณ', '🏮', 'เปลวพิษวิญญาณ'],
    ultimate: ['จอมอัศวินเงา', '⚔️', 'อวสานเงา'],
    ultimateAlt: ['เจ้าภูตเงา', '💀', 'จักรวาลเงา'],
  }),
]

// Element groups: lines only merge inside their own group.
export const NATURAL_LINES = [
  EnumMonsterLine.FLAME,
  EnumMonsterLine.TIDE,
  EnumMonsterLine.LEAF,
  EnumMonsterLine.EARTH,
  EnumMonsterLine.LIGHTNING,
]

export const SPIRITUAL_LINES = [EnumMonsterLine.HOLY, EnumMonsterLine.DARK, EnumMonsterLine.SHADOW]

// Spiritual monsters come from rare eggs, which cost this many Raid Tokens to hatch.
export const RARE_EGG_LINES: EnumMonsterLine[] = SPIRITUAL_LINES

export const isSameGroup = (a: EnumMonsterLine, b: EnumMonsterLine) =>
  SPIRITUAL_LINES.includes(a) === SPIRITUAL_LINES.includes(b)

// Ultimate Merge forms: one awakened form per line and one hybrid per pair in a group (one line twice) and three hybrids (two lines). The parents'
// order does not matter, so a form is found by the sorted pair of lines. Stats are the Fused base
// (Ultimate x 1.3) with the average line lean of the two parents.
export const FUSED_FORMS: [EnumMonsterLine, EnumMonsterLine, string, string][] = [
  [EnumMonsterLine.FLAME, EnumMonsterLine.FLAME, 'อวตารสุริยะ', '☄️'],
  [EnumMonsterLine.TIDE, EnumMonsterLine.TIDE, 'สมุทรผู้ตื่น', '🌊'],
  [EnumMonsterLine.LEAF, EnumMonsterLine.LEAF, 'พนาผู้ตื่น', '🌴'],
  [EnumMonsterLine.FLAME, EnumMonsterLine.TIDE, 'ยักษ์ไอน้ำ', '♨️'],
  [EnumMonsterLine.LEAF, EnumMonsterLine.TIDE, 'บึงโบราณ', '🐊'],
  [EnumMonsterLine.FLAME, EnumMonsterLine.LEAF, 'จ้าวไฟป่า', '🦁'],
  [EnumMonsterLine.EARTH, EnumMonsterLine.EARTH, 'ธรณีผู้ตื่น', '⛰️'],
  [EnumMonsterLine.LIGHTNING, EnumMonsterLine.LIGHTNING, 'อสนีผู้ตื่น', '🌩️'],
  [EnumMonsterLine.FLAME, EnumMonsterLine.EARTH, 'ภูเขาไฟคำราม', '🌋'],
  [EnumMonsterLine.FLAME, EnumMonsterLine.LIGHTNING, 'พายุเพลิงสายฟ้า', '💥'],
  [EnumMonsterLine.TIDE, EnumMonsterLine.EARTH, 'โคลนมหาสมุทร', '🦦'],
  [EnumMonsterLine.TIDE, EnumMonsterLine.LIGHTNING, 'พายุทะเลหลวง', '🌀'],
  [EnumMonsterLine.LEAF, EnumMonsterLine.EARTH, 'ป่าหินโบราณ', '🌵'],
  [EnumMonsterLine.LEAF, EnumMonsterLine.LIGHTNING, 'ไพรอสนี', '🍃'],
  [EnumMonsterLine.EARTH, EnumMonsterLine.LIGHTNING, 'ผาฟ้าผ่า', '🏞️'],
  [EnumMonsterLine.HOLY, EnumMonsterLine.HOLY, 'ศักดิ์สิทธิ์ผู้ตื่น', '🔆'],
  [EnumMonsterLine.DARK, EnumMonsterLine.DARK, 'รัตติกาลผู้ตื่น', '🕳️'],
  [EnumMonsterLine.SHADOW, EnumMonsterLine.SHADOW, 'เงาผู้ตื่น', '🪞'],
  [EnumMonsterLine.HOLY, EnumMonsterLine.DARK, 'สมดุลแสงมืด', '☯️'],
  [EnumMonsterLine.DARK, EnumMonsterLine.SHADOW, 'ราชาไร้แสง', '🦉'],
  [EnumMonsterLine.HOLY, EnumMonsterLine.SHADOW, 'ผู้พิพากษาเงียบ', '⚖️'],
]

const FUSED_SKILLS: Record<EnumMonsterLine, ISkill> = {
  [EnumMonsterLine.FLAME]: { name: 'สุริยะแผดเผา', power: ULTIMATE_SKILL_POWER },
  [EnumMonsterLine.TIDE]: { name: 'หอกเขาผลึก', power: ULTIMATE_SKILL_POWER },
  [EnumMonsterLine.LEAF]: { name: 'พนาพิโรธ', power: ULTIMATE_SKILL_POWER },
  [EnumMonsterLine.EARTH]: { name: 'ธรณีสั่น', power: ULTIMATE_SKILL_POWER },
  [EnumMonsterLine.LIGHTNING]: { name: 'อสนีบาต', power: ULTIMATE_SKILL_POWER },
  [EnumMonsterLine.HOLY]: { name: 'ตะวันชำระ', power: ULTIMATE_SKILL_POWER },
  [EnumMonsterLine.DARK]: { name: 'อวสานแสง', power: ULTIMATE_SKILL_POWER },
  [EnumMonsterLine.SHADOW]: { name: 'อวสานเงา', power: ULTIMATE_SKILL_POWER },
}

const fusedKey = (a: EnumMonsterLine, b: EnumMonsterLine) => [a, b].sort().join('+')

export const fusedSpeciesId = (a: EnumMonsterLine, b: EnumMonsterLine) =>
  `fused_${fusedKey(a, b).replace('+', '_')}`

const fusedSpecies = (): ISpecies[] =>
  FUSED_FORMS.map(([a, b, name, emoji]) => {
    const lean = (key: keyof IBattleStats) => (LINE_BIAS[a][key] + LINE_BIAS[b][key]) / 2
    return {
      id: fusedSpeciesId(a, b),
      line: a,
      stage: EnumMonsterStage.FUSED,
      name,
      emoji,
      sprite: a === b ? AWAKENED_SPRITES[a] : null,
      minWeight: 40,
      stats: scaleStats(STAGE_BASE_STATS[EnumMonsterStage.FUSED], {
        hp: lean('hp'),
        atk: lean('atk'),
        def: lean('def'),
        spd: lean('spd'),
      }),
      skill: FUSED_SKILLS[a],
      skillByLine: FUSED_SKILLS,
      evolutions: [],
    }
  })

SPECIES.push(...fusedSpecies())

const speciesById = new Map(SPECIES.map(species => [species.id, species]))

export const getSpecies = (speciesId: string): ISpecies => {
  const species = speciesById.get(speciesId)
  if (!species) {
    throw new Error(`Unknown monster species: ${speciesId}`)
  }
  return species
}

// The sprite of a stored species id; null for an unknown id or a form without art.
export const spriteOfSpecies = (speciesId: string) => speciesById.get(speciesId)?.sprite ?? null

export const eggSpeciesId = (line: EnumMonsterLine) => `${line}_egg`
