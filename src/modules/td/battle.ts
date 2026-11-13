import { HttpException, HttpStatus } from '@nestjs/common'
import { DEFAULT_MAX_TICKS, hashState, runReplay, SimInput, SimState } from '../../libs/td-sim'
import { COINS_PER_ROUND, COINS_WIN_BONUS } from './battle.config'

export interface IBattleSession {
  id: string
  userId: string
  seed: number
  status: 'started' | 'finished'
  expiresAt: Date
}

export interface IFinishRequest {
  userId: string
  seed: number
  ticks: number
  inputs: SimInput[]
}

export interface IBattleResult {
  status: 'won' | 'lost'
  round: number
  coins: number
  hash: string
}

// Pure. Coins depend only on the replayed result: rounds survived, plus a bonus for a win.
export const coinsFor = (state: { status: string; round: number }): number =>
  state.round * COINS_PER_ROUND + (state.status === 'won' ? COINS_WIN_BONUS : 0)

const fail = (status: HttpStatus, message: string): never => {
  throw new HttpException(message, status)
}

// Pure. Checks the session against the request, then replays the log with the same td-sim the
// client plays with. Nothing the client says about the outcome is read: only user, seed and log.
export const evaluateFinish = (
  session: IBattleSession,
  req: IFinishRequest,
  now: Date
): IBattleResult => {
  if (session.userId !== req.userId) fail(HttpStatus.NOT_FOUND, 'Battle not found')
  if (session.status !== 'started') fail(HttpStatus.CONFLICT, 'Battle already finished')
  if (now.getTime() > session.expiresAt.getTime()) fail(HttpStatus.GONE, 'Battle expired')
  if (req.seed !== session.seed) fail(HttpStatus.BAD_REQUEST, 'Seed does not match the battle')

  let state: SimState
  try {
    state = runReplay(
      { seed: session.seed, ticks: req.ticks, inputs: req.inputs },
      { maxTicks: DEFAULT_MAX_TICKS }
    )
  } catch (error) {
    if (error instanceof RangeError) fail(HttpStatus.UNPROCESSABLE_ENTITY, error.message)
    throw error
  }
  if (state.status === 'running')
    fail(HttpStatus.UNPROCESSABLE_ENTITY, 'The input log does not finish the battle')
  return {
    status: state.status,
    round: state.round,
    coins: coinsFor(state),
    hash: hashState(state),
  }
}
