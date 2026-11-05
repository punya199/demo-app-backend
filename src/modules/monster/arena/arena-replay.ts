import { IArenaFrame, IArenaResult } from './arena-types'

// What a client needs to replay a fight: every `step`-th frame (it interpolates between them), all
// events, and the fighters. The server already decided the result; this is only for drawing it.
export const REPLAY_FRAME_STEP = 2

export interface IArenaReplay {
  seed: number
  winner: number
  ticks: number
  step: number
  frames: IArenaFrame[]
  events: IArenaResult['events']
  fighters: IArenaResult['fighters']
  checksum: string
}

export const toArenaReplay = (result: IArenaResult, step = REPLAY_FRAME_STEP): IArenaReplay => ({
  seed: result.seed,
  winner: result.winner,
  ticks: result.ticks,
  step,
  frames: result.frames.filter((_, i) => i % step === 0 || i === result.frames.length - 1),
  events: result.events.filter(event => event.kind !== 'regen'),
  fighters: result.fighters,
  checksum: result.checksum,
})
