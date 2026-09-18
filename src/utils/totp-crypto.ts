import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'
import appConfig from '../config/app-config'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

const getKey = () => Buffer.from(appConfig.TOTP_ENCRYPTION_KEY, 'hex')

export const encryptTotpSecret = (plainSecret: string) => {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plainSecret, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

export const decryptTotpSecret = (encryptedSecret: string) => {
  const data = Buffer.from(encryptedSecret, 'base64')
  const iv = data.subarray(0, IV_LENGTH)
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + 16)
  const encrypted = data.subarray(IV_LENGTH + 16)

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
