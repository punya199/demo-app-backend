# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is Yarn (Berry, `yarn@4.9.2` via `.yarnrc.yml`) — use `yarn`, not `npm`, except where a script itself shells out to `npm run` (see migrations below).

Copy `.env.example` to `.env` before running any dev/migration command — startup fails the Joi validation in `app-config.ts` without it.

```bash
yarn start:dev          # nest start --watch (local dev)
yarn build               # nest build
yarn lint                 # eslint on src/apps/libs/test
yarn lint:ci               # eslint --quiet (used in CI/pre-commit)
yarn format                # prettier --write src/**/*.ts test/**/*.ts

yarn test                  # jest, run from repo root; rootDir is `src`, tests are `*.spec.ts` colocated next to the code
yarn test --testPathPattern=password-helper   # run a single spec file
yarn test:watch
yarn test:cov
yarn test:integration       # KvStore contract suite (*.int-spec.ts) against the docker-compose Postgres; plain `yarn test` stays DB-free
yarn test:e2e               # jest -c ./test/jest-e2e.json — no test/ directory exists yet, this will fail until one is added

yarn migration:generate <name>   # typeorm migration:generate against current entities (diffs live schema)
yarn migration:create <name>     # blank migration
yarn migration:run / :revert / :show   # against src/config/database.config.ts (dev, ts-node)
```

Pre-commit (husky) runs `lint-staged` (eslint --fix + prettier on staged `*.ts/js`) then a full `yarn build`. There is no local test runner in the hook — CI/Jenkins is the enforcement point for tests.

Releases are automated via `semantic-release` (`.releaserc`) on `main`, using the ESLint commit-message convention to drive version bumps and CHANGELOG.md generation. Commit summary format is `Tag: description` (e.g. `Fix: reject votes on a closed poll`) — a commit whose summary doesn't start with one of these tags is invisible to the release tooling (no version bump, no changelog entry):

- `Fix` — a bug fix
- `Update` — a backwards-compatible enhancement
- `New` — a new feature
- `Breaking` — a backwards-incompatible change
- `Docs` — documentation only
- `Build` — build process only
- `Upgrade` — a dependency upgrade
- `Chore` — refactoring, tests, anything non-user-facing

**Always tag commits `Fix:`, `Update:`, or `New:`** — never `Chore:`/`Docs:`/`Build:`/`Upgrade:`, even for trivial changes. `.github/workflows/docker-build.yml`'s `build-and-push` job only runs when semantic-release's `Release` job actually publishes a new version; the other tags don't bump the version, so the Docker build/publish step gets silently skipped.

**Before pushing `main`, run `git fetch origin && git rebase origin/main`** so the push is a fast-forward. semantic-release pushes its own `chore(release)` commit (version bump + CHANGELOG) to `main` after every release, so a local `main` is usually one commit behind origin. Never merge origin into local `main` (it creates a merge commit) and never force-push (it deletes the release commit).

## Architecture

NestJS 11 + TypeORM (Postgres), single deployable service (`src/main.ts` → `AppModule`). Feature modules live under `src/modules/<name>/` each with its own `*.module.ts`, `*.controller.ts`, `*.service.ts`, and a `dto/` folder; entities are centralized in `src/db/entities/` (not colocated with modules) and registered in one place: `src/config/database.config.ts` (`entities` / `subscribers` arrays consumed by both the CLI DataSource and `AppModule`'s `TypeOrmModule.forRoot`).

### HTTP pipeline (`src/main.ts`)

Global, app-wide, set once at bootstrap: `ValidationPipe` (DTOs are validated/transformed via `class-validator`/`class-transformer` on every route), `ClassSerializerInterceptor` (response shaping honors `@Exclude`/`@Expose` on entities/DTOs), and `GlobalExceptionFilter` (see Logging below). CORS origin comes from `appConfig.ORIGIN_ALLOWED` (comma-separated list, or `*`); `credentials: true` is always on, so `*` and cookie-based auth don't mix in practice. Body size limit is 50mb (`json`/`urlencoded`).

### Auth & permissions (two independent gates, often combined)

- **Role gate**: `@AuthUser(role?)` (`src/modules/auth/auth.decorator.ts`) attaches `JwtAccessTokenAuthGuard` + `RolesGuard`. Roles are hierarchical (`UserRole.USER < ADMIN < SUPER_ADMIN`, see `roleLevels` in `user.entity.ts`) — a route requiring `ADMIN` also admits `SUPER_ADMIN`. No `@AuthUser()` role arg = any authenticated user.
- **Feature-permission gate**: `@AuthUserPermission({ featureName, action })` attaches `PermissionGuard`, which checks a per-user, per-feature 4-char bitstring (`PermissionsEntity.action`, order: read/create/update/delete — see `permissionActionHelper` in `src/utils/permission-helper.ts`) stored in the `permissions` table, cached 10s at query time.
- **Username gate**: `@AuthUserWithUsername(username|username[], role?)` restricts a route to specific username(s) regardless of role — used for data shared with just a couple of named accounts (e.g. paojiao-ledger). Role is optional add-on gating, not a replacement.
- JWT access/refresh strategies and token issuance live in `src/modules/authentication/` (`AuthenticationModule.register(...)` — dynamic module configured once from `AuthModule` with JWT secret/expiry). Login state (token allow-list, remembered devices, brute-force counters) lives in the Postgres `kv_store` table behind the global `KvStore` service (`src/modules/kv-store/`); reads ignore expired rows and `AuthService.login` deletes them lazily (no cron). `src/modules/auth/` is the consumer layer (guards, decorators, login/permission endpoints) built on top of it — don't confuse the two `auth*` module names.
- `@ReqUser()` param decorator pulls the decoded `IAppJwtPayload` off `request.user`.

### Request-scoped user context (CLS)

`nestjs-cls` (`src/config/cls-service-config.ts`) decodes the JWT from the `Authorization` header on every request (independent of the guards above — this happens even on unauthenticated routes if a token is present) and stores `userId` in CLS. `AuditSubscriber` (`src/db/subscribers/audit.subscriber.ts`) reads that CLS value to auto-populate `creatorId`/`updaterId`/`deleterId` on every entity extending `BaseModelEntity` (`src/db/entities/base-model.entity.ts`) on insert/update/soft-remove — this is why those columns are never set manually in services. All entities use soft-delete (`deletedAt`) via `@DeleteDateColumn`; TypeORM `softDelete`/`softRemove` should be used, not hard deletes, to keep this audit trail meaningful.

### Config

All env vars are read once into a single flat `appConfig` object (`src/config/app-config.ts`) and validated with a parallel Joi schema at startup (`ConfigModule.forRoot({ validationSchema })`) — add new env vars in both places (the `appConfig` object and `joiObject`) or the app fails to boot. `GOOGLE_SHEETS_PRIVATE_KEY` is the exception: it's read from a file (`private/secret/google_sheets.key`), not an env var directly.

### monster module

Server-authoritative V-Pet game (frontend: `demo-app` `src/pages/project/tamagotchi/`, design docs in `demo-app/docs/tamagotchi/`). All rules live in `monster-engine.ts` as pure functions over `IMonsterState`, with every tunable number in `monster-rules.ts` and species/evolution trees as data in `species-data.ts`. Time is not driven by a cron: `tick(state, now)` replays each whole minute since `lastTickAt`, and `MonsterService` runs it on every read and action inside a transaction that row-locks the owner's latest monster (`pessimistic_write`) — keep that lock → tick → act → save order for any new endpoint. The `*_minutes` columns are the engine's per-minute counters, not display data (`stage_minutes` is stage *progress*: an online minute adds `ONLINE_EVOLUTION_MULTIPLIER`, so evolution checks for crossing the duration, never equality). `lockAndTickLatest` also stamps `last_seen_at` on every request; `tick` treats minutes within `ONLINE_GRACE_MINUTES` of the previous stamp as online (faster evolution, slower stamina drain). There is no sleep system. One living monster per owner is enforced by a partial unique index on `owner_id`. `GET /monster/wiki` (`wiki.ts`) publishes the rule constants for the in-game guide — add new tunables there too so the guide never drifts.

Battles (`battle-engine.ts`) are deterministic from a seeded RNG: the server simulates, persists the seed in the `battle` log, and returns the event list for the client to replay — never trust a client-reported result. `AdventureService` and `ShopService` reuse `MonsterService.lockAndTickLatest`/`saveState`/`saveEvents` in the same transaction rather than talking to the monster table directly. Coins and gems only move through `WalletService.change` (`src/modules/wallet/`), called inside the caller's transaction: it row-locks the wallet, rejects a negative balance, and writes a `wallet_transactions` ledger row. When an action both validates game rules and spends coins, run the rule check first so a refused action never charges. `ShopService.buy` only fills the per-user inventory (`InventoryService`); items are applied by `POST /inventory/use`. Daily-quest progress is derived from monster events inside `saveEvents` (`quest-data.ts`), expeditions run inside `step()` (`monster-engine.ts`), and auto-battle is `/adventure/battle` with `auto: true` (cooldown + per-day coin cap, `idle-data.ts`). Equipment is per user (`equipment_items`, rules in `equipment-data.ts`; enhancing is the pure `enhance-engine.ts` run by `EnhanceService` inside a row-locked transaction). `toFighter` takes the worn gear's bonus from `loadEquipmentBonus` — battles and expeditions load it in the same transaction as the monster lock. Spend protect scrolls/stones *before* rolling, never after, or a failed roll could be rolled back for free. Arena PvP (`pvp.service.ts`) fights the challenger's live stats against a stored defense snapshot, never touches the monster's `wins`/`losses`, and locks both players' season rating rows in `user_id` order; seasons are YYYY-MM Thai months with no rollover job, and the API must never return another player's `user_id` or username (opponents are addressed by defense-row id and shown by their chosen `display_name`). Boss sets (`SET_DEFINITIONS`) carry battle effects (burn/shield/regen/double strike) that `simulateBattle` applies only to fighters that have `effects`; `battle-engine.golden.spec.ts` pins old fights bit-for-bit because PvP history replays from stored seed + fighters, so never change the RNG order for fighters without effects (regenerate the golden file only on purpose). Boss Raid (`raid.service.ts`) runs with `ignoreElements` so every line can beat every boss; raid tokens are the third wallet currency. The World Boss (`world-boss.service.ts`) is one shared HP pool per Thai ISO week (row created lazily by the first request, no job): an attack locks the monster row, then the boss row, and fights `simulateTeamBattle` (`team-battle.ts`, reusable for several fighters on one side) with the boss's HP set to what the whole server has left, so the damage recorded is exactly the HP subtracted. Week rewards are claimed once; the set-piece roll is derived from ids (`claimRolls`) so a retry can't re-roll. Players are shown to each other only by `player_profiles.display_name` (default tag from a hash of the id), added as friends only by a friend code they hand out, and friends/rentals are addressed by friendship or support-unit row ids: no response may carry another player's `user_id`, username or email (the social int-spec scans for this). Friendships are one row per pair with the smaller id first; renting a friend's support unit in the World Boss locks both wallets in user-id order (`WalletService.lockWallets`) before moving coins, and the renter pays only what the owner can still earn under the daily cap. `*.int-spec.ts` suites run on a real throwaway Postgres (`yarn test:integration`) and refuse any database that is not local with `test`/`check` in its name.

### paojiao-ledger module

Distinct from the rest of the app: it treats a specific Google Sheet as the primary datastore for ledger entries/withdrawals/wages (via `googleapis`, `src/modules/paojiao-ledger/google-sheets-client.ts` + `ledger-sheet-parser.ts`), with only the category-name list (`LedgerItemEntity`) backed by Postgres. It's gated off entirely when `GOOGLE_SHEETS_*` env vars are unset (`isGoogleSheetsConfigured()` / `assertGoogleSheetsConfigured()` in `paojiao-ledger.service.ts`) — no silent fallback to fake data on failure, by design (see the comment on `getLedger()`). Sheet writes use targeted `values.update` on precomputed row/column ranges, never `values.append`, because several logical tables are packed into the same row-number space at different column offsets; the module keeps extensive inline comments explaining these row/column invariants — read them before touching write logic there.

### File uploads

`src/modules/attachment/` handles uploads via `multer`, storing files in S3-compatible storage through `src/utils/s3-client.ts` (`@aws-sdk/client-s3`, configured with `AWS_ENDPOINT`/`AWS_REGION`/credentials from `appConfig` — points at a non-AWS S3-compatible endpoint in this setup, not necessarily real AWS).

### Logging

`nestjs-pino` (`src/config/pino-config.ts`) is the structured logger wired at the framework level; `GlobalExceptionFilter` (`src/utils/filters/global-exception-filter.ts`) additionally normalizes all uncaught/`HttpException` errors into a consistent `{ statusCode, message, path, timestamp }` JSON body.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (via `gh` CLI). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
