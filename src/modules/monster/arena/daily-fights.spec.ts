/* eslint-disable @typescript-eslint/no-unsafe-member-access -- jest mock call inspection */
import { EntityManager } from 'typeorm'
import { countFightsInWindow, getWindow } from './daily-fights'

describe('getWindow', () => {
  // Thai midnight is 17:00Z; 3h windows start 00:00, 03:00 ... Thai time.
  it('refills every 3 hours from Thai midnight', () => {
    const { startsAt, resetsAt } = getWindow(new Date('2026-05-01T21:30:00Z'), 3) // 04:30 Thai
    expect(startsAt.toISOString()).toBe('2026-05-01T20:00:00.000Z') // 03:00 Thai
    expect(resetsAt.toISOString()).toBe('2026-05-01T23:00:00.000Z') // 06:00 Thai
  })

  it('refills every hour from Thai midnight', () => {
    const { startsAt, resetsAt } = getWindow(new Date('2026-05-01T21:30:00Z'), 1) // 04:30 Thai
    expect(startsAt.toISOString()).toBe('2026-05-01T21:00:00.000Z') // 04:00 Thai
    expect(resetsAt.toISOString()).toBe('2026-05-01T22:00:00.000Z') // 05:00 Thai
  })

  it('starts a new window exactly on the boundary', () => {
    const { startsAt } = getWindow(new Date('2026-05-01T23:00:00Z'), 1) // 06:00 Thai
    expect(startsAt.toISOString()).toBe('2026-05-01T23:00:00.000Z')
  })
})

describe('countFightsInWindow', () => {
  it('counts the mode fights since the window start across the owner monsters', async () => {
    const now = new Date('2026-05-01T21:30:00Z')
    const query = jest.fn().mockResolvedValue([{ fights: 4 }])
    const etm = { query } as unknown as EntityManager
    await expect(countFightsInWindow('user-1', 'raid', 3, now, etm)).resolves.toBe(4)
    expect(query).toHaveBeenCalledTimes(1)
    expect(query.mock.calls[0][1]).toEqual(['user-1', 'raid', getWindow(now, 3).startsAt])
    expect(query.mock.calls[0][0]).toContain(`l."payload"->>'mode' = $2`)
  })
})
