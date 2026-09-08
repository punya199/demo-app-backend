# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is Yarn (Berry, `yarn@4.9.2` via `.yarnrc.yml`) — use `yarn`, not `npm`, except where a script itself shells out to `npm run` (see migrations below).

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
yarn test:e2e               # jest -c ./test/jest-e2e.json — no test/ directory exists yet, this will fail until one is added

yarn migration:generate <name>   # typeorm migration:generate against current entities (diffs live schema)
yarn migration:create <name>     # blank migration
yarn migration:run / :revert / :show   # against src/config/database.config.ts (dev, ts-node)
```

Pre-commit (husky) runs `lint-staged` (eslint --fix + prettier on staged `*.ts/js`) then a full `yarn build`. There is no local test runner in the hook — CI/Jenkins is the enforcement point for tests.

Releases are automated via `semantic-release` (`.releaserc`) on `main`, using Angular/eslint-style commit messages to drive version bumps and CHANGELOG.md generation — commit message conventions matter here.

## Architecture

NestJS 11 + TypeORM (Postgres) + Redis, single deployable service (`src/main.ts` → `AppModule`). Feature modules live under `src/modules/<name>/` each with its own `*.module.ts`, `*.controller.ts`, `*.service.ts`, and a `dto/` folder; entities are centralized in `src/db/entities/` (not colocated with modules) and registered in one place: `src/config/database.config.ts` (`entities` / `subscribers` arrays consumed by both the CLI DataSource and `AppModule`'s `TypeOrmModule.forRoot`).

### Auth & permissions (two independent gates, often combined)

- **Role gate**: `@AuthUser(role?)` (`src/modules/auth/auth.decorator.ts`) attaches `JwtAccessTokenAuthGuard` + `RolesGuard`. Roles are hierarchical (`UserRole.USER < ADMIN < SUPER_ADMIN`, see `roleLevels` in `user.entity.ts`) — a route requiring `ADMIN` also admits `SUPER_ADMIN`. No `@AuthUser()` role arg = any authenticated user.
- **Feature-permission gate**: `@AuthUserPermission({ featureName, action })` attaches `PermissionGuard`, which checks a per-user, per-feature 4-char bitstring (`PermissionsEntity.action`, order: read/create/update/delete — see `permissionActionHelper` in `src/utils/permission-helper.ts`) stored in the `permissions` table, cached 10s at query time.
- **Username gate**: `@AuthUserWithUsername(username|username[], role?)` restricts a route to specific username(s) regardless of role — used for data shared with just a couple of named accounts (e.g. paojiao-ledger). Role is optional add-on gating, not a replacement.
- JWT access/refresh strategies and token issuance live in `src/modules/authentication/` (`AuthenticationModule.register(...)` — dynamic module configured once from `AuthModule` with JWT secret/expiry and Redis connection for refresh-token storage). `src/modules/auth/` is the consumer layer (guards, decorators, login/permission endpoints) built on top of it — don't confuse the two `auth*` module names.
- `@ReqUser()` param decorator pulls the decoded `IAppJwtPayload` off `request.user`.

### Request-scoped user context (CLS)

`nestjs-cls` (`src/config/cls-service-config.ts`) decodes the JWT from the `Authorization` header on every request (independent of the guards above — this happens even on unauthenticated routes if a token is present) and stores `userId` in CLS. `AuditSubscriber` (`src/db/subscribers/audit.subscriber.ts`) reads that CLS value to auto-populate `creatorId`/`updaterId`/`deleterId` on every entity extending `BaseModelEntity` (`src/db/entities/base-model.entity.ts`) on insert/update/soft-remove — this is why those columns are never set manually in services. All entities use soft-delete (`deletedAt`) via `@DeleteDateColumn`; TypeORM `softDelete`/`softRemove` should be used, not hard deletes, to keep this audit trail meaningful.

### Config

All env vars are read once into a single flat `appConfig` object (`src/config/app-config.ts`) and validated with a parallel Joi schema at startup (`ConfigModule.forRoot({ validationSchema })`) — add new env vars in both places (the `appConfig` object and `joiObject`) or the app fails to boot. `GOOGLE_SHEETS_PRIVATE_KEY` is the exception: it's read from a file (`private/secret/google_sheets.key`), not an env var directly.

### paojiao-ledger module

Distinct from the rest of the app: it treats a specific Google Sheet as the primary datastore for ledger entries/withdrawals/wages (via `googleapis`, `src/modules/paojiao-ledger/google-sheets-client.ts` + `ledger-sheet-parser.ts`), with only the category-name list (`LedgerItemEntity`) backed by Postgres. It's gated off entirely when `GOOGLE_SHEETS_*` env vars are unset (`isGoogleSheetsConfigured()` / `assertGoogleSheetsConfigured()` in `paojiao-ledger.service.ts`) — no silent fallback to fake data on failure, by design (see the comment on `getLedger()`). Sheet writes use targeted `values.update` on precomputed row/column ranges, never `values.append`, because several logical tables are packed into the same row-number space at different column offsets; the module keeps extensive inline comments explaining these row/column invariants — read them before touching write logic there.

### File uploads

`src/modules/attachment/` handles uploads via `multer`, storing files in S3-compatible storage through `src/utils/s3-client.ts` (`@aws-sdk/client-s3`, configured with `AWS_ENDPOINT`/`AWS_REGION`/credentials from `appConfig` — points at a non-AWS S3-compatible endpoint in this setup, not necessarily real AWS).

### Logging

`nestjs-pino` (`src/config/pino-config.ts`) is the structured logger wired at the framework level; `GlobalExceptionFilter` (`src/utils/filters/global-exception-filter.ts`) additionally normalizes all uncaught/`HttpException` errors into a consistent `{ statusCode, message, path, timestamp }` JSON body.
