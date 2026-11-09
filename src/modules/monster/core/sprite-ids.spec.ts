import { EnumMonsterLine, EnumMonsterStage } from '../../../db/entities/monster.entity'
import { ARENA_STAGES } from '../arena/arena-data'
import { plainDummy } from '../arena/dummy-data'
import { RAID_BOSSES } from '../boss/raid-data'
import { WORLD_BOSS_ROTATION } from '../boss/world-boss-data'
import { fusedSpeciesId, getSpecies, SPECIES, spriteOfSpecies } from './species-data'

// Sprite ids name the pixel-art designs in demo-app (src/pages/project/tamagotchi/sprites).
describe('sprite ids', () => {
  const all = [
    ...SPECIES.map(species => species.sprite),
    ...Object.values(ARENA_STAGES).map(stage => stage.sprite),
    ...RAID_BOSSES.map(boss => boss.sprite),
    ...WORLD_BOSS_ROTATION.map(boss => boss.sprite),
    plainDummy(60, 'flame').sprite,
  ].filter((id): id is string => !!id)

  it('gives every form, enemy, boss and the dummy its own sprite', () => {
    // 8 lines x 11 forms, 8 awakened and 13 cross-line fused forms, 20 adventure enemies, 6 raid and
    // 7 world bosses, the dummy
    expect(all).toHaveLength(8 * 11 + 8 + 13 + 20 + 6 + 7 + 1)
    expect(new Set(all).size).toBe(all.length)
  })

  it('maps the forms in branch order', () => {
    expect(getSpecies('flame_egg').sprite).toBe('egg')
    expect(getSpecies('flame_ultimate').sprite).toBe('sunking')
    expect(getSpecies('tide_ultimate').sprite).toBe('whaleC')
    expect(getSpecies('leaf_adultAlt').sprite).toBe('wolf')
    expect(getSpecies('shadow_perfectPoor').sprite).toBe('mistblob')
    expect(getSpecies('dark_ultimateAlt').sprite).toBe('batemperor')
  })

  it('draws every fused form: awakened ones and the hybrids of two lines', () => {
    expect(getSpecies(fusedSpeciesId(EnumMonsterLine.EARTH, EnumMonsterLine.EARTH)).sprite).toBe(
      'efused'
    )
    expect(getSpecies(fusedSpeciesId(EnumMonsterLine.FLAME, EnumMonsterLine.TIDE)).sprite).toBe(
      'hy_steam'
    )
    const fused = SPECIES.filter(species => species.stage === EnumMonsterStage.FUSED)
    expect(fused.filter(species => species.sprite)).toHaveLength(21)
  })

  it('looks up a stored species id', () => {
    expect(spriteOfSpecies('holy_perfectAlt')).toBe('winglion')
    expect(spriteOfSpecies('gone')).toBeNull()
  })
})
