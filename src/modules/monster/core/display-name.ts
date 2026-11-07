import { createHash } from 'crypto'

// The name other players see when a player has not chosen one: a short tag from a hash of the user
// id. The username is never shown (PDPA).
export const defaultDisplayName = (userId: string) =>
  `ผู้ฝึก#${createHash('sha256').update(userId).digest('hex').slice(0, 4)}`
