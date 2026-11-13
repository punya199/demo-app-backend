import {
  GOLDEN_ELEMENT_HASH,
  GOLDEN_ELEMENT_REPLAY,
  GOLDEN_HASH,
  GOLDEN_REPLAY,
  hashState,
  runReplay,
} from './td-sim'

describe('td-sim (synced copy)', () => {
  it('replays the golden seed to the same hash as the frontend', () => {
    expect(hashState(runReplay(GOLDEN_REPLAY))).toBe(GOLDEN_HASH)
  })

  it('replays the elemental golden (mixed pool, equipped cores) to the same hash as the frontend', () => {
    expect(hashState(runReplay(GOLDEN_ELEMENT_REPLAY))).toBe(GOLDEN_ELEMENT_HASH)
  })

  it('rejects a replay over the tick cap', () => {
    expect(() => runReplay({ seed: 1, ticks: 101, inputs: [] }, { maxTicks: 100 })).toThrow(
      RangeError
    )
  })
})
