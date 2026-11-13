// Tower Defense energy: cap 60, +1 every 6 minutes, a stage costs 6. Regeneration is lazy: it is
// computed from the stored timestamp on every read, never by a job.
export const ENERGY_CAP = 60
export const ENERGY_REGEN_MS = 6 * 60 * 1000
export const STAGE_ENERGY_COST = 6

export interface IEnergyState {
  energy: number
  updatedAt: Date
}

// Pure. The timestamp only advances by whole intervals so the partial remainder carries over;
// at the cap it restarts at `now`, so time spent full is never banked.
export const regenerateEnergy = (energy: number, updatedAt: Date, now: Date): IEnergyState => {
  if (energy >= ENERGY_CAP) {
    return { energy: ENERGY_CAP, updatedAt: now }
  }
  const gained = Math.floor((now.getTime() - updatedAt.getTime()) / ENERGY_REGEN_MS)
  if (gained <= 0) {
    return { energy, updatedAt }
  }
  if (energy + gained >= ENERGY_CAP) {
    return { energy: ENERGY_CAP, updatedAt: now }
  }
  return { energy: energy + gained, updatedAt: new Date(updatedAt.getTime() + gained * ENERGY_REGEN_MS) }
}
