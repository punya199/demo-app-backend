---
name: new-monster-endpoint
description: Add or change an endpoint, action, or tunable in the monster (Tamagotchi / V-Pet) game module under src/modules/monster/. Use whenever work touches monster.service, adventure, shop, inventory, equipment, expedition, pvp, raid, world-boss, quest, passive, costume or friend/support code, adds a wallet transaction reason, a monster rule constant, or a migration for a monster table.
---

# New monster endpoint

The monster game is server-authoritative. Read the "monster module" section of `CLAUDE.md`
first; this skill is the step-by-step checklist on top of it. Copy the shape of an existing
feature rather than inventing a new one. `expedition.controller.ts` + `expedition.service.ts`
are the smallest complete example.

## 0. Before you start (3 developers work in parallel)

Three people, each with their own Claude, change this module at the same time. Most merge
conflicts happen in a few shared files, so:

- Start from a fresh `origin/main` (`git fetch origin && git rebase origin/main`) and rebase again
  before you push.
- In shared lists, **append at the end** and never reorder or reformat existing lines:
  `monster.module.ts` (controllers/providers), `EnumWalletTransactionReason`, `wiki.ts`'s
  `buildWiki()`, `monster-rules.ts`, and `species-data.ts`.
- Migration timestamps: use the real current time (`Date.now()`), **not** "the last one + 100000000".
  Two people picking the same next round number creates a clash that only shows up after merge.
- Don't regenerate `battle-engine.golden.json` to make a test pass. Another dev's PvP history
  depends on it (see step 6).

## 1. Rules go in the engine as pure functions

- New numbers go in `monster-rules.ts` (or the feature's `*-data.ts`, e.g. `idle-data.ts`,
  `raid-data.ts`). Never inline them in a service.
- Game logic is a pure function over `IMonsterState` in `monster-engine.ts` (or a sibling pure
  file). It takes `now: Date` as an argument instead of calling `new Date()` itself, and returns
  `{ state, events }`.
- Refuse an action by throwing `MonsterRuleError`. The service wraps the call in
  `withRuleErrors(...)` to turn it into a 400.
- Stamina only gates adventure fights. Other modes must not read or spend it.

## 2. Service: lock → tick → act → save, in one transaction

```ts
async doThing(userId: string, input: X, monsterId?: string) {
  const now = new Date()
  return this.dataSource.transaction(async etm => {
    // 1. lock + tick (also stamps last_seen_at)
    const monster = await this.monsterService.lockAndTickLatest(userId, now, etm)
    if (!monster) throw new NotFoundException('You do not have a monster yet')
    // 2. rule check FIRST - a refused action must never charge
    const result = withRuleErrors(() => doThingRule(monster, input, now))
    // 3. money only through WalletService.change, inside this same etm
    const wallet = await this.walletService.change(
      userId, EnumWalletCurrency.COIN, -PRICE, EnumWalletTransactionReason.MY_REASON, monster.id, etm
    )
    // 4. save state, then events (events drive quest progress + dex)
    const saved = await this.monsterService.saveState(monster, result.state, etm)
    await this.monsterService.saveEvents(saved, result.events, etm)
    return { monster: toMonsterView(saved), wallet }
  })
}
```

Rules that apply every time:

- Never query or save `MonsterEntity` directly from another service. Use `MonsterService`'s
  `lockAndTickLatest` / `lockAndTickLiving` / `saveState` / `saveEvents`.
- If the request names a pet, take an optional `monsterId` and pick it from
  `lockAndTickLiving(...)`. Otherwise use the selected monster.
- Coins/gems/raid tokens only move through `WalletService.change(...)`. When two users' wallets
  move together, call `walletService.lockWallets([a, b], etm)` first. It locks them in user-id order.
- A new ledger reason means a new value appended to `EnumWalletTransactionReason`
  (`src/db/entities/wallet-transaction.entity.ts`). The column is `varchar`, so no migration is
  needed for that.
- Battles: take gear from `loadEquipmentBonus(userId, monster.id, etm)` (and passives from
  `loadPassiveBonus`) inside the same transaction, then simulate on the server with a seeded RNG.
  Never accept a result from the client.
- Consumables that protect a roll (scrolls, stones) are spent **before** rolling.
- Rewards are computed from server-counted state (minutes, seeds, ids), never from a client
  number. For a retry-safe roll, derive it from ids (see `claimRolls` in world-boss).

## 3. Controller + DTO

- Add the route to the feature's controller (or a new `*.controller.ts`), with `@AuthUser()` and
  `@ReqUser() user: IAppJwtPayload`. Pass `user['user-id']` to the service.
- Validate the body with a DTO in `dto/` (`class-validator` decorators, `...BodyDto` naming).
  Optional `monsterId` is `@IsOptional() @IsUUID()`.
- A new controller or service must be **appended** to `monster.module.ts`.

## 4. Privacy (other players)

A response must never carry another player's `user_id`, username or email. Show players by
`player_profiles.display_name`, and address them by a row id (defense row, friendship, support
unit). `social.int-spec.ts` scans for leaks, so extend it if your endpoint returns other players.

## 5. Keep the in-game guide in sync

Every new tunable a player can see goes into `buildWiki()` in `wiki.ts` (append a key or extend
the feature's section). Then tell the frontend dev: `IWikiData` in
`demo-app/src/pages/project/tamagotchi/tamagotchi-interface.ts` and `WikiPanel.tsx` must
change to match. Mention it in the PR description, because the other repo has its own Claude.

## 6. Tests

- Pure rules: a co-located `*.spec.ts` (e.g. `monster-engine.spec.ts`, `idle-data.spec.ts`).
  Pass a fixed `now`, and never sleep.
- Anything involving a transaction, wallet or locking: a `*.int-spec.ts` using
  `int-test-helpers.ts` (`startTestDatabase`, `createUser`, `createUserWithMonster`, `buildCore`).
  These only run against a local DB with `test`/`check` in its name.
- If `battle-engine.golden.spec.ts` fails, you changed the RNG order for fighters without
  effects. Fix the code, not the golden file.

## 7. Migrations (only if an entity changed)

- Entity lives in `src/db/entities/` and is registered in `src/config/database.config.ts`.
- Write the file in `src/db/migrations/<Date.now()>-kebab-name.ts`, class `PascalName<timestamp>`,
  with a working `down()`. Copy the style of `1792100000000-add-equipment-pending-refine.ts`.
  `yarn migration:create` writes to `src/migrations/`, so move the file if you use it.
- New columns on existing rows need a `DEFAULT` or must be nullable. Tables use soft delete, and
  `creatorId`/`updaterId` are filled by `AuditSubscriber`, so don't set them yourself.

## 8. Before committing

```bash
yarn lint:ci
yarn test --testPathPattern=<your-file>   # then the full `yarn test`
yarn build                                 # pre-commit runs this too
yarn test:integration                      # if you touched a transaction (needs local test DB)
```

Commit as `New:` / `Update:` / `Fix:` (see `CLAUDE.md`). If the frontend needs a matching change,
open the PR in `demo-app` too and link the two PRs to each other.
