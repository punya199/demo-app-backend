import { HttpException, HttpStatus } from '@nestjs/common'
import {
  CoreEntry,
  DEFAULT_MAX_TICKS,
  hashState,
  PoolEntry,
  RelicId,
  runReplay,
  SimInput,
  SimState,
} from '../../libs/td-sim'
import { starsFor } from './stage'
import { COINS_PER_ROUND, COINS_WIN_BONUS } from './battle.config'

export interface IBattleSession {
  id: string
  userId: string
  seed: number
  status: 'started' | 'finished'
  /** Owned-hero snapshot taken at battle start; null (older rows) means the starter pool. */
  pool: PoolEntry[] | null
  /** Equipped-core snapshot taken at battle start; null (older rows) means none. */
  cores: CoreEntry[] | null
  /** Unlocked-relic snapshot taken at battle start; null (older rows) means none. */
  relics: RelicId[] | null
  /** 1 to STAGE_COUNT, chosen at battle start. */
  stage: number
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
  /** HQ health left at the end, from the replay. */
  hp: number
  /** 0 for a loss, else 1 to 3 from the HQ health left. */
  stars: number
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
      {
        seed: session.seed,
        ticks: req.ticks,
        inputs: req.inputs,
        pool: session.pool ?? undefined,
        cores: session.cores ?? undefined,
        relics: session.relics ?? undefined,
        stage: session.stage,
      },
      { maxTicks: DEFAULT_MAX_TICKS }
    )
  } catch (error) {
    if (error instanceof RangeError) fail(HttpStatus.UNPROCESSABLE_ENTITY, error.message)
    throw error
  }
  if (state.status === 'running') {
    throw new HttpException(
      'The input log does not finish the battle',
      HttpStatus.UNPROCESSABLE_ENTITY
    )
  }
  return {
    status: state.status,
    round: state.round,
    hp: state.hp,
    stars: starsFor(state.status, state.hp),
    coins: coinsFor(state),
    hash: hashState(state),
  }
}
