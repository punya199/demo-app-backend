// Friend codes, friendship pairs and rental fees: the pure parts of the social features.

// Letters and digits that can't be mistaken for each other (no 0/O, 1/I/L).
export const FRIEND_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const FRIEND_CODE_LENGTH = 8

// `randomIndex(max)` returns an integer in [0, max): injected so tests are deterministic and the
// server passes crypto.randomInt.
export const generateFriendCode = (randomIndex: (max: number) => number) =>
  Array.from(
    { length: FRIEND_CODE_LENGTH },
    () => FRIEND_CODE_ALPHABET[randomIndex(FRIEND_CODE_ALPHABET.length)]
  ).join('')

// What a person typed: ignore case and stray spaces or dashes ("abcd-2345" -> "ABCD2345").
export const normalizeFriendCode = (input: string) => input.replace(/[\s-]/g, '').toUpperCase()

export const isValidFriendCode = (code: string) =>
  code.length === FRIEND_CODE_LENGTH && [...code].every(char => FRIEND_CODE_ALPHABET.includes(char))

// A friendship is one row per pair, with the smaller id first, so "A asks B" and "B asks A" at the
// same time hit the same unique row. UUIDs in canonical lowercase compare the same way in
// JavaScript and in Postgres.
export const orderPair = (a: string, b: string) => {
  const [low, high] = a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a]
  return { userLow: low.toLowerCase(), userHigh: high.toLowerCase() }
}

// The renter pays only what the owner can still earn today, so coins never vanish: once the owner
// is at the daily cap, the rental is free.
export const calcRentalFee = (earnedToday: number, fee: number, dailyCap: number) =>
  Math.max(0, Math.min(fee, dailyCap - earnedToday))
