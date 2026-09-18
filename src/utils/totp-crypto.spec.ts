import appConfig from '../config/app-config'
import { decryptTotpSecret, encryptTotpSecret } from './totp-crypto'

describe('totp-crypto', () => {
  beforeAll(() => {
    appConfig.TOTP_ENCRYPTION_KEY = '0'.repeat(64)
  })

  it('round-trips a secret through encrypt then decrypt', () => {
    const encrypted = encryptTotpSecret('JBSWY3DPEHPK3PXP')

    expect(encrypted).not.toBe('JBSWY3DPEHPK3PXP')
    expect(decryptTotpSecret(encrypted)).toBe('JBSWY3DPEHPK3PXP')
  })

  it('throws when the ciphertext has been tampered with', () => {
    const encrypted = encryptTotpSecret('JBSWY3DPEHPK3PXP')
    const tampered = Buffer.from(encrypted, 'base64')
    tampered[tampered.length - 1] ^= 0xff

    expect(() => decryptTotpSecret(tampered.toString('base64'))).toThrow()
  })
})
