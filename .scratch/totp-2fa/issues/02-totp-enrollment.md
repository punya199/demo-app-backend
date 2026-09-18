# 02: TOTP enrollment (start + confirm)

**What to build:** an authenticated user can start TOTP enrollment (get a QR code + secret), confirm it with a code, and receive one-time backup codes.

**Blocked by:** 01

**Status:** done

- [x] `POST /auth/2fa/enroll` (authenticated) generates a secret, stores it encrypted, returns QR code data URL + raw secret
- [x] `POST /auth/2fa/confirm` verifies a code against the stored secret; on success sets `twoFactorEnabled = true`, generates 10 bcrypt-hashed backup codes, returns them once
- [x] Wrong/missing code rejected without activating 2FA
- [x] Writes use `save()` (not `update()`) to keep the AuditSubscriber-driven audit trail intact

Note: login() is untouched - enrolling has no effect on the login flow yet, that's ticket 3.
