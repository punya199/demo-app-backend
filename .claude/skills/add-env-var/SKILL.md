---
name: add-env-var
description: Add, rename or remove an environment variable / config value in this NestJS backend. Use whenever code needs a new process.env value, a secret, a feature flag, or a change to src/config/app-config.ts, .env.example, or the Cloud Run env/secrets.
---

# Add an env var (backend)

All config is read **once** into the flat `appConfig` object in `src/config/app-config.ts` and
validated at boot by the Joi schema right below it. If the schema rejects a value, the app does
not start. That covers local dev, the migration Job and the Cloud Run service.

## Checklist

1. **`appConfig`** (`src/config/app-config.ts`): add the key. Convert the type here, once:
   - number: `+(process.env.X || 10)`
   - boolean: `process.env.X === 'true'`
   - list: `process.env.X?.split(',') ?? []`
   - string: `process.env.X ?? ''`
   Group it with related keys and add a one-line comment if the meaning isn't obvious.
2. **`joiObject`** (same file): add the matching rule. The `IJoiObject` type makes `yarn build`
   fail if you skip this. Choose deliberately:
   - `.required()`: boot fails without it. Every environment must be updated **before** the
     release deploys (step 5).
   - `.default(x)` / `.allow('').optional()`: safe to merge first. Prefer this for feature flags
     and tunables.
3. **Read it only through `appConfig.X`**. Never read `process.env` anywhere else.
4. **`.env.example`**: add the key with a safe placeholder (never a real secret) and a comment if
   it needs a format (e.g. `openssl rand -hex 32`). Tell the team in the PR: each of the 3
   developers has their own local `.env` and must add the key too, or their `yarn start:dev` /
   `yarn migration:*` will fail Joi validation.
5. **Production (Cloud Run)**: the deploy job only swaps the image ("env vars, secrets and
   scaling set at setup are kept"). A new key therefore has to be added **by hand** to:
   - the Cloud Run **service**, and
   - the Cloud Run **migration Job**. It boots the same config, so a missing required key fails
     migrations too.

   Secrets go in Secret Manager (see README "Secret Manager"), not plain env. If the key is
   required, write in the PR description: "set `X` on the service + migrate job before merging".
6. **Files instead of env**: `GOOGLE_SHEETS_PRIVATE_KEY` is read from
   `private/secret/google_sheets.key` (a mounted file). Follow that pattern only for multi-line
   secrets, and document the mount path in README.
7. **README.md**: if it's a deploy-time setting, add it to the deployment section's list.

## Removing / renaming

Do it in two steps: first make the code accept both the old and new name (or make the old one
optional), ship, update every environment, then remove the old one. Otherwise another dev's
`.env` or production breaks on the next boot.

## Verify

```bash
yarn build                 # IJoiObject catches a key missing from joiObject
yarn start:dev             # boots = Joi accepted your local .env
```

The frontend has its own runtime config (`window._env_` → `appConfig()`); see the `add-env-var`
skill in `demo-app` if the browser also needs the value.
