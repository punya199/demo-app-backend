# 04: Remember this device (30 days)

**What to build:** after completing 2FA, the browser is trusted for 30 days and skips the 2FA challenge on subsequent logins.

**Blocked by:** 03

**Status:** done

- [x] `completeTwoFactorLogin()` issues a random device token, stored in Redis (`remember_device:<userId>:<token>`, 30-day TTL) and set as an httpOnly cookie with matching maxAge
- [x] `login()` checks the cookie against Redis before issuing a 2FA pending challenge; a valid remembered device skips straight to full tokens
- [x] `AuthenticationService.setCookie()`'s cookie-name selection simplified (removed a two-way ternary that only worked because exactly two cookie types existed - would've silently misnamed a third)

Known/accepted, not fixed here:
- Remember-device survives logout by design - that's the point of the feature (matches Google/GitHub's "remember this device" semantics from the grilled decision). Not a bug.
- **Gap, out of scope**: changing your password does not revoke existing remember-device tokens (`user.service.ts` `changePassword()` untouched). A stolen device cookie + new password still skips 2FA for the rest of the 30-day window. Needs its own ticket if this app wants that guarantee - touches a different module/flow than this ticket covered.
- TTL is fixed-at-creation, not a rolling/sliding 30 days from last use.
