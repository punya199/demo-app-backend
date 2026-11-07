import { EnumEquipmentGrade } from './equipment-data'
import {
  cleanLoadout,
  COSTUME_SLOTS,
  COSTUMES,
  EnumCostumeSlot,
  findCostume,
  getBuyBlocker,
  isFreeCostume,
  publicLoadout,
  themeProgress,
} from './costume-data'
import { RAID_BOSSES } from '../boss/raid-data'

describe('costume catalog', () => {
  it('has unique ids and a Thai name for every item', () => {
    expect(new Set(COSTUMES.map(costume => costume.id)).size).toBe(COSTUMES.length)
    expect(COSTUMES.every(costume => /[฀-๿]/.test(costume.name))).toBe(true)
  })

  it('covers every slot with the fields its slot is drawn from', () => {
    for (const slot of COSTUME_SLOTS) {
      expect(COSTUMES.some(costume => costume.slot === slot)).toBe(true)
    }
    for (const costume of COSTUMES) {
      if (costume.slot === EnumCostumeSlot.AURA) {
        expect(costume.color).toMatch(/^#[0-9a-f]{6}$/i)
      } else if (costume.slot === EnumCostumeSlot.BACKDROP) {
        expect(costume.gradient).toContain('gradient')
      } else {
        expect(costume.emoji).toBeTruthy()
      }
      expect(Object.values(EnumEquipmentGrade)).toContain(costume.rarity)
    }
  })

  it('prices every sellable item and ties boss-token items to a real boss', () => {
    const bossIds = new Set(RAID_BOSSES.map(boss => boss.id))
    for (const costume of COSTUMES) {
      const { currency, amount, bossId } = costume.price
      if (currency === 'season') {
        expect(amount).toBe(0)
        continue
      }
      if (currency === 'boss_token') {
        expect(bossIds.has(bossId!)).toBe(true)
      }
      // Only the free starter backdrop costs nothing.
      expect(amount > 0 || isFreeCostume(costume)).toBe(true)
    }
    expect(COSTUMES.filter(isFreeCostume).map(costume => costume.id)).toEqual(['meadow'])
  })

  it('keeps legendary items out of the cheap coin tiers', () => {
    for (const costume of COSTUMES.filter(row => row.rarity === EnumEquipmentGrade.LEGENDARY)) {
      expect(costume.price.currency).not.toBe('coin')
    }
  })
})

describe('getBuyBlocker', () => {
  const now = new Date('2026-06-01T00:00:00Z')

  it('never sells a season reward', () => {
    expect(getBuyBlocker(findCostume('rainbow')!, now)).toMatch(/reward/)
  })

  it('stops selling a limited item after its end date', () => {
    const limited = { ...findCostume('pumpkin')!, endsAt: '2026-05-31T00:00:00Z' }
    expect(getBuyBlocker(limited, now)).toMatch(/no longer sold/)
    expect(getBuyBlocker({ ...limited, endsAt: '2026-06-02T00:00:00Z' }, now)).toBeNull()
  })

  it('sells an ordinary item', () => {
    expect(getBuyBlocker(findCostume('cap')!, now)).toBeNull()
  })
})

describe('loadouts', () => {
  it('keeps only catalog ids that sit in the right slot', () => {
    expect(
      cleanLoadout({
        hat: 'crown',
        face: 'crown',
        back: 'nope',
        aura: 'rainbow',
        backdrop: 'meadow',
        extra: 'anything',
      })
    ).toEqual({ hat: 'crown', aura: 'rainbow', backdrop: 'meadow' })
    expect(cleanLoadout(null)).toEqual({})
    expect(cleanLoadout('hat')).toEqual({})
  })

  it('shows other players nothing when the owner turned sharing off', () => {
    expect(publicLoadout({ hat: 'crown' }, false)).toBeNull()
    expect(publicLoadout({ hat: 'crown', secret: 'x' }, true)).toEqual({ hat: 'crown' })
  })
})

describe('themeProgress', () => {
  it('counts owned hat, face and back pieces per theme and flags a complete one', () => {
    const casual = COSTUMES.filter(
      costume =>
        costume.theme === 'casual' &&
        costume.slot !== EnumCostumeSlot.AURA &&
        costume.slot !== EnumCostumeSlot.BACKDROP
    )
    const some = themeProgress(new Set([casual[0].id])).find(row => row.theme === 'casual')!
    expect(some).toMatchObject({ total: casual.length, owned: 1, isComplete: false })
    const all = themeProgress(new Set(casual.map(costume => costume.id))).find(
      row => row.theme === 'casual'
    )!
    expect(all.isComplete).toBe(true)
  })

  it('ignores auras and backdrops, which only decorate', () => {
    expect(themeProgress(new Set()).some(row => row.theme === 'element')).toBe(false)
  })
})
