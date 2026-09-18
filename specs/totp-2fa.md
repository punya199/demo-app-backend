# TOTP Two-Factor Authentication

## Problem Statement

Login currently relies on username + password alone. If a password leaks (reuse, phishing, credential stuffing), an attacker gets full account access with no second check. Users have no way to add an extra layer of protection to their own account.

## Solution

Let users opt in to TOTP-based two-factor authentication (authenticator app, e.g. Google Authenticator/Authy) on top of their existing password. Once enabled, login requires the current 6-digit code in addition to the password, unless the device has been "remembered" within the last 30 days. Users can recover access via single-use backup codes if they lose their authenticator device, and can disable 2FA by proving continued possession of it.

## User Stories

1. As a user, I want to enable 2FA from my account settings, so that my account is protected even if my password is compromised.
2. As a user enabling 2FA, I want to scan a QR code with my authenticator app, so that I don't have to manually type a long secret.
3. As a user enabling 2FA, I want to also see the secret as text, so that I can add it manually if I can't scan a QR code.
4. As a user enabling 2FA, I want to confirm setup by entering a code before it activates, so that I don't get locked out from a bad scan or clock mismatch.
5. As a user completing 2FA enrollment, I want to receive a set of one-time backup codes, so that I can still log in if I lose my device.
6. As a user, I want to log in with my password and then be prompted for my TOTP code, so that both factors are required.
7. As a user, I want my device to be remembered for 30 days after a successful 2FA login, so that I'm not asked for a code on every single login from my usual browser.
8. As a user on a new/unrecognized device, I want to be asked for my TOTP code even though I logged in successfully elsewhere, so that a stolen password alone can't grant access from a new device.
9. As a user who lost my authenticator device, I want to use one of my backup codes to log in, so that I'm not permanently locked out.
10. As a user who used a backup code to log in, I want that code to be invalidated after use, so that it can't be reused if intercepted.
11. As a user, I want to disable 2FA, but only after proving I still hold a valid TOTP code, so that someone with just my session/password can't turn off my protection.
12. As a user, I want repeated wrong TOTP codes to be temporarily rate-limited rather than lock my whole account, so that a few mistyped codes don't lock me out entirely.
13. As a developer, I want the TOTP secret encrypted at rest, so that a database leak doesn't hand attackers a way to generate valid codes indefinitely.
14. As a developer, I want backup codes stored hashed (not plaintext), so that a database leak doesn't expose usable codes directly.

## Implementation Decisions

- **Scope**: opt-in per user, available to all users equally (no role-based enforcement).
- **User entity** (`user.entity.ts`): add `twoFactorEnabled` (boolean, default false), `twoFactorSecret` (encrypted string, `select: false`), `backupCodes` (array of bcrypt-hashed single-use codes, `select: false`).
- **Library**: `otplib` for TOTP secret generation/verification, `qrcode` for enrollment QR generation. Neither currently in `package.json`.
- **Enrollment flow**: two-step.
  1. Start enrollment — generate a TOTP secret, return QR code (otpauth:// URI rendered via `qrcode`) and the raw secret for manual entry. Secret is stored but `twoFactorEnabled` stays false until confirmed.
  2. Confirm enrollment — user submits a current code; on success, set `twoFactorEnabled = true`, generate 10 single-use backup codes, return them once (bcrypt-hashed copies stored, plaintext never persisted or logged).
- **Secret encryption**: `twoFactorSecret` is AES-encrypted at rest using an app-level key from env (new helper alongside `src/utils/password-helper.ts`), not plaintext — unlike a password hash, verification requires decrypting the secret, so it can't be one-way hashed.
- **Login flow change**:
  - Password check succeeds as today (`AuthService.login`).
  - If `twoFactorEnabled` is false, or the requesting device carries a valid "remembered device" token, proceed exactly as today — issue full access/refresh JWT cookies.
  - If `twoFactorEnabled` is true and no valid remembered-device token is present, instead issue a short-lived, scope-limited JWT (`scope: '2fa-pending'`) that only authorizes the 2FA verify endpoint. No access/refresh cookies are set yet.
  - New endpoint `POST /auth/2fa/verify` (guarded by the `2fa-pending` scope) accepts either a TOTP code or a backup code. On success: issues full access/refresh cookies as today, sets a 30-day "remember this device" token (cookie, following the existing Redis-allowlist pattern used for access/refresh tokens), and — if a backup code was used — marks that specific code consumed.
- **Remembered device**: implemented as a Redis-backed allowlist entry (same pattern as existing token allowlist), keyed by user + device token, TTL 30 days.
- **Rate limiting on 2FA verify**: separate counter from the existing password-failure counter (`AuthService.updateWrongPassword`). Repeated invalid codes trigger a short cooldown (e.g. 5 failures → 60s lock) rather than setting `status = BLOCKED`.
- **Disable 2FA**: `POST /auth/2fa/disable`, requires a currently valid TOTP code in the request (not just an authenticated session), then clears `twoFactorEnabled`, `twoFactorSecret`, and `backupCodes`.

## Testing Decisions

- Tests should exercise external behavior (HTTP request/response and resulting auth state) rather than internals of `otplib`, the AES helper, or QR generation.
- Single e2e seam, following the existing pattern in `test/voting.e2e-spec.ts`: `Test.createTestingModule` with `DataSource`/repositories overridden via `useValue`, `ValidationPipe` applied, requests driven through `supertest` against the real controller/guard/pipe stack.
- Covered flows: enrollment start → confirm → activation; login with 2FA disabled (unchanged behavior); login with 2FA enabled and no remembered device (returns pending state, no full cookies); 2FA verify with correct code (issues full cookies + remember-device token); verify with wrong code (rejected, cooldown after repeated failures); verify with a backup code (accepted once, rejected on reuse); login with 2FA enabled and a valid remembered-device token (skips the 2FA step); disable 2FA with valid code (succeeds) and with invalid/missing code (rejected).
- No dedicated unit tests for the AES helper or QR generation — these are thin wrappers over library calls, exercised indirectly through the e2e flow.

## Out of Scope

- Forgot-password flow (separate spec).
- SMS-based OTP or push-based 2FA (TOTP/authenticator app only).
- Admin-initiated 2FA reset/disable on behalf of a user.
- Mandatory/forced 2FA for any user segment (may be revisited later, not part of this feature).
- Changing the existing password-failure lockout behavior (`status = BLOCKED` after 5 wrong passwords) — untouched by this spec.

## Further Notes

- Backup codes are shown to the user exactly once at enrollment confirmation time; the API must never return them again afterward.
- The `2fa-pending` scoped JWT should be short-lived (e.g. 5 minutes) to limit the window an intercepted pending-token could be replayed in.
