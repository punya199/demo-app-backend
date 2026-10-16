// Short-lived login/security state (token allow-list, remembered devices, brute-force counters).
// All TTLs are in milliseconds.
export abstract class KvStore {
  abstract get(key: string): Promise<string | null>
  abstract set(key: string, value: string, ttlMs: number): Promise<void>
  /** Returns true only if this call claimed the key (missing or expired). */
  abstract setIfAbsent(key: string, value: string, ttlMs: number): Promise<boolean>
  abstract del(...keys: string[]): Promise<void>
  /** Atomically increments and returns the new count; the TTL is set when the key is created. */
  abstract incrementWithTtl(key: string, ttlMs: number): Promise<number>
  abstract deleteByPrefix(prefix: string): Promise<void>
}
