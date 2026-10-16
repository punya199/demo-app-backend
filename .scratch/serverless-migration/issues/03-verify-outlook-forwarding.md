# 03: Verify Outlook forwards Netflix mail to the mail subdomain (HITL)

**What to build:** Prove that the event-driven trigger for the Netflix notifier is possible before anyone writes the Worker.

1. Enable Cloudflare Email Routing on a **subdomain** of the main domain, for example `mail.<domain>`. Leave the root domain's existing MX records (registrar email forwarding) untouched.
2. Route a test address on that subdomain to a temporary destination, either a personal inbox or a throwaway Worker that logs the email.
3. Add an Outlook inbox rule that forwards Netflix account emails to the test address.
4. Send or wait for a matching email, then check what arrives.

This needs a human, because it uses the Outlook account and the Cloudflare dashboard.

See spec: specs/serverless-migration.md (Netflix-to-LINE Email Worker; Further Notes on the Outlook forwarding risk).

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Email Routing is active on the subdomain only, and root-domain mail still forwards as before
- [ ] Outlook allows the auto-forward rule to the external address. It isn't blocked by tenant or outbound-spam policy
- [ ] A forwarded Netflix email arrives with:
  - [ ] its subject unchanged
  - [ ] its HTML body intact
  - [ ] the original Netflix sender recoverable, whether from the `From` header or from forwarding headers such as `X-Forwarded-For`, `Resent-From` or `Reply-To`
- [ ] Record the findings (which header carries the original sender, and a sanitized sample with fake names and links) as a comment on ticket 04
- [ ] **If forwarding is blocked:** stop and flag it for re-planning (fallback: Microsoft Graph change notifications to the backend)
