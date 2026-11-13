import { ExecutionContext, HttpException } from '@nestjs/common'
import { TdRateLimitGuard } from './td-rate-limit.guard'

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
