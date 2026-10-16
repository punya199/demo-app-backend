import { KvStore } from './kv-store'

// Test fake. Uses Date.now() so jest fake timers drive expiry.
export class InMemoryKvStore extends KvStore {
  private readonly entries = new Map<string, { value: string; expiresAt: number }>()

  private live(key: string) {
    const entry = this.entries.get(key)
    if (entry && entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry
  }

  get(key: string) {
    return Promise.resolve(this.live(key)?.value ?? null)
  }

  set(key: string, value: string, ttlMs: number) {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs })
    return Promise.resolve()
  }

  async setIfAbsent(key: string, value: string, ttlMs: number) {
    if (this.live(key)) return false
    await this.set(key, value, ttlMs)
    return true
  }

  del(...keys: string[]) {
    keys.forEach(key => this.entries.delete(key))
    return Promise.resolve()
  }

  incrementWithTtl(key: string, ttlMs: number) {
    const entry = this.live(key)
    const count = entry ? +entry.value + 1 : 1
    this.entries.set(key, {
      value: String(count),
      expiresAt: entry?.expiresAt ?? Date.now() + ttlMs,
    })
    return Promise.resolve(count)
  }

  deleteByPrefix(prefix: string) {
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) this.entries.delete(key)
    }
    return Promise.resolve()
  }
}
