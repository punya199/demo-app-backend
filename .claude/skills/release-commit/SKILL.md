---
name: release-commit
description: Write commit messages, PR titles and pushes so semantic-release publishes a version and the Docker build/deploy runs. Use every time you commit, push, open a PR, rebase, or touch main in this repo, and when a merged change "didn't deploy" or CHANGELOG/version looks wrong.
---

# Release-safe commits

`main` is released by semantic-release (`.releaserc`, `preset: eslint`) in
`.github/workflows/docker-build.yml`. The `build-and-push` and deploy jobs run **only if** the
`release` job publishes a new version. A version is published only when at least one new commit
on `main` has a releasing tag. Any other commit ships nothing, silently.

## 1. Commit summary: `Tag: description`

| Tag | Bump | Use for |
|---|---|---|
| `Fix:` | patch | bug fix |
| `Update:` | minor | enhancement to an existing feature, balance/tuning change |
| `New:` | minor | new feature, endpoint, screen, skill |
| `Breaking:` | **major** | only when the team agreed to break the API/data contract |

House rule (`CLAUDE.md`): **always use `Fix:`, `Update:` or `New:`**. Never use `Chore:`, `Docs:`,
`Build:` or `Upgrade:`, even for tests, refactors, docs or dependency bumps. They release nothing,
so the image never builds. Pick the closest of the three (refactor → `Update:`, test-only fix →
`Fix:`, docs/skills → `Update:` or `New:`).

The parser is `^(\w*):\s*(.*)$`. Rules that follow from it:
- Capital first letter, exact word, colon, space: `Fix: ...`. `fix:`, `Fixed:`, `[Fix]` and
  `Fix(scope):` all fail to match and release nothing.
- One line, imperative, describes the user-visible change (`Fix: reject votes on a closed poll`).
- Body: what and why. End with the attribution lines the session asks for. Don't put a model name
  in the message.

## 2. Things you never touch by hand

- `CHANGELOG.md` and `package.json` `version`: semantic-release writes them in its own
  `chore(release)[ci skip]: x.y.z` commit on `main`.
- Never amend, drop or rewrite a `chore(release)` commit.

## 3. Branches and PRs (3 developers in parallel)

- Work on a feature branch, never commit straight to `main` unless asked.
- Before pushing, `git fetch origin && git rebase origin/main`. Release commits land on `main`
  after every merge, so you're usually behind.
- PRs are merged with **merge commits** (`Merge pull request #N ...`), so every commit inside the
  PR is analyzed. Make sure **each** commit has a valid tag. Also give the **PR title** a tag
  (`New: ...`), so a squash merge still releases.
- Don't rewrite a branch someone else is also pushing to. Force-push (`--force-with-lease`) only
  your own branch, and only when it holds already-merged history.

## 4. Pushing `main` (rare, only when asked)

```bash
git fetch origin && git rebase origin/main   # fast-forward only
git push origin main
```
Never merge `origin/main` into local `main` (creates a merge commit) and never force-push `main`
(deletes the release commit).

## 5. "It merged but didn't deploy"

Check the Actions run: if `release` says "no new version", every commit since the last release
had a non-releasing or malformed tag. Fix it forward with a correctly tagged commit (e.g. the next
real change). Don't rewrite `main`.
