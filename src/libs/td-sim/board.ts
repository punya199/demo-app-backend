import {
  COLS,
  GEAR_MOD_DAMAGE_PCT,
  HEROES,
  LEVEL_OUTPUT_PCT,
  MAX_CRIT_PCT,
  MAX_LEVEL,
  PENALTY_OUTPUT_PCT,
  PENALTY_TILES,
  RESONANCE_CRIT_PCT,
  ROWS,
  SIDE_OUTPUT_PCT,
  SOURCE_TILE,
  STAR_DAMAGE_PCT,
  TILE_COUNT,
} from './config'
import type { Gear } from './sim'

/** Two gears merge only when hero, star, mod and level all match (and are below max level); the sim and the client share this. */
export const canMerge = (a: Gear, b: Gear): boolean =>
  a.hero === b.hero &&
  a.star === b.star &&
  (a.mod ?? 0) === (b.mod ?? 0) &&
  a.level === b.level &&
  a.level < MAX_LEVEL

/** Tiles sharing an edge with `tile` (no diagonals, no wrap). */
export function neighbors(tile: number): number[] {
  const col = tile % COLS
  const out: number[] = []
  if (col > 0) out.push(tile - 1)
  if (col < COLS - 1) out.push(tile + 1)
  if (tile >= COLS) out.push(tile - COLS)
  if (tile < TILE_COUNT - COLS && Math.floor(tile / COLS) < ROWS - 1) out.push(tile + COLS)
  return out
}

/** Tiles of gears connected to the energy source through a chain of edge-adjacent gears. */
export function linkedTiles(gears: readonly Gear[]): Set<number> {
  const occupied = new Set(gears.map((g) => g.tile))
  const linked = new Set<number>()
  if (!occupied.has(SOURCE_TILE)) return linked
  const queue = [SOURCE_TILE]
  linked.add(SOURCE_TILE)
  while (queue.length) {
    for (const n of neighbors(queue.pop()!)) {
      if (occupied.has(n) && !linked.has(n)) {
        linked.add(n)
        queue.push(n)
      }
    }
  }
  return linked
}

/** Number of edge-adjacent gears. */
export function touchingSides(tile: number, gears: readonly Gear[]): number {
  return neighbors(tile).filter((n) => gears.some((g) => g.tile === n)).length
}

/** A gear's damage per shot and crit chance (percent), from its star, mod, level, touching sides, tile and resonance. */
export function outputOf(gear: Gear, gears: readonly Gear[]): { damage: number; critPct: number } {
  const sidesPct = 100 + SIDE_OUTPUT_PCT * touchingSides(gear.tile, gears)
  const tilePct = PENALTY_TILES.includes(gear.tile) ? PENALTY_OUTPUT_PCT : 100
  const raw =
    HEROES[gear.hero].damage *
    LEVEL_OUTPUT_PCT[gear.level - 1] *
    sidesPct *
    tilePct *
    STAR_DAMAGE_PCT[gear.star - 1] *
    GEAR_MOD_DAMAGE_PCT[gear.mod ?? 0]
  const matching = neighbors(gear.tile).filter((n) =>
    gears.some((g) => g.tile === n && g.hero === gear.hero)
  ).length
  return {
    damage: Math.max(1, Math.round(raw / 10_000_000_000)),
    critPct: Math.min(MAX_CRIT_PCT, matching * RESONANCE_CRIT_PCT),
  }
}
