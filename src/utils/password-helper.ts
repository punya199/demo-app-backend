import * as bcrypt from 'bcrypt'

const SALT_ROUNDS = 10

export const hashPassword = (plainPassword: string) => bcrypt.hash(plainPassword, SALT_ROUNDS)

export const comparePassword = (plainPassword: string, hashedPassword: string) =>
  bcrypt.compare(plainPassword, hashedPassword)
