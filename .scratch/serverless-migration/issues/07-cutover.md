# 07: Cut Yaya over to Pages + Cloud Run + Neon (HITL)

**What to build:** Users at the existing Yaya domain are served by the new stack with all of their data. The old Contabo deployment stays intact as the rollback.

1. Tell the 2–3 users about a ~30-minute window, and that they will need to log in again once.
2. Take a final `pg_dump` of the Yaya database from the Contabo shared Postgres and restore it into Neon, replacing the trial copy from ticket 05. Run migrations.
3. Attach the Yaya hostname to the Pages project as a custom domain, and update its Cloudflare DNS record.
4. Run the smoke checklist below.
5. Keep the dump file somewhere safe as the rollback point. Leave the Contabo Yaya deployment running until ticket 08.

This needs a human, because it involves DNS, the production data copy, and talking to the users.

See spec: specs/serverless-migration.md (Data migration and cutover; Testing Decisions, smoke checklist).

**Blocked by:** 05 (yaya-backend running on Cloud Run with Neon), 06 (yaya frontend on Cloudflare Pages with /api forwarding)

**Status:** ready-for-agent

- [ ] The final dump has been restored into Neon, and row counts for the main tables match the source
- [ ] `/api/v1/health` returns 200 on `*.run.app`
- [ ] `/api/v1/health` returns 200 through `<yaya domain>`
- [ ] Login with 2FA works on the Yaya domain
- [ ] The session survives a cold start (more than 15 min idle, then reload)
- [ ] Logout invalidates the session
- [ ] A paojiao-ledger read works
- [ ] A file upload works
- [ ] After the first days, the GCP billing report shows $0
- [ ] The rollback steps are written down: point DNS back to the old ingress, and the dump location
