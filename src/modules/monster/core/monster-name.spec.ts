import { NICKNAME_MAX_LENGTH, normalizeNickname } from './monster-name'

describe('normalizeNickname', () => {
  it('accepts Thai, English, digits and the allowed symbols', () => {
    expect(normalizeNickname('น้องไฟ')).toBe('น้องไฟ')
    expect(normalizeNickname('Mochi_2.0-x')).toBe('Mochi_2.0-x')
  })

  it('trims and collapses repeated spaces', () => {
    expect(normalizeNickname('  Big   Fluffy  ')).toBe('Big Fluffy')
  })

  it('treats empty input as clearing the nickname', () => {
    expect(normalizeNickname('')).toBeNull()
    expect(normalizeNickname('   ')).toBeNull()
  })

  it('limits the length by characters, not bytes', () => {
    expect(normalizeNickname('ก'.repeat(NICKNAME_MAX_LENGTH))).toHaveLength(NICKNAME_MAX_LENGTH)
    expect(() => normalizeNickname('ก'.repeat(NICKNAME_MAX_LENGTH + 1))).toThrow('1-16 characters')
  })

  it.each(['<b>hi</b>', 'a@b', 'emoji 😀', 'tab\tname', 'a/b', 'name;drop'])(
    'rejects %p',
    value => {
      expect(() => normalizeNickname(value)).toThrow('not allowed')
    }
  )
})
