# Serverless Migration (Phase 1: Yaya + Netflix-to-LINE)

## Problem Statement

Yaya (frontend + backend) and the Netflix-to-LINE notifier run on a Kubernetes cluster on a fixed-price Contabo VPS, managed by Argo CD. For an app with 2–3 users that is mostly idle, this means paying a fixed monthly fee for capacity that sits unused, and running a lot of infrastructure (shared Postgres, Redis, n8n with its own Postgres and Redis, ingress, cert-manager, Argo) just to keep a few small services alive. The owner wants to stop paying a fixed cost and pay only for actual usage, ideally $0 and never more than $5/month, and eventually cancel the VPS.

Two parts of the current setup stop the services from simply shutting down when idle:

- The backend keeps login state (issued JWT allow-list, remembered devices, 2FA/password brute-force counters) in Redis, a separate always-on service.
- The Netflix-to-LINE automation is an n8n workflow that **polls an Outlook mailbox every minute**, so it can never sleep.

## Solution

Move Yaya and the Netflix notifier to scale-to-zero, pay-per-use platforms in Singapore, at roughly $0/month:

- **Frontend** → Cloudflare Pages, still served at the same Yaya domain.
- **Backend** → Google Cloud Run (Singapore), min instances 0. It is reached through the same `/api` path on the frontend domain, via a Cloudflare Pages Function that forwards requests, so cookies stay same-origin.
- **Database** → Neon free Postgres (Singapore). Existing data is migrated with dump/restore.
- **Redis** → removed. Login state moves into a Postgres key-value table.
- **Uploads** → unchanged. They already live in Cloudflare R2.
- **Netflix-to-LINE** → event-driven instead of polling:
  - An Outlook rule forwards Netflix emails to an address on a mail subdomain.
  - Cloudflare Email Routing hands each email to a Cloudflare Email Worker.
  - The Worker parses it and pushes the message to the LINE group.
  - n8n is retired.
- **Deploys** → the existing GitHub Actions release workflows deploy directly. This replaces Argo CD Image Updater.

From the users' point of view nothing changes, except that everyone logs in once more after cutover. Netflix codes reach LINE within seconds instead of up to a minute later.

## User Stories

1. As a Yaya user, I want the app to keep working at the same URL after the migration, so that I don't need to learn a new address.
2. As a Yaya user, I want my existing data (polls, votes, ledger items, accounts) to still be there after the migration, so that nothing is lost.
3. As a Yaya user, I want to log in with my existing username and password after the migration, so that my account carries over.
4. As a Yaya user, I accept having to log in once after cutover, so that the migration can drop the old session store safely.
5. As a Yaya user, I want my login to survive the backend sleeping and waking, so that I am not logged out just because nobody used the app for a while.
6. As a Yaya user, I want logout to invalidate my tokens on the server, so that a stolen token stops working after I log out.
7. As a Yaya user, I want token refresh to keep working, so that I stay logged in during normal use.
8. As a Yaya user with 2FA, I want "remember this device" to keep skipping 2FA for 30 days, so that I am not asked for a code on every login.
9. As a Yaya user with 2FA, I want disabling 2FA (or the matching security action) to revoke all my remembered devices, so that old devices can't bypass 2FA.
10. As a Yaya user with 2FA, I want a backup code to be usable only once, even if I submit it twice at the same moment, so that backup codes stay single-use.
11. As a Yaya user, I want 2FA verification to lock for 60 seconds after 5 wrong codes, so that my code can't be brute-forced.
12. As a Yaya user, I want my account to be blocked after 5 wrong passwords within 5 minutes, so that my password can't be brute-forced.
13. As a Yaya user, I want brute-force counters to keep working when the backend has slept and woken, so that an attacker can't reset them by waiting for a cold start.
14. As a Yaya user, I accept a short delay (a few seconds) on the first request after the app has been idle, so that the app can cost nothing while unused.
15. As a Yaya user, I want file uploads and card images to keep working, so that attachments are unaffected.
16. As a paojiao-ledger user, I want the Google Sheets ledger to keep reading and writing correctly, so that ledger data stays in sync.
17. As a member of the LINE group, I want a message mentioning everyone when Netflix sends a temporary access code email, so that whoever requested it can act quickly.
18. As a member of the LINE group, I want a message when Netflix sends an "update your household" email, so that we can confirm the primary location in time.
19. As a member of the LINE group, I want the message to include who requested it and the verify link, so that the right person can click it directly.
20. As a member of the LINE group, I want to receive these messages within seconds of the email arriving, so that time-limited codes don't expire.
21. As a member of the LINE group, I want unrelated emails (anything not from Netflix, or with other subjects) to send nothing, so that the group isn't spammed.
22. As the owner, I want the monthly cost to be about $0 and never above $5, so that I stop paying for idle capacity.
23. As the owner, I want a budget alert on the cloud account, so that I learn immediately if anything starts costing money.
24. As the owner, I want pushing a release to `main` to build and deploy the backend automatically, so that deploys work the way they did with Argo Image Updater.
25. As the owner, I want pushing a release to `main` to build and deploy the frontend automatically, so that frontend deploys are hands-off too.
26. As the owner, I want database migrations to run automatically before the new backend version takes traffic, so that schema and code never drift.
27. As the owner, I want CI to authenticate to the cloud without long-lived JSON keys stored in GitHub, so that a leaked repository secret can't take over the cloud project.
28. As the owner, I want the Google Sheets private key, database credentials, JWT secrets, R2 credentials and LINE token stored in managed secret stores, so that no secret is baked into an image or committed to git.
29. As the owner, I want the existing root-domain email forwarding to keep working, so that enabling Email Routing for the Netflix notifier doesn't break other mail.
30. As the owner, I want to keep a database dump and leave the old deployment untouched until the new one is verified, so that I can roll back.
31. As the owner, I want the old Yaya, n8n and Redis deployments removed from the Argo repository after cutover, so that the cluster stops running unused services.
32. As the owner, I want a short post-deploy smoke checklist, so that I can confirm the migration worked without guessing.
33. As a developer, I want `yarn test` to stay fast and need no database, so that the normal test loop is unchanged.
34. As a developer, I want a separate integration test command that checks the key-value store against a real Postgres, so that expiry and concurrency behaviour are verified for real.
35. As a developer, I want local development via docker-compose to keep working without Redis, so that the local setup gets simpler, not broken.

## Implementation Decisions

### Platforms (all free tier, Singapore where offered)

| Concern | Choice |
|---|---|
| Frontend hosting | Cloudflare Pages (DNS for the domain is already on Cloudflare) |
| `/api` routing | Cloudflare Pages Function that forwards `/api/*` to the Cloud Run service URL, keeping the method, body, query string and cookies, and passing `Set-Cookie` back |
| Backend runtime | Google Cloud Run, `asia-southeast1`, min instances 0, request-based billing, amd64 image |
| Container registry | Google Artifact Registry. The image is still also pushed to Docker Hub |
| Database | Neon free plan, Singapore region, one project for Yaya |
| Session / security state | Postgres key-value table (replaces Redis) |
| Object storage | Cloudflare R2, unchanged |
| Secrets | Google Secret Manager for the backend. Cloudflare Worker secrets for the Netflix notifier |
| Mail-triggered automation | Cloudflare Email Routing on a **subdomain** that feeds a Cloudflare Email Worker |
| CI/CD | Existing GitHub Actions release workflows, extended. Workload Identity Federation for GCP auth |
| Cost guard | GCP budget alert at $1 |

Options considered and rejected:

- **Koyeb free:** 1 instance and 512 MB only; Postgres limited to 5 h of active time.
- **Render free:** Postgres expires after 30 days.
- **Railway:** $5 minimum; private images need the Pro plan.
- **Fly.io:** about $2/month, kept as the paid fallback.
- **Azure Container Apps:** the close second option.
- **AWS Lambda:** the 6-month Free plan forces an upgrade.
- **Oracle Always Free:** it is a VM you have to manage, and it can be reclaimed when idle.

### Backend: replace Redis with a key-value store

- Add a new **`KvStore`** module that exposes one injectable service. It replaces the Redis connection everywhere. Its interface:
  - `get(key)` returns the value, or nothing if the key is missing or expired.
  - `set(key, value, ttl)` upserts the value and resets its expiry.
  - `setIfAbsent(key, value, ttl)` returns whether this call claimed the key. A key that exists but is expired counts as absent, so it can be claimed.
  - `del(...keys)`.
  - `incrementWithTtl(key, ttl)` atomically increments a counter and returns the new count. The expiry is set when the key is first created.
  - `deleteByPrefix(prefix)` replaces the Redis set that tracked remembered-device tokens per user.
- Schema: one new table, created by a normal TypeORM migration:

  ```
  kv_store (
    key        text primary key,
    value      text not null,
    expires_at timestamptz not null
  )
  ```

  Add an index on `expires_at` for cleanup.
- **Expiry:** every read filters on `expires_at > now()`. Expired rows are deleted lazily, opportunistically during login. There is no cron job, because Cloud Run has no CPU when idle.
- **Concurrency:**
  - `setIfAbsent` and `incrementWithTtl` must each be a single atomic SQL statement (insert … on conflict … returning).
  - The backup-code single-use guarantee depends on `setIfAbsent` being atomic.
- **Callers that change:**
  - The authentication service: the issued-token allow-list for access and refresh tokens. Its "get/set/del token from Redis" methods are renamed to be store-neutral.
  - The auth service: remembered devices, backup-code claim, 2FA failure counter and lock, password failure counter.
  - Behaviour, key names (minus the Redis key prefix) and TTLs stay exactly the same.
- **Removed:**
  - Both Redis module registrations (app module and authentication module).
  - The Redis config file and the `REDIS_*` config validation entries.
  - The Redis service in docker-compose.
  - The `ioredis` and `@nestjs-modules/ioredis` dependencies.
- **Also change:** TypeORM query logging goes down to errors only, to cut log volume and cost on Cloud Run.

### Backend: Cloud Run readiness

- The app already listens on `PORT` and exposes `/health`, which is used as the startup probe.
- **Google Sheets key:** loaded from Secret Manager and mounted as a file at the path the config already reads. Add `private/secret` to `.dockerignore` as a guard.
- **Database:** connects to Neon over SSL using the existing `DATABASE_*` / `DATABASE_SSL` settings. Use Neon's pooled connection string, and keep the TypeORM pool small.
- **Migrations:** run as a Cloud Run Job using the same image, before each `gcloud run deploy`. They do not run at app startup, matching today's behaviour.
- **Build:** pinned to `linux/amd64`, because sharp and bcrypt are native modules.
- **No background work:** the backend has none (no cron, queues or websockets). That is what makes "CPU only during requests" safe. New code must not reply first and then keep working after the response.

### Frontend

- Built by the existing release workflow. The runtime `config/env-config.js` is generated during the workflow so that the API base points at the same origin (`/api`).
- Deployed with `wrangler pages deploy`.
- Custom domain: the existing Yaya hostname.

### Netflix-to-LINE Email Worker (new, small standalone Worker)

The trigger is an Outlook inbox rule that forwards Netflix emails to a dedicated address on the mail subdomain.

The Worker logic was ported from the n8n workflow:

1. Accept only mail whose original sender is Netflix's account address and whose subject is one of these two:
   - the temporary access code email: "รหัสสำหรับเข้าใช้งาน Netflix ชั่วคราว"
   - the household update email: "ข้อมูลสำคัญ: วิธีอัปเดตครัวเรือน Netflix"

   Forwarding may rewrite the outer `From`, so the sender check must look at the original sender too.
2. Parse the HTML body and extract:
   - the verify link: the anchor whose URL contains the travel-verify path or the update-primary-location path.
   - the "ขอโดย…" requester line, with newlines collapsed into spaces.
   - the profile image URL. This was extracted in n8n but is not used in the message today, so it is optional.
3. POST to the LINE Messaging API push endpoint, addressed to the configured group, with two `textV2` messages:
   - one mentioning everyone, with the subject and the requester
   - one with the link
4. Unmatched mail is dropped silently, with no LINE call.

Configuration lives in Worker secrets/vars: the LINE channel access token and the LINE group ID. Neither appears in source.

**Mail routing:** Email Routing is enabled on a **subdomain** only. The root domain's existing MX records (registrar email forwarding) stay untouched.

### CI/CD

- **Backend release workflow** adds these steps after the image build:
  1. Authenticate to GCP through Workload Identity Federation.
  2. Push the image to Artifact Registry.
  3. Run the migration job.
  4. Deploy the Cloud Run service at that image digest.
- **Frontend release workflow** adds the generated `env-config.js` and the Pages deploy.
- The **Email Worker** is deployed with `wrangler deploy`, from its own small workflow or by hand. It rarely changes.

### Data migration and cutover

1. Create the Neon project. `pg_dump` the Yaya database from the current shared Postgres, `pg_restore` it into Neon, and check that it fits within the free 1 GB.
2. Run migrations against Neon. This creates `kv_store`.
3. Deploy the backend and smoke-test it on its `*.run.app` URL.
4. Deploy Pages and the `/api` function. Switch the Yaya hostname to Pages.
5. Users log in again once. The old Redis tokens are not migrated.
6. Deploy the Email Worker, add the Outlook rule, and confirm a real Netflix email reaches LINE. Then deactivate the n8n workflow.
7. Remove the Yaya, n8n and Redis applications and charts from the Argo repository; Argo prune removes them from the cluster. Keep the database dump as the rollback point.

## Testing Decisions

- **What makes a good test:** it exercises external behaviour through the highest seam available, and asserts outcomes (logged in or not, locked or not, which LINE payload was sent), not internal calls. Mocking is used only at real external boundaries: LINE HTTP, and the database for unit specs.
- **Seam 1a: `KvStore` contract suite (integration).**
  - One suite runs against the Postgres implementation on a **real Postgres** (the docker-compose database). It runs under a separate `yarn test:integration` command, so that plain `yarn test` stays database-free.
  - It covers:
    - get after set
    - get after expiry
    - set overwrites the value and the TTL
    - `setIfAbsent` claims a missing key, refuses a live key, and claims an expired key
    - two concurrent `setIfAbsent` calls: exactly one wins
    - `incrementWithTtl` counts 1, 2, 3 and restarts after expiry
    - concurrent increments don't lose updates
    - `del` with several keys
    - `deleteByPrefix` removes only the matching keys
- **Seam 1b: `AuthService` / `AuthenticationService` specs (unit).**
  - The existing specs keep their Nest DI setup, but provide a small **in-memory `KvStore` fake** that honours TTLs, instead of the Redis mock.
  - The tests keep checking behaviour:
    - login and wrong-password lockout after 5 failures
    - 2FA lock after 5 failures and unlock after 60 s (with fake timers)
    - remember-device skips 2FA, and revoking it removes all of the user's devices
    - backup code works once and fails on reuse
    - token allow-list: logout makes the token invalid, and refresh rotates it
  - Prior art: the current `auth.service.spec.ts` and `user.service.spec.ts` setups.
- **Seam 2: Email Worker handler (unit).** Call the Worker's `email` handler with **fake** fixture emails, with made-up requester names and placeholder Netflix links, never real mail. Stub `fetch` and check:
  - the OTP email produces the expected two-message LINE payload with the mention
  - the household email does too
  - an email from another sender sends nothing
  - an email with another subject sends nothing
  - a forwarded email (outer `From` rewritten) still matches on the original sender
- **No automated tests** for the `/api` Pages Function (about 10 lines of forwarding) or the infrastructure/CI. These are covered by the **post-deploy smoke checklist**:
  1. `/health` responds 200 on the `*.run.app` URL.
  2. `/health` responds 200 through the Yaya domain's `/api`.
  3. Login works, including 2FA, and the session survives a cold start: wait more than 15 minutes, then reload.
  4. Logout invalidates the session.
  5. A paojiao-ledger read works.
  6. A file upload works.
  7. A forwarded test email reaches LINE.
  8. The GCP billing report shows $0 after the first days.

## Out of Scope

- Phase 2: moving the remaining Contabo workloads (shared Postgres for other apps, Supabase, Jenkins, sai-ya-sat frontend/backend, money-assistant frontend/API) and cancelling the VPS. These come after this phase proves the pattern.
- Migrating existing Redis session data. Users simply log in again.
- Changes to the paojiao-ledger / Google Sheets logic.
- Moving uploads off R2.
- Replacing semantic-release or Docker Hub publishing.
- Any change to the root domain's MX or existing email forwarding.
- Multi-region, high availability, or keeping instances warm (min instances > 0).

## Further Notes

- **Free tier limits that matter:**
  - Cloud Run: about 180k vCPU-seconds, 360k GiB-seconds and 2M requests per month, per billing account. This applies in Singapore at its USD equivalent.
  - Neon: 1 GB storage and 100 compute-hours per project per month, suspends after 5 minutes idle.
  - Cloudflare Pages and Workers: well within the free plan.

  Expected cost for 3 users is $0.
- **Cold start:**
  - The backend takes roughly 1–3 s.
  - Neon wakes from suspend in a few hundred ms.
  - The first Google Sheets call after a cold start adds an OAuth token fetch.
- **Risk: Outlook automatic forwarding.** Some Outlook/Microsoft 365 accounts block automatic forwarding to external addresses. Test this before building the Worker. The fallback is a Microsoft Graph change-notification webhook to the backend, plus a Cloud Scheduler job to renew the subscription every few days.
- **Card on file:** Cloud Run requires a billing account with a card, even when usage stays free. The $1 budget alert is mandatory.
- **Rollback:** until the Argo cleanup step, the old Yaya deployment on Contabo stays intact. Rolling back means pointing DNS back and restoring the dump if needed.
