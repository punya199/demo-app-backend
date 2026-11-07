import { WorldBossDamageEntity } from '../../../db/entities/world-boss-damage.entity'
import { WorldBossEntity } from '../../../db/entities/world-boss.entity'
import { claimRolls, getWeek, getWorldBossOfWeek, WORLD_BOSS_ROTATION } from './world-boss-data'
import {
  detailOf,
  ensureCurrent,
  isEnded,
  previewReward,
  RANKING_LIMIT,
  rankingRows,
  rankOf,
} from './world-boss-queries'

const NOW = new Date('2026-03-04T05:00:00Z')

const boss = (over: Partial<WorldBossEntity> = {}) =>
  ({
    id: 'wb-1',
    week: getWeek(NOW).key,
    bossId: WORLD_BOSS_ROTATION[0].id,
    hp: 500,
    maxHp: 1000,
    endsAt: new Date('2026-03-09T00:00:00Z'),
    defeatedAt: null,
    killedByUserId: null,
    ...over,
  }) as WorldBossEntity

describe('ensureCurrent', () => {
  it('inserts the week row if missing (ignoring a race) and returns it', async () => {
    const chain: Record<string, jest.Mock> = {}
    for (const name of ['insert', 'into', 'values', 'orIgnore']) {
      chain[name] = jest.fn().mockReturnValue(chain)
    }
    chain.execute = jest.fn().mockResolvedValue(undefined)
    const found = boss()
    const etm = {
      createQueryBuilder: jest.fn().mockReturnValue(chain),
      findOneOrFail: jest.fn().mockResolvedValue(found),
    }
    const week = getWeek(NOW)
    const def = getWorldBossOfWeek(week)

    await expect(ensureCurrent(NOW, etm as never)).resolves.toBe(found)

    expect(chain.into).toHaveBeenCalledWith(WorldBossEntity)
    expect(chain.values).toHaveBeenCalledWith({
      week: week.key,
      bossId: def.id,
      maxHp: def.hp,
      hp: def.hp,
      startsAt: week.startsAt,
      endsAt: week.endsAt,
    })
    expect(chain.orIgnore).toHaveBeenCalled()
    expect(etm.findOneOrFail).toHaveBeenCalledWith(WorldBossEntity, { where: { week: week.key } })
  })
})

describe('rankOf', () => {
  it('is one more than the players with more damage', async () => {
    const etm = { query: jest.fn().mockResolvedValue([{ better: 4 }]) }
    await expect(rankOf('wb-1', 70, etm as never)).resolves.toBe(5)
    expect(etm.query).toHaveBeenCalledWith(expect.stringContaining('"damage" > $2'), ['wb-1', 70])
  })
})

describe('isEnded', () => {
  it('is over once defeated or at the end time', () => {
    expect(isEnded(boss(), NOW)).toBe(false)
    expect(isEnded(boss({ defeatedAt: NOW }), NOW)).toBe(true)
    const endsAt = new Date('2026-03-09T00:00:00Z')
    expect(isEnded(boss({ endsAt }), new Date(endsAt.getTime() - 1))).toBe(false)
    expect(isEnded(boss({ endsAt }), endsAt)).toBe(true)
  })
})

describe('previewReward', () => {
  const row = { hits: 3 } as WorldBossDamageEntity

  it('pays by hits and rank, with the defeat bonus and killing blow only when earned', () => {
    const plain = previewReward(boss(), row, 50, 'u')
    expect(plain.coin).toBe(150)
    expect(plain.pieceGrade).toBeNull()

    const killer = previewReward(boss({ defeatedAt: NOW, killedByUserId: 'u' }), row, 50, 'u')
    expect(killer.coin).toBe(350)
    expect(killer.pieceGrade).not.toBeNull()

    const other = previewReward(boss({ defeatedAt: NOW, killedByUserId: 'x' }), row, 50, 'u')
    expect(other.coin).toBe(350)
    expect(other.refineStones).not.toEqual(killer.refineStones)
  })

  it('uses the claim rolls of the boss and player', () => {
    const b = boss()
    const roll = claimRolls(b.id, 'u').pieceRoll
    expect(roll).toBeGreaterThanOrEqual(0)
    expect(previewReward(b, row, 1, 'u')).toEqual(previewReward(b, row, 1, 'u'))
  })
})

describe('detailOf', () => {
  it('shows the week HP as the stats and lists the boss skills', () => {
    const def = WORLD_BOSS_ROTATION[0]
    const detail = detailOf(def, 777)
    expect(detail.stats.hp).toBe(777)
    expect(detail.skills.map(skill => skill.id)).toEqual(def.arenaSkills)
    expect(detail.dodge?.id ?? null).toBe(def.arenaDodge ?? null)
  })
})

describe('rankingRows', () => {
  it('queries the week with the ranking limit', async () => {
    const rows = [{ rank: 1 }]
    const dataSource = { query: jest.fn().mockResolvedValue(rows) }
    await expect(rankingRows('2026-W10', dataSource as never)).resolves.toBe(rows)
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining(`LIMIT ${RANKING_LIMIT}`),
      ['2026-W10']
    )
  })
})
