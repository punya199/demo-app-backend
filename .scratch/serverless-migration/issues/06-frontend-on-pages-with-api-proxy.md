# 06: yaya frontend on Cloudflare Pages with /api forwarding

**What to build:** The Yaya frontend (the `demo-app` repo) is served from Cloudflare Pages. Its `/api/*` requests reach the Cloud Run backend through a Pages Function on the same origin, so login cookies keep working without `SameSite=None`. Verified on the `*.pages.dev` URL.

- **Pages Function:** forwards `/api/*` to the Cloud Run service URL, which is a Pages env var. It preserves the method, path, query string, body and cookies, and passes `Set-Cookie` and the status back unchanged.
- **Release workflow in `demo-app`:** after the Vite build, it generates the runtime `env-config.js` so the API base is the same origin, then runs `wrangler pages deploy`. The Cloudflare API token is a GitHub secret scoped to Pages.
- No custom domain yet. That is ticket 07.

See spec: specs/serverless-migration.md (Frontend; Platforms, `/api` routing).

**Blocked by:** 05 (yaya-backend running on Cloud Run with Neon)

**Status:** ready-for-agent

- [ ] A push that produces a release in `demo-app` deploys to Pages automatically
- [ ] On `*.pages.dev`, the full login flow works, including 2FA and logout
- [ ] On `*.pages.dev`, cookies are set and sent on later `/api` calls
- [ ] A paojiao-ledger page loads through `/api`
- [ ] Card images and uploaded files display
- [ ] SPA deep links (refresh on a nested route) don't 404
