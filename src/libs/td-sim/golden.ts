import type { Replay } from './sim'

/** Pinned replay shared by both repos' tests. Change GOLDEN_HASH only on purpose: it means sim behaviour changed. */
export const GOLDEN_REPLAY: Replay = {
  seed: 20260101,
  ticks: 600,
  inputs: [
    { tick: 20, type: 'spend', amount: 10 },
    { tick: 20, type: 'spend', amount: 5 },
    { tick: 300, type: 'spend', amount: 100000 },
    { tick: 599, type: 'spend', amount: 40 },
  ],
}

export const GOLDEN_HASH = 'f8c90a95'
