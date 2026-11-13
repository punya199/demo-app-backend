import type { Replay } from './sim'

/** Pinned replay shared by both repos' tests. Change GOLDEN_HASH only on purpose: it means sim behaviour changed. */
export const GOLDEN_REPLAY: Replay = {
  seed: 20260101,
  ticks: 1800,
  inputs: [
    // source tile and a chain off it, then a -2 tile (16), then a merge of the two knights (21 into 26)
    { tick: 0, type: 'summon', tile: 27 },
    { tick: 0, type: 'summon', tile: 22 },
    { tick: 0, type: 'summon', tile: 26 },
    { tick: 60, type: 'summon', tile: 28 },
    { tick: 100, type: 'summon', tile: 21 },
    { tick: 140, type: 'summon', tile: 23 },
    { tick: 200, type: 'summon', tile: 17 },
    { tick: 250, type: 'summon', tile: 16 },
    { tick: 300, type: 'merge', from: 21, to: 26 },
    { tick: 599, type: 'summon', tile: 0 },
    // round 0 clears: take the second skill of the first draft, then keep building
    { tick: 725, type: 'pick', index: 1 },
    { tick: 740, type: 'summon', tile: 24 },
    { tick: 780, type: 'summon', tile: 23 },
    { tick: 820, type: 'summon', tile: 28 },
    { tick: 860, type: 'summon', tile: 20 },
    // round 1 clears: take the third skill of the second draft
    { tick: 1340, type: 'pick', index: 2 },
    { tick: 1400, type: 'summon', tile: 15 },
  ],
}

/** Rebaselined on purpose in ticket 04: rounds, enemy types, the boss, skills and the draft changed the rules, the state shape and the golden inputs (now two drafts). */
export const GOLDEN_HASH = '6d77f6ed'
