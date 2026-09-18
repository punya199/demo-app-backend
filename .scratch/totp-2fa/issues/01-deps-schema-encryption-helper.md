# 01: Add TOTP schema columns & encryption helper

**What to build:** the `users` table and encryption groundwork that every later TOTP ticket builds on — no user-facing behavior yet.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `users` table gains `two_factor_enabled` (bool, default false), `two_factor_secret` (nullable, `select:false`), `backup_codes` (jsonb, nullable, `select:false`) via a checked-in migration
- [x] AES-256-GCM encrypt/decrypt helper for the TOTP secret (`src/utils/totp-crypto.ts`), key from `TOTP_ENCRYPTION_KEY` env var (added to `appConfig` + Joi schema + `.env.example`)
- [x] Round-trip test (encrypt → decrypt → original) and a tampered-ciphertext-throws test

Note: not published to GitHub Issues — `gh` isn't authenticated in this session (`gh auth login` needed). Tickets 2–7 from the `/to-tickets` breakdown are still unconfirmed by the user; don't build them without re-checking.
