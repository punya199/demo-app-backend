# Voting feature (backend)

> Draft spec — pending publish to GitHub Issues in `punya199/demo-app-backend` (labels: `ready-for-agent`). Companion frontend spec lives at `demo-app/.scratch/voting-feature/SPEC.md`.

## Problem Statement

There's no way for a user of this app to create a poll and collect structured opinions from other people — either app users or people outside the app entirely. Anything resembling "let's vote on this" today happens outside the product (chat, spreadsheet, verbally), with no shareable link, no tally, and no record of who's already responded.

## Solution

Add a **Voting** feature: an authenticated, permissioned user creates a poll (single-choice, multiple-choice, or ranked-choice), the app produces a shareable public link, anyone with that link can vote without logging in, duplicate votes from the same person are blocked, and results are revealed to a voter once they've cast their own vote.

## User Stories

1. As a permissioned user, I want to create a poll with a title, description, and a list of options, so that I can ask a question and collect structured responses.
2. As a permissioned user, I want to choose whether my poll is single-choice, multiple-choice, or ranked-choice when I create it, so that the voting mechanic matches the kind of question I'm asking.
3. As a permissioned user, I want to optionally cap how many options a voter can select on a multiple-choice poll, so that "pick your top 2" style questions are possible, not just "pick any/all."
4. As a permissioned user, I want to optionally set a closing date/time for my poll, so that it stops accepting votes automatically without me having to remember to close it.
5. As a permissioned user, I want to manually close my poll at any time, so that I can end voting early regardless of any deadline.
6. As a permissioned user, I want a shareable public link generated for my poll, so that I can send it to anyone, inside or outside the app.
7. As a permissioned user, I want the poll's public link to use a non-guessable identifier, so that people can't discover or tamper with polls they weren't given a link to.
8. As a poll creator, I want the options list locked once the first vote is cast, so that editing options mid-poll can't silently corrupt the tally.
9. As a poll creator, I want to still be able to edit the poll's title/description after voting has started, so that I can fix a typo or clarify wording without affecting the tally.
10. As an anonymous visitor with a poll link, I want to vote without creating an account or logging in, so that sharing a poll outside the app actually works.
11. As a logged-in app user, I want my vote to be tied to my account rather than my browser, so that I can vote consistently across devices/browsers and my vote survives clearing cookies.
12. As any voter (anonymous or logged-in), I want to be prevented from voting twice on the same poll, so that results reflect one person, one vote.
13. As any voter, I want to be able to change my vote before the poll closes, so that I'm not locked into my first answer if I reconsider.
14. As a single-choice voter, I want to pick exactly one option, so that the interaction matches a simple either/or question.
15. As a multiple-choice voter, I want to pick more than one option (up to the poll's configured maximum, if any), so that I can express support for several options at once.
16. As a ranked-choice voter, I want to order all the options from most to least preferred, so that my full preference, not just my top pick, is captured.
17. As any voter, I want to see the poll's results only after I've submitted my own vote, so that I'm not anchored by seeing others' choices before I answer.
18. As any voter who has already voted, I want the results to update live (without a manual refresh) as more votes come in, so that I can watch the outcome unfold.
19. As a poll creator or voter, I want results shown only as aggregate tallies (counts, or Borda scores for ranked polls), never "who voted for what," so that individual voting choices stay private even from the poll's creator.
20. As a logged-in app user, I want a "My polls" page reachable from a new "Voting" menu item, so that I can find polls I created or voted on without needing to keep the link.
21. As a logged-in app user without the `VOTING` permission, I want the Voting menu item hidden, so that the app's existing permission model is respected consistently with other features.
22. As a developer maintaining this codebase, I want the ranking tally computed with Borda count, so that live, incremental score updates are possible without re-processing every ballot per vote (unlike instant-runoff).
23. As a developer maintaining this codebase, I want vote writes to upsert on a single dedupe key (`userId` or cookie token, whichever applies), so that "change your vote" and "block duplicate votes" are the same code path, not two.
24. As a developer maintaining this codebase, I want the new `VOTING` permission feature added to `EnumPermissionFeatureName` consistently in both this repo and the frontend's hand-duplicated copy, so that the permission-gating pattern used by `HOUSE_RENT`/`BILL` isn't broken for this feature.

## Implementation Decisions

**New module**: `src/modules/voting/`, following the existing feature-module shape (`*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`).

**Entities** (`src/db/entities/`, registered in `database.config.ts` like all others, extending `BaseModelEntity` for the audit-trail columns):

- `PollEntity`: `title`, `description`, `slug` (nanoid, unique, indexed — the public identifier, never the numeric id), `pollType` (`single` | `multiple` | `ranking`), `maxSelections` (nullable int, applies to `multiple` only; null = no cap), `closesAt` (nullable timestamp), `closedAt` (nullable timestamp, set on manual close), `creatorId` (`ManyToOne` → `UserEntity`).
- `PollOptionEntity`: `pollId` (`ManyToOne` → `PollEntity`), `label`, `order` (int, display order).
- `PollVoteEntity`: `pollId` (`ManyToOne` → `PollEntity`), `voterUserId` (nullable `ManyToOne` → `UserEntity`), `voterToken` (nullable string — the anonymous cookie token), `selections` (jsonb: array of `optionId` for single/multiple, array of `{ optionId, rank }` for ranking). Unique index on `(pollId, voterUserId)` where `voterUserId` is not null, and a separate unique index on `(pollId, voterToken)` where `voterToken` is not null — one active vote row per identity per poll, upserted on resubmission.

**Permission**: add `VOTING` to `EnumPermissionFeatureName` (`src/db/entities/permissions.ts`) — requires a migration (`ALTER TYPE permissions_feature_name_enum ADD VALUE 'VOTING'`). CRUD mapping: `create` = make a poll, `read` = view "My polls" / see the menu item, `update` = edit title/description or close manually, `delete` = delete a poll (cascades to its options and votes). Enforced via the existing `@AuthUserPermission({ featureName, action })` decorator/`PermissionGuard`, same as `house-rent`/`bill`.

**Public voting route**: unauthenticated, addressed by `slug`, not the numeric id — this is the first unauthenticated route in the codebase, so it needs explicit review of what the global CORS/helmet config allows (currently `credentials: true` with an `ORIGIN_ALLOWED` list — the public vote endpoint must still work for the cookie-token flow within that CORS policy).

**Dedupe / identity resolution** (applies to voting and to "have I voted, can I see results" checks):
1. If the request carries a valid JWT (same access-token guard/strategy already used elsewhere, but optional here — a missing/invalid token doesn't reject the request), resolve `voterUserId` from it and key the vote on `(pollId, voterUserId)`.
2. Otherwise, read/set a signed httpOnly cookie scoped per-poll (`voterToken`) and key the vote on `(pollId, voterToken)`.
3. Vote submission is an upsert on whichever key applies — same code path handles first vote and vote-change.
4. This is a best-effort guarantee (a cleared-cookie anonymous voter can vote again), stated plainly in the frontend UI copy, not solved with OTP/email verification in this iteration.

**Validation on vote write**: reject if poll is closed (`closedAt` set, or `closesAt` in the past); reject if `pollType = single` and more/less than one selection given; reject if `pollType = multiple` and selections exceed `maxSelections` (when set) or don't reference valid option ids; reject if `pollType = ranking` and the selections don't form a full permutation of the poll's option ids.

**Tallying**:
- `single`/`multiple`: count of votes referencing each `optionId`.
- `ranking`: Borda count — for an N-option poll, a vote's rank-1 choice contributes `N-1` points to that option, rank-2 contributes `N-2`, … last place contributes `0`. Computed as a running aggregate query (`SUM` over `PollVoteEntity.selections`), not stored as a denormalized score column, since votes are mutable (upsert) and can arrive/change at any time.

**Results endpoint**: returns aggregate tallies only (per-option counts or Borda scores) plus whether the requesting identity has voted; never returns a per-voter breakdown. Locked behind "has this identity voted yet" — same identity-resolution logic as the vote endpoint — per Q5/Q17.

**Options immutability**: `PollOptionEntity` rows become immutable (service-layer check, not a DB constraint) once `PollVoteEntity.count(pollId) > 0`; `title`/`description` on `PollEntity` remain editable regardless.

## Testing Decisions

Good tests here exercise observable service behavior (does the tally come out right, is a duplicate vote rejected, is a closed poll rejected) — not TypeORM query-builder internals or controller wiring, which is thin pass-through.

- **`VotingService`**: unit-tested with `Test.createTestingModule` + mocked repositories via `getRepositoryToken`, matching `user.service.spec.ts`/`auth.service.spec.ts`. Cover: create-poll validation, vote upsert (first vote vs. change-of-vote), duplicate-vote rejection for both identity paths, closed-poll rejection (deadline and manual), option-locking after first vote, multiple-choice `maxSelections` enforcement, ranking-permutation validation.
- **Borda tally math**: pulled into its own pure function (e.g. `computeBordaScores(votes, optionIds)`), unit-tested directly with plain Jest, no NestJS TestingModule — matching `ledger-sheet-parser.spec.ts`/`password-helper.spec.ts`. This is the one place worth exhaustive edge-case coverage (ties, an option nobody ranked first, a single-option poll).
- No controller/e2e seam exists in this repo yet (`test:e2e` has no `test/` directory); this spec doesn't introduce one — endpoint wiring is exercised manually/via the frontend, consistent with how every other module here is tested.

## Out of Scope

- Real-time push (websocket/SSE) for live results — plain polling refetch on the frontend instead.
- Per-recipient invite links / known-voter-list mode (Q6 option (d)) — the hybrid userId-or-cookie dedupe is the only mechanism in this iteration.
- Any "reveal individual responses" mode for creators — aggregate-only, full stop, in this iteration.
- Poll discovery/browse page (listing all public polls) — link-only access plus "My polls" for the creator/voter.
- Reopening a closed poll.
- Images or rich formatting on poll options — plain text label only.
- Draft/unpublished poll state — polls are live immediately on creation.
- Instant-runoff or any ranked-choice algorithm other than Borda count.

## Further Notes

This is the first unauthenticated route in either repo (confirmed via repo search — no existing public/share/token pattern anywhere in `demo-app` or `demo-app-backend`). Treat the public voting controller as a new trust boundary: input validation on the anonymous path deserves particular scrutiny since it's reachable by anyone with a link, not just permissioned app users.

The frontend's `EnumPermissionFeatureName` copy in `demo-app/src/services/permission/permission.params.ts` must be updated in the same change-set as this repo's enum + migration, or the two repos' permission checks will disagree about whether `VOTING` exists.
