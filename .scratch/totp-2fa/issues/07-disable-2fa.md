# 07: Disable 2FA

**What to build:** `POST /auth/2fa/disable` requires a valid current TOTP code, then clears the user's 2FA state.

**Blocked by:** 03

**Status:** done

- [x] Requires a currently valid TOTP code (not just an authenticated session) to disable
- [x] Clears `twoFactorEnabled`, `twoFactorSecret`, `backupCodes`
- [x] Rate-limited by the same lock/counter as `2fa/verify` - a stolen session token without the TOTP secret doesn't get unlimited guesses to turn 2FA off
- [x] Revokes every remembered device for the user on disable, via a per-user Redis set of active remember-device tokens (`remember_device_tokens:<userId>`) - closes a gap where a stale "remembered" cookie from before disabling would silently skip 2FA again after a later re-enrollment
