# 02: Postgres KvStore; remove Redis

**What to build:** Login state lives in Postgres, and the backend no longer needs Redis at all.

- Add a TypeORM migration that creates `kv_store`:

  ```
  kv_store (
    key        text primary key,
    value      text not null,
    expires_at timestamptz not null
  )
  ```

  plus an index on `expires_at`.
- Add a Postgres-backed `KvStore`:
  - Reads ignore expired rows.
  - `setIfAbsent` and `incrementWithTtl` are each one atomic SQL statement. An expired key can be claimed again.
  - Expired rows are deleted lazily during login. There is no cron.
- Make the Postgres implementation the one that is injected. Delete the Redis implementation along with:
  - both Redis module registrations
  - the Redis config file
  - the `REDIS_*` config validation entries
  - the Redis service in docker-compose
  - the `ioredis` and `@nestjs-modules/ioredis` dependencies
- Lower TypeORM logging to errors only.
- Add a `yarn test:integration` command that runs a `KvStore` contract suite against the docker-compose Postgres. Plain `yarn test` stays database-free.

See spec: specs/serverless-migration.md (Backend: replace Redis with a key-value store; Testing Decisions, seam 1a).

**Blocked by:** 01 (Put login state behind a KvStore seam)

**Status:** ready-for-agent

- [ ] The migration creates `kv_store`, and its `down()` drops it
- [ ] The contract suite under `yarn test:integration` passes against real Postgres. It covers:
  - [ ] get after set
  - [ ] get after expiry
  - [ ] overwriting resets the value and the TTL
  - [ ] `setIfAbsent` claims a missing key, refuses a live key, and claims an expired key
  - [ ] two concurrent `setIfAbsent` calls: exactly one wins
  - [ ] `incrementWithTtl` counts 1, 2, 3 and restarts after expiry
  - [ ] concurrent increments lose no updates
  - [ ] `del` removes several keys at once
  - [ ] `deleteByPrefix` removes only matching keys
- [ ] No Redis references remain in source, config, compose or dependencies
- [ ] The app starts with no `REDIS_*` env vars set
- [ ] Locally via docker-compose with no Redis, these all work:
  - [ ] login
  - [ ] 2FA
  - [ ] remember-device
  - [ ] logout
  - [ ] refresh
- [ ] `yarn test`, `yarn lint` and `yarn build` pass
