import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import { ClaimSeasonBodyDto } from './pvp.dto'

const ok = (season: string) =>
  validateSync(plainToInstance(ClaimSeasonBodyDto, { season })).length === 0

describe('ClaimSeasonBodyDto season', () => {
  it.each(['2026-W45', '2026-W01', '2026-W53', '2026-10'])('accepts %s', season => {
    expect(ok(season)).toBe(true)
  })

  it.each(['2026-W00', '2026-W54', '2026-13', '2026-W5', '2026W45', ''])('rejects %s', season => {
    expect(ok(season)).toBe(false)
  })
})
