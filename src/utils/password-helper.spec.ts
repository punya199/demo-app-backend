import { comparePassword, hashPassword } from './password-helper'

describe('password-helper', () => {
  it('hashes a password into a bcrypt hash', async () => {
    const hash = await hashPassword('my-secret-password')

    expect(hash).not.toBe('my-secret-password')
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$/)
  })

  it('matches the original password against its hash', async () => {
    const hash = await hashPassword('my-secret-password')

    await expect(comparePassword('my-secret-password', hash)).resolves.toBe(true)
  })

  it('rejects an incorrect password against a hash', async () => {
    const hash = await hashPassword('my-secret-password')

    await expect(comparePassword('wrong-password', hash)).resolves.toBe(false)
  })
})
