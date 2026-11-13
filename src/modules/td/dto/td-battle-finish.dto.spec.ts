import 'reflect-metadata'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { MAX_INPUTS } from '../battle.config'
import { TdBattleFinishDto } from './td-battle-finish.dto'

const errorsFor = (body: unknown) => validateSync(plainToInstance(TdBattleFinishDto, body))
const ok = { seed: 5, ticks: 100, inputs: [{ tick: 0, type: 'summon', tile: 3 }] }

describe('TdBattleFinishDto', () => {
  it('accepts a well-formed log', () => {
    expect(errorsFor(ok)).toHaveLength(0)
  })

  it.each([
    ['too many ticks', { ...ok, ticks: 12_001 }],
    ['negative seed', { ...ok, seed: -1 }],
    ['seed over uint32', { ...ok, seed: 2 ** 32 }],
    ['non-integer tick', { ...ok, inputs: [{ tick: 1.5, type: 'summon', tile: 1 }] }],
    ['unknown input type', { ...ok, inputs: [{ tick: 1, type: 'win' }] }],
    ['tile off the board', { ...ok, inputs: [{ tick: 1, type: 'summon', tile: 99 }] }],
    ['log not an array', { ...ok, inputs: 'x' }],
    [
      'log too long',
      { ...ok, inputs: Array.from({ length: MAX_INPUTS + 1 }, () => ({ tick: 0, type: 'pick' })) },
    ],
  ])('rejects %s', (_name, body) => {
    expect(errorsFor(body).length).toBeGreaterThan(0)
  })
})
