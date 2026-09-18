# 03: 2FA-required login (password + TOTP code)

**What to build:** login with 2FA enabled returns a pending challenge instead of full tokens; a second endpoint completes login with a TOTP code.

**Blocked by:** 02

**Status:** done

- [x] `login()` returns `{ twoFactorRequired: true, pendingToken }` (scoped JWT, 5min expiry, no cookies set) when `twoFactorEnabled` is true, instead of full tokens
- [x] `POST /auth/2fa/verify`, guarded by a dedicated `TwoFactorPendingGuard` (Bearer pending token only, deliberately can't be used against any other `@AuthUser()` route), completes login on a correct code and sets the real access/refresh cookies
- [x] Account status (`ACTIVE`) is re-checked at verify time, not just at the original password step
- [x] Wrong code rejected without issuing tokens

Known accepted gap (per spec's "Further Notes"): the pending token isn't single-use - a correct code can re-mint tokens by replaying the same pendingToken until its 5-minute expiry. Mitigated by short expiry, not eliminated. Closing this fully needs Redis-tracked token consumption, not currently in the 7-ticket plan - flag if this needs hardening.

Not yet built: remember-device (ticket 4), backup-code login (ticket 5), rate limiting on verify attempts (ticket 6) - guessing 1,000,000 TOTP codes within the pending token's 5-minute window is currently unthrottled.
