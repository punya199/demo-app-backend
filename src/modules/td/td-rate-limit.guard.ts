import { CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common'
import { Request } from 'express'
import { IAppJwtPayload } from '../auth/auth.interface'

// Per-user sliding window, keyed by the JWT user id (never by IP). Use it as an instance (`new TdRateLimitGuard()`) after the JWT guard.
// ponytail: in-memory, so the limit is per server instance; move to a shared store (e.g. the
// Postgres kv_store) if the service ever runs several replicas.
export class TdRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly clock: () => number = Date.now,
    private readonly limit = 30,
    private readonly windowMs = 60_000
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<Request>().user as IAppJwtPayload | undefined
    const userId = user?.['user-id']
    if (!userId) {
      return false
    }
    const now = this.clock()
    const recent = (this.hits.get(userId) ?? []).filter(at => now - at < this.windowMs)
    if (recent.length >= this.limit) {
      this.hits.set(userId, recent)
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS)
    }
    recent.push(now)
    this.hits.set(userId, recent)
    return true
  }
}
