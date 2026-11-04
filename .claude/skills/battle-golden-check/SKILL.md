---
name: battle-golden-check
description: Guard against breaking stored battle replays when changing combat code. Use before and after any change to battle-engine.ts, battle-stats.ts, team-battle.ts, elements, set effects, damage/crit/defense formulas, species stats, adventure/raid/PvP NPC fighters, or when battle-engine.golden.spec.ts fails or someone wants to run UPDATE_GOLDEN=1.
---

# Battle golden check

PvP history (`PvpService.getReplay`) does **not** store events. It re-runs
`simulateBattle(attacker, defender, row.seed)` from the stored seed and stored fighter snapshots.
`battle-engine.golden.spec.ts` pins hundreds of recorded fights bit-for-bit
(`battle-engine.golden.json`). If it fails, old fights now replay differently.

## The rule for RNG order

`createRng(seed)` returns one stream. Every `rng()` call consumes the next number, so **adding,
removing or reordering a call shifts every roll after it**: crits, variance, speed ties, all of
it.

- A new random effect must only call `rng()` when the fighter has that effect. Put the guard
  first so it short-circuits:
  ```ts
  if (defender.effects?.evasion && rng() < defender.effects.evasion) { ... }   // ✅
  if (rng() < (defender.effects?.evasion ?? 0)) { ... }                         // ❌ always rolls
  ```
- Never move existing `rng()` calls (crit roll → variance → speed-tie order) for fighters
  without `effects`.
- Effects that don't roll (shield, regen, thorns, lifesteal) must also be a no-op when the field
  is absent: `?? 0` / `?.` skip, and no change in rounding for the plain path.

## Workflow

1. **Before changing anything**, run the suite so you know it's green:
   ```bash
   yarn test --testPathPattern='battle-engine|battle-effects|battle-keystone|team-battle|elements|battle-stats'
   ```
2. Make the change.
3. Run the same command again.
   - **Golden passes** → done. Old fights are untouched.
   - **Golden fails** → decide which case you're in:

| Case | What to do |
|---|---|
| You added an effect / new mode and didn't mean to change old fights | It's a bug. Find the unguarded `rng()` or the changed rounding and fix the code. **Do not** regenerate. |
| A deliberate balance change to the shared formula (e.g. DEF % reduction, commit `56f531e`) | Regenerating is allowed. Follow the next section. |

## Regenerating on purpose

Only for an intentional rule change, agreed with the team, since 3 people develop in parallel and
another branch may also touch combat:

```bash
UPDATE_GOLDEN=1 yarn test --testPathPattern=battle-engine.golden
yarn test --testPathPattern=battle-engine.golden      # must pass again
```

Then:
- Commit `battle-engine.golden.json` **in the same commit** as the rule change, and say so in
  the message (e.g. "Golden replays regenerated on purpose").
- In the PR, warn that old PvP replays will now re-simulate with the new rules, so a replay's
  winner can differ from the rating change that was recorded. Ask a teammate to confirm before
  merging.
- If another open branch also regenerated the golden file, **don't merge the JSON by hand**.
  Rebase onto `main` and regenerate again after both rule changes are in.
- New tunables (like `DEFENSE_K`) also go into `wiki.ts` (see the `new-monster-endpoint` skill).

## Adding new pinned cases

The golden set only covers what existed when it was recorded (`RECORDED_AREAS`, the NPC list,
`FORMS`). Don't add new areas or bosses to `buildCases()` just to pin them. That changes the key
set and forces a regeneration. Test new content in its own `*.spec.ts` instead.
