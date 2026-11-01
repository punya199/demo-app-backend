// Pet nicknames are public text (friends, arena and rental cards show them next to the species),
// so the rules are strict: letters (Thai or English), digits, space and - _ . only.
export const NICKNAME_MAX_LENGTH = 16
export const RENAME_COOLDOWN_MS = 10 * 60 * 1000

const ALLOWED = /^[\p{Script=Thai}A-Za-z0-9 _.-]+$/u

// Returns the cleaned nickname, or null for "no nickname" (empty input clears it). Throws a
// plain Error with a stable message the service turns into a 400.
export const normalizeNickname = (input: string): string | null => {
  const name = input.trim().replace(/ {2,}/g, ' ')
  if (!name) {
    return null
  }
  if ([...name].length > NICKNAME_MAX_LENGTH) {
    throw new Error(`Pet name must be 1-${NICKNAME_MAX_LENGTH} characters`)
  }
  if (!ALLOWED.test(name)) {
    throw new Error('Pet name has characters that are not allowed')
  }
  return name
}
