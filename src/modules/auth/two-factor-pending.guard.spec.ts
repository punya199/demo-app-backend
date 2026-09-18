import { ExecutionContext } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { TwoFactorPendingGuard } from './two-factor-pending.guard'

const makeRequest = (authorization?: string) => ({ headers: { authorization }, user: undefined })

const makeContext = (req: ReturnType<typeof makeRequest>) =>
  ({
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  }) as unknown as ExecutionContext

describe('TwoFactorPendingGuard', () => {
  let jwtService: { verify: jest.Mock }
  let guard: TwoFactorPendingGuard

  beforeEach(() => {
    jwtService = { verify: jest.fn() }
    guard = new TwoFactorPendingGuard(jwtService as unknown as JwtService)
  })

  it('allows a valid two-factor-pending token and attaches the payload to req.user', () => {
    const payload = { sub: 'user-1', scope: 'two-factor-pending' }
    jwtService.verify.mockReturnValue(payload)
    const req = makeRequest('Bearer valid')

    expect(guard.canActivate(makeContext(req))).toBe(true)
    expect(req.user).toEqual(payload)
  })

  it('rejects a missing Authorization header', () => {
    expect(() => guard.canActivate(makeContext(makeRequest()))).toThrow()
  })

  it('rejects a token that fails verification', () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('invalid signature')
    })

    expect(() => guard.canActivate(makeContext(makeRequest('Bearer bad')))).toThrow()
  })

  it('rejects a valid token with the wrong scope', () => {
    jwtService.verify.mockReturnValue({ sub: 'user-1', scope: 'access-token' })

    expect(() => guard.canActivate(makeContext(makeRequest('Bearer other-scope')))).toThrow()
  })
})
