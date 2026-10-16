# 08: Remove Yaya, n8n and Redis from Argo

**What to build:** The Contabo cluster stops running the services phase 1 replaced. Only the phase-2 workloads remain (shared Postgres, Supabase, Jenkins, sai-ya-sat, money-assistant).

All changes are in the `argo-deployment` repo:

- Remove the Argo Applications and Helm charts for:
  - the Yaya frontend
  - the Yaya backend
  - the n8n infra service
  - the Redis infra service
- Argo's automated prune then deletes them from the cluster.
- Update the repo docs (CLAUDE.md service lists, the database table, endpoints), the Makefile targets, and the Jenkinsfile app list, so they no longer mention the removed services.

Two things to check before removing anything:

- Confirm that nothing else uses the shared Redis. Today only the Yaya backend does.
- Take a final export of the n8n workflows and credentials as an archive.

The Yaya database (`test1`) on the shared Postgres can be dropped once the dump from ticket 07 is safely stored.

See spec: specs/serverless-migration.md (Data migration and cutover, step 7; Out of Scope for phase 2).

**Blocked by:** 04 (Netflix-to-LINE Email Worker live), 07 (Cut Yaya over)

**Status:** ready-for-agent

- [ ] Confirmed that no remaining app references the shared Redis
- [ ] n8n workflows and credentials have been exported and archived
- [ ] These Applications and charts are removed from the repo: Yaya frontend, Yaya backend, n8n, Redis
- [ ] Argo shows these Applications gone, and their namespaces are cleaned up
- [ ] CLAUDE.md, the Makefile and the Jenkinsfile no longer reference the removed services
- [ ] `make lint` passes for the remaining charts
- [ ] The Yaya domain still works (served by Pages, unaffected)
- [ ] The Netflix notifier still works (Worker, unaffected)
