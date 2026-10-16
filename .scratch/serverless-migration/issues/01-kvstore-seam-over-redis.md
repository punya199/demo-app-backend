# 01: Put login state behind a KvStore seam (still Redis)

**What to build:** A prefactor with no behaviour change. The auth service and the authentication service stop depending on ioredis directly. They depend on a new injectable `KvStore` instead, which exposes six operations:

- `get`
- `set` with a TTL
- `setIfAbsent` with a TTL, returning whether this call claimed the key
- `del` (one or more keys)
- `incrementWithTtl`
- `deleteByPrefix`

The only implementation for now is backed by Redis. The remember-device Redis set (`sadd`/`smembers`) is replaced by `deleteByPrefix` on the per-device keys, so the interface has no set operations.

The token allow-list helpers in the authentication service ("get/set/del token from Redis") get store-neutral names. Their key names and TTLs stay the same.

The auth unit specs switch from the Redis mock to a small in-memory `KvStore` fake that honours TTLs. They keep asserting behaviour, not calls.

See spec: specs/serverless-migration.md (Backend: replace Redis with a key-value store; Testing Decisions, seam 1b).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Both auth services inject `KvStore`; neither imports ioredis anymore
- [ ] The Redis-backed `KvStore` implementation is the one injected, and the app runs locally exactly as before
- [ ] An in-memory `KvStore` fake with TTL support exists for specs
- [ ] The auth specs cover:
  - [ ] the account is blocked after 5 wrong passwords
  - [ ] 2FA locks after 5 wrong codes and unlocks after 60 s (fake timers)
  - [ ] a remembered device skips 2FA
  - [ ] revoking remembered devices removes all of the user's devices
  - [ ] a backup code works once and fails on reuse
  - [ ] logout invalidates the token
  - [ ] refresh returns the stored refresh token
- [ ] `yarn test`, `yarn lint` and `yarn build` pass
