import { isValidMasteryPick, PASSIVE_NODES } from './passive-data'

describe('isValidMasteryPick', () => {
  const mastery = PASSIVE_NODES.find(node => node.kind === 'mastery')!

  it('accepts only whole option numbers inside the node option list', () => {
    const count = mastery.options!.length
    expect(isValidMasteryPick(mastery.id, 0)).toBe(true)
    expect(isValidMasteryPick(mastery.id, count - 1)).toBe(true)
    expect(isValidMasteryPick(mastery.id, count)).toBe(false)
    expect(isValidMasteryPick(mastery.id, -1)).toBe(false)
    expect(isValidMasteryPick(mastery.id, 0.5)).toBe(false)
    expect(isValidMasteryPick('nope', 0)).toBe(false)
  })

  it('treats a mastery node with no option list as having no valid pick', () => {
    const saved = mastery.options
    try {
      mastery.options = undefined
      expect(isValidMasteryPick(mastery.id, 0)).toBe(false)
    } finally {
      mastery.options = saved
    }
  })
})
