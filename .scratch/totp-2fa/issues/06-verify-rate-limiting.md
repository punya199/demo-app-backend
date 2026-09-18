# 06: TOTP verify rate limiting

**What to build:** repeated wrong codes at `2fa/verify` trigger a short cooldown, independent of the password-failure/`BLOCKED` counter.

**Blocked by:** 03

**Status:** done

- [x] 5 wrong codes (TOTP or backup) within 60s trips a 60s lock; further attempts (even a correct code) are rejected while locked
- [x] Separate Redis keys from the password-lockout counter - a fumbled 2FA code never sets `status = BLOCKED`
- [x] Failure counter clears on a successful verify
- [x] Extracted a shared `bumpFailureCounter()` (atomic `INCR` + conditional `EXPIRE`) used by both this counter and the pre-existing password-lockout counter - the original get-then-set/incr pattern had a real race (concurrent requests could undercount failures and outrun the lockout threshold); fixing it once here also closes the same pre-existing race in password lockout.
