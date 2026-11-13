import { CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common'
import { Request } from 'express'
import { IAppJwtPayload } from '../auth/auth.interface'

// Per-user sliding window, keyed by the JWT user id (never by IP). Use the shared `tdRateLimitGuard` after the JWT guard, so the limit is per user across all td routes.
// ponytail: in-memory, so the limit is per server instance; move to a shared store (e.g. the
// Postgres kv_store) if the service ever runs several replicas.
export class TdRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, number[]>()
  private lastSweep = 0

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
    this.sweep(now)
    const recent = (this.hits.get(userId) ?? []).filter(at => now - at < this.windowMs)
    if (recent.length >= this.limit) {
      throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS)
    }
    recent.push(now)
    this.hits.set(userId, recent)
    return true
  }

  trackedUsers(): number {
    return this.hits.size
  }

  // Once per window, forget users whose hits have all expired so the map cannot grow without bound.
  private sweep(now: number) {
    if (now - this.lastSweep < this.windowMs) return
    this.lastSweep = now
    for (const [id, times] of this.hits) {
      if (times.every(at => now - at >= this.windowMs)) this.hits.delete(id)
    }
  }
}

export const tdRateLimitGuard = new TdRateLimitGuard()
