import { ExecutionContext, HttpException } from '@nestjs/common'
import { TdRateLimitGuard, tdRateLimitGuard } from './td-rate-limit.guard'
import { TdBattleController } from './td-battle.controller'
import { TdProfileController } from './td-profile.controller'

const ctx = (userId: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user: { 'user-id': userId } }) }),
  }) as unknown as ExecutionContext

describe('TdRateLimitGuard', () => {
  let now = 1_000_000
  const guard = new TdRateLimitGuard(() => now, 3, 60_000)

  it('lets a user through up to the limit, then answers 429', () => {
    for (let i = 0; i < 3; i++) {
      expect(guard.canActivate(ctx('a'))).toBe(true)
    }
    expect(() => guard.canActivate(ctx('a'))).toThrow(HttpException)
    try {
      guard.canActivate(ctx('a'))
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(429)
    }
  })

  it('counts each user separately', () => {
    expect(guard.canActivate(ctx('b'))).toBe(true)
  })

  it('lets the user back in once the window has passed', () => {
    now += 60_001
    expect(guard.canActivate(ctx('a'))).toBe(true)
  })
})

describe('TdRateLimitGuard eviction', () => {
  it('drops users whose window has emptied, even if they never come back', () => {
    let now = 5_000_000
    const guard = new TdRateLimitGuard(() => now, 3, 60_000)
    guard.canActivate(ctx('gone'))
    now += 60_001
    guard.canActivate(ctx('other'))
    expect(guard.trackedUsers()).toBe(1)
  })
})

describe('shared limiter', () => {
  it('is one instance across td controllers, so the limit is per user, not per route', () => {
    const guardsOf = (target: object): unknown[] =>
      (Reflect.getMetadata('__guards__', target) as unknown[] | undefined) ?? []
    const a = guardsOf(
      Object.getOwnPropertyDescriptor(TdBattleController.prototype, 'start')!.value
    )
    const b = guardsOf(
      Object.getOwnPropertyDescriptor(TdProfileController.prototype, 'getProfile')!.value
    )
    expect(a).toContain(tdRateLimitGuard)
    expect(b).toContain(tdRateLimitGuard)
  })
})
