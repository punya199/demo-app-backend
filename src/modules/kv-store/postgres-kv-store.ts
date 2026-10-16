import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { KvStore } from './kv-store'

// All expiry maths uses the database clock (now()). TTLs are cast to double precision because
// 30 days in ms overflows int4. Rows are never treated as live once expires_at <= now().
const EXPIRES_AT = `now() + $3::double precision * interval '1 millisecond'`

@Injectable()
export class PostgresKvStore extends KvStore {
  constructor(private readonly dataSource: DataSource) {
    super()
  }

  async get(key: string) {
    const rows: { value: string }[] = await this.dataSource.query(
      `SELECT value FROM kv_store WHERE key = $1 AND expires_at > now()`,
      [key]
    )
    return rows[0]?.value ?? null
  }

  async set(key: string, value: string, ttlMs: number) {
    await this.dataSource.query(
      `INSERT INTO kv_store (key, value, expires_at) VALUES ($1, $2, ${EXPIRES_AT})
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`,
      [key, value, ttlMs]
    )
  }

  // One statement: a live row makes the WHERE false, so nothing is returned and the claim fails.
  async setIfAbsent(key: string, value: string, ttlMs: number) {
    const rows: unknown[] = await this.dataSource.query(
      `INSERT INTO kv_store (key, value, expires_at) VALUES ($1, $2, ${EXPIRES_AT})
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
       WHERE kv_store.expires_at <= now()
       RETURNING key`,
      [key, value, ttlMs]
    )
    return rows.length > 0
  }

  async del(...keys: string[]) {
    if (keys.length) {
      await this.dataSource.query(`DELETE FROM kv_store WHERE key = ANY($1)`, [keys])
    }
  }

  async incrementWithTtl(key: string, ttlMs: number) {
    const rows: { value: string }[] = await this.dataSource.query(
      `INSERT INTO kv_store (key, value, expires_at) VALUES ($1, $2, ${EXPIRES_AT})
       ON CONFLICT (key) DO UPDATE SET
         value = CASE WHEN kv_store.expires_at <= now() THEN EXCLUDED.value
                      ELSE (kv_store.value::bigint + 1)::text END,
         expires_at = CASE WHEN kv_store.expires_at <= now() THEN EXCLUDED.expires_at
                           ELSE kv_store.expires_at END
       RETURNING value`,
      [key, '1', ttlMs]
    )
    return Number(rows[0].value)
  }

  async deleteByPrefix(prefix: string) {
    await this.dataSource.query(`DELETE FROM kv_store WHERE starts_with(key, $1)`, [prefix])
  }

  async deleteExpired() {
    await this.dataSource.query(`DELETE FROM kv_store WHERE expires_at <= now()`)
  }
}
