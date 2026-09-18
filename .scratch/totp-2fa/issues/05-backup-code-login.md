# 05: Backup code login

**What to build:** `2fa/verify` accepts a backup code as an alternative to a TOTP code when the authenticator device is unavailable; the code is single-use.

**Blocked by:** 03

**Status:** done

- [x] `completeTwoFactorLogin()` falls back to checking backup codes when the TOTP code doesn't match
- [x] A matched backup code is marked `usedAt` and can't be reused
- [x] A Redis claim-lock (`backup_code_claim:<userId>:<hash>`, 60s, `SET NX`) closes the check-then-act race where two concurrent requests with the same code could both pass the "is it unused" check before either write lands
- [x] Backup-code comparison short-circuits on first match instead of bcrypt-comparing against every unused code in parallel
