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

/** Rebaselined on purpose in ticket 13: elements and cores (advantage damage, hero and enemy elements, cores in the hashed state). Ticket 11: the stage joins the hashed state (stage 1 plays the same rules as before). Ticket 10: gears and pool entries carry a gear mod level, which joins the hashed state (mod 0 plays the same rules as before). Ticket 09: gears carry a star and the state carries the hero pool, so the hash input changed (the starter pool plays the same rules as before). Earlier: ticket 04 added rounds, the boss, skills and the draft. */
export const GOLDEN_HASH = 'e11269a0'

/** Elemental balance replay: a mixed-element pool, two equipped cores, stage 1 (nature boss). Pins elemental advantage and core bonuses; change GOLDEN_ELEMENT_HASH only on purpose. */
export const GOLDEN_ELEMENT_REPLAY: Replay = {
  seed: 20260202,
  ticks: 1500,
  pool: [
    { hero: 'cinder-witch', star: 1 },
    { hero: 'frost-herald', star: 2 },
    { hero: 'moss-healer', star: 1 },
    { hero: 'void-blade', star: 1, mod: 1 },
  ],
  cores: [
    { element: 'fire', rarity: 'epic' },
    { element: 'ice', rarity: 'common' },
  ],
  inputs: [
    { tick: 0, type: 'summon', tile: 27 },
    { tick: 0, type: 'summon', tile: 22 },
    { tick: 0, type: 'summon', tile: 26 },
    { tick: 50, type: 'summon', tile: 28 },
    { tick: 90, type: 'summon', tile: 21 },
    { tick: 130, type: 'summon', tile: 23 },
    { tick: 600, type: 'summon', tile: 17 },
    // drafts: a pick outside a draft is ignored, so these only act when the round has just cleared
    { tick: 700, type: 'pick', index: 0 },
    { tick: 720, type: 'summon', tile: 20 },
    { tick: 900, type: 'pick', index: 1 },
    { tick: 1000, type: 'summon', tile: 15 },
    { tick: 1100, type: 'pick', index: 2 },
  ],
}
export const GOLDEN_ELEMENT_HASH = '4b00150f'
