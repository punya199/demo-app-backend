# 04: Netflix-to-LINE Email Worker live

**What to build:** When Netflix sends one of these two emails, the LINE group gets a message within seconds:

- the temporary access code email: "รหัสสำหรับเข้าใช้งาน Netflix ชั่วคราว"
- the household update email: "ข้อมูลสำคัญ: วิธีอัปเดตครัวเรือน Netflix"

This replaces the n8n workflow that polls Outlook every minute.

A small standalone Cloudflare Email Worker receives the forwarded email from Email Routing and does the following:

1. Accept the email only if the **original** sender is Netflix's account address and the subject exactly matches one of the two above. Use the header found in ticket 03 to recover the original sender.
2. Parse the HTML and extract:
   - the verify link: the anchor whose URL contains the travel-verify path or the update-primary-location path
   - the "ขอโดย…" requester line, with newlines collapsed into spaces
3. POST to the LINE Messaging API push endpoint, addressed to the configured group, with two `textV2` messages:
   - `{everyone} <subject> <requester>`, where `{everyone}` is substituted as a mention of all
   - `<link>`
4. Drop any other email silently.

The LINE channel access token and group ID are Worker secrets. Neither appears in source. Once a real email has reached LINE, deactivate the n8n workflow.

Where the Worker lives (its own small repo, or a folder alongside the backend) is up to the implementer. Deploy it with `wrangler`.

See spec: specs/serverless-migration.md (Netflix-to-LINE Email Worker; Testing Decisions, seam 2).

**Blocked by:** 03 (Verify Outlook forwards Netflix mail to the mail subdomain)

**Status:** ready-for-agent

- [ ] Handler tests call the Worker's `email` handler with **fake** fixture emails (made-up names, placeholder links) and stub `fetch`. They check that:
  - [ ] the OTP email produces the exact two-message LINE payload with the everyone mention
  - [ ] the household email does too
  - [ ] an email from another sender sends nothing
  - [ ] an email with another subject sends nothing
  - [ ] a forwarded email whose outer `From` is rewritten still matches on the original sender
- [ ] The LINE token and group ID are set as Worker secrets, and none appear in the repo
- [ ] Routing: the subdomain address goes to the Worker, not the ticket 03 test destination
- [ ] Routing: the Outlook rule points at that address
- [ ] A real Netflix email reaches the LINE group via the Worker
- [ ] The n8n workflow is deactivated
