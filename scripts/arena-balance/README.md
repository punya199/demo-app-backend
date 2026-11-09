# Arena balance tools

The real-time arena (adventure fights, skills) was balanced by simulation with these scripts. They
run the demo copy of the engine (`engine.js`, the same rules as `src/modules/monster/arena/arena-engine/`,
pinned by `arena-engine.spec.ts`) over hundreds of thousands of fights and write `tuning.json`.

```bash
cd scripts/arena-balance
node balance.js tune2 4        # skills + dodges (mirror and vs-every-element) and per-stage line HP
node balance.js report         # mirror league report
node advtune.js tune           # adventure stage strength to the targets in data.js
node advtune.js report
node bossbest.js               # final boss vs every Ultimate, best loadouts
node gen-ts.js                 # regenerate src/modules/monster/arena/arena-data.ts from data.js + tuning.json
```

Change numbers in `data.js` (skills, statuses, stages), re-tune, then regenerate. Don't hand-edit
`arena-data.ts`: every value there came out of these runs. If you change the engine, change both
`engine.js` and `arena-engine.ts` the same way, and update the pinned fight in the spec on purpose.

**Drift (2026-11-09): don't run `gen-ts.js` any more.** `arena-data.ts` now has hand-made parts that
`data.js` lacks: the skill renames for the pixel art, the world boss's third skill, the raid bosses'
own skill copies, and the 21 Fused-form skills (`fz_*`). Regenerating would drop them. Edit
`arena-data.ts` directly and copy only new `adv:<stage>` k values across (as was done for the skill
tiers). The skill tiers (`SKILL_TIER_PCT` in `arena-rules.ts`) are in both engines (`tierOf` in
`engine.js`); never re-run `balance.js tune2` with them on, because it would tune the tiers away
(it pushes every skill towards a 50% win rate across stages).
