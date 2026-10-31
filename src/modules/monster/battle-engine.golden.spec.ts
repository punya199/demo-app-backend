import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { EnumMonsterLine, EnumMonsterStage } from '../../db/entities/monster.entity'
import { simulateBattle } from './battle-engine'
import { IFighter, toFighter } from './battle-stats'
import { createEgg } from './monster-engine'
import { PVP_NPCS } from './pvp-data'
import { ADVENTURE_AREAS } from './adventure-data'

// Replays of past fights (PvP history) are re-simulated from a stored seed and the two stored
// fighters, so the battle engine must keep producing the exact same events for a fighter that has
// no set effects. This pins results recorded from the engine before effects existed: if it fails,
// an engine change altered old fights. Regenerate on purpose with UPDATE_GOLDEN=1 (never to make a
// failure go away).
const GOLDEN_FILE = join(__dirname, 'battle-engine.golden.json')
const NOW = new Date('2026-01-01T03:00:00Z')
const LINES = [EnumMonsterLine.FLAME, EnumMonsterLine.TIDE, EnumMonsterLine.LEAF]
const FORMS: [EnumMonsterStage, string][] = [
  [EnumMonsterStage.BABY_2, 'baby2'],
  [EnumMonsterStage.ADULT, 'adultGood'],
  [EnumMonsterStage.PERFECT, 'perfectGood'],
  [EnumMonsterStage.ULTIMATE, 'ultimate'],
]

const monsterFighter = (
  line: EnumMonsterLine,
  stage: EnumMonsterStage,
  suffix: string,
  over = {}
) =>
  toFighter({
    ...createEgg(line, NOW),
    speciesId: `${line}_${suffix}`,
    stage,
    fullness: 4,
    strength: 3,
    weight: 40,
    ...over,
  })

const buildCases = () => {
  const cases: { key: string; player: IFighter; enemy: IFighter; seed: number }[] = []
  const seeds = [1, 2, 3, 7, 42, 99, 12345, 2 ** 30]
  for (const [stage, suffix] of FORMS) {
    for (const line of LINES) {
      for (const enemyLine of LINES) {
        const player = monsterFighter(line, stage, suffix)
        const enemy = monsterFighter(enemyLine, stage, suffix, { strength: 1, stamina: 0 })
        seeds.forEach(seed =>
          cases.push({ key: `${stage}:${line}-${enemyLine}:${seed}`, player, enemy, seed })
        )
      }
    }
  }
  for (const npc of PVP_NPCS) {
    const player = monsterFighter(EnumMonsterLine.TIDE, npc.stage, SUFFIX[npc.stage])
    seeds
      .slice(0, 4)
      .forEach(seed => cases.push({ key: `${npc.id}:${seed}`, player, enemy: npc.fighter, seed }))
  }
  for (const area of ADVENTURE_AREAS) {
    const player = monsterFighter(EnumMonsterLine.FLAME, EnumMonsterStage.PERFECT, 'perfectGood')
    for (const stage of area.stages) {
      seeds
        .slice(0, 3)
        .forEach(seed =>
          cases.push({ key: `${stage.id}:${seed}`, player, enemy: stage.enemy, seed })
        )
    }
  }
  return cases
}

const SUFFIX: Record<string, string> = {
  [EnumMonsterStage.ADULT]: 'adultGood',
  [EnumMonsterStage.PERFECT]: 'perfectGood',
  [EnumMonsterStage.ULTIMATE]: 'ultimate',
}

// JSON round trip: drops `undefined` fields the way the stored snapshot does.
const run = (testCase: ReturnType<typeof buildCases>[number]): unknown =>
  JSON.parse(JSON.stringify(simulateBattle(testCase.player, testCase.enemy, testCase.seed)))

describe('battle engine golden replays', () => {
  if (process.env.UPDATE_GOLDEN === '1') {
    it('writes the golden file', () => {
      const golden = Object.fromEntries(buildCases().map(testCase => [testCase.key, run(testCase)]))
      writeFileSync(GOLDEN_FILE, JSON.stringify(golden))
    })
    return
  }

  const golden = JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')) as Record<string, unknown>

  it('has a case for every stored result', () => {
    expect(
      buildCases()
        .map(testCase => testCase.key)
        .sort()
    ).toEqual(Object.keys(golden).sort())
  })

  it('replays every recorded fight exactly', () => {
    for (const testCase of buildCases()) {
      expect({ key: testCase.key, result: run(testCase) }).toEqual({
        key: testCase.key,
        result: golden[testCase.key],
      })
    }
  })
})
