# Arena balance tools

The real-time arena (adventure fights, skills) was balanced by simulation with these scripts. They
run the demo copy of the engine (`engine.js`, the same rules as `src/modules/monster/arena/arena-engine.ts`,
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
