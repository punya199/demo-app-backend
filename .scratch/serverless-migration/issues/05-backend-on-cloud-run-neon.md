# 05: yaya-backend running on Cloud Run with Neon

**What to build:** Every release of the backend deploys automatically to Google Cloud Run in Singapore, backed by Neon Postgres. The app is reachable on its `*.run.app` URL. The app at the Yaya domain doesn't use it yet; that switch is ticket 07.

**Google Cloud (one-time):**
- A project linked to a billing account, with a **$1 budget alert**.
- Artifact Registry in Singapore.
- Secret Manager holding:
  - the database credentials
  - the JWT and cookie secrets
  - the TOTP encryption key
  - the R2 credentials
  - the Google Sheets private key, mounted as a **file** at the path the config already reads
- Workload Identity Federation for the GitHub repo. No JSON service-account key is stored in GitHub.

**Neon (one-time):**
- A free-plan project in the Singapore region.
- A trial `pg_dump`/restore of the current Yaya database, checked to fit within 1 GB.
- Use the pooled connection string, with SSL on.

**Cloud Run service:**
- Singapore region, min instances 0, request-based billing.
- Startup probe on `/api/v1/health`.
- Secrets mapped to env vars or files.

**Migrations:** a Cloud Run Job on the same image runs the TypeORM migrations.

**Release workflow:** after semantic-release builds the image, it also:
1. builds for `linux/amd64`
2. pushes to Artifact Registry
3. executes the migration Job
4. deploys the service at the new image digest

Docker Hub publishing stays as it is.

**Image hygiene:** add `private/secret` to `.dockerignore`.

See spec: specs/serverless-migration.md (Platforms; Backend: Cloud Run readiness; CI/CD).

**Blocked by:** 02 (Postgres KvStore; remove Redis)

**Status:** ready-for-agent

- [ ] The budget alert at $1 exists
- [ ] Workload Identity Federation is set up, with no long-lived GCP key stored in GitHub secrets
- [ ] A push that produces a release deploys automatically, and the migration Job runs before the new revision serves traffic
- [ ] `/api/v1/health` returns 200 on the `*.run.app` URL
- [ ] On the `*.run.app` URL these work against the Neon copy:
  - [ ] login, including 2FA
  - [ ] a paojiao-ledger read
  - [ ] a file upload to R2
- [ ] A session survives a cold start: wait for the service to scale to zero, then make an authenticated request
- [ ] No secret value is in the image, the repo, or the workflow logs
