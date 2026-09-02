# PLAN.md — TrialRoom MVP

## Operating rule

This is a **3-hour hackathon**. Every phase must leave a working product.

After each major phase:
- lint/typecheck/build
- commit
- push
- let Vercel auto-deploy
- verify deployment

Hard limit:

`MAX_ACTIVE_SANDBOXES=4`

Never exceed it.

---

# Phase 0 — Readiness + browser spike

## Goal
Prove Sparkles can run the core testing workload before building the dashboard.

### Inspect machine/auth
Check:
- Node/package manager
- git
- GitHub CLI/auth
- Vercel CLI/auth
- local env-var names without printing values
- Sparkles access

Tell the user exactly what is missing.

Expected secrets:
- `SPARKLES_API_KEY`
- `ANTHROPIC_API_KEY`

Likely screenshot storage:
- `BLOB_READ_WRITE_TOKEN` or equivalent

### Repo
If no repo exists:
- create Next.js project
- initialize git
- create GitHub repo
- push `main`

### One-sandbox Sparkles spike
Create exactly ONE sandbox and verify:
- managed agent boots
- public internet works
- Playwright can be installed/used
- Chromium launches headlessly
- public demo target opens
- browser interaction works
- screenshot is captured
- console/network evidence can be captured
- structured JSON result is written
- Sparkles SSE can be consumed
- sandbox can terminate cleanly

Preferred target: SauceDemo.  
Fallback: Playwright TodoMVC or another intentionally public automation demo.

If direct Playwright works, use it. Only investigate Playwright MCP or Pi/OpenCode if necessary.

## Acceptance
A real Sparkles sandbox completes one browser journey with evidence.

If not, solve this before UI polish.

---

# Phase 1 — Product shell + GitHub/Vercel

## Goal
Have a polished public URL immediately.

Build:
- Next.js App Router + TypeScript
- Tailwind
- visual system
- app shell
- target URL input
- optional GitHub repo input
- `Run user study`
- navigation for:
  1. Overview
  2. Live Testers
  3. Findings
  4. Journey Board

Design: warm, premium product-research workspace with subtle persona colors. No generic cyber/AI dashboard.

### Deployment
- link/create Vercel project
- connect/import GitHub repo
- confirm git pushes auto-deploy
- open browser for auth/import only if needed

## Acceptance
Public Vercel URL works and all four empty views look polished.

**Commit + push.**

---

# Phase 2 — Mocked full product experience

## Goal
Build the entire UX before real orchestration complexity.

Create four personas:
- First-Time User
- Impatient User
- Keyboard User
- Edge-Case User

Create a deterministic demo run that:
- queues all four
- advances them through a shared journey
- creates sample findings
- creates screenshot placeholders
- creates at least one repeated friction hotspot
- finishes with an Overview report

### Overview
Build:
- Product Health heuristic
- completion metrics
- severity counts
- top friction clusters
- tester × journey-step matrix

### Live Testers
Build:
- four tester cards
- status/current step
- recent meaningful events
- progress
- elapsed time

### Findings
Build:
- clustered findings list
- filters
- finding detail drawer
- screenshot/evidence/reproduction sections
- individual tester comments

### Journey Board
Use React Flow:
- one horizontal lane per tester
- screenshot nodes
- journey edges
- pass/friction/fail states
- pan/zoom/fit-to-view
- comment pins / detail interaction

## Acceptance
A `Run demo` control tells the entire TrialRoom story with fake data. Journey Board is already demo-quality.

**Commit + push.**

---

# Phase 3 — Real Sparkles orchestration

## Goal
Replace fake tester lifecycle with real managed sandboxes.

Build server-side Sparkles client:
- create sandbox
- idempotency keys
- run/tester metadata
- fetch sandbox state
- stream events
- follow-up prompt if needed
- terminate

Add queue/semaphore enforcing:

`MAX_ACTIVE_SANDBOXES=4`

### SSE proxy
Keep `SPARKLES_API_KEY` server-side.

Proxy and normalize:
- `sandbox.status`
- `turn.started`
- `tool.updated`
- `message.updated`
- `message.completed`
- `turn.completed`
- `sandbox.error`

Deduplicate durable IDs.

## Acceptance
Four real sandboxes can start independently and appear in Live Testers. One failed tester does not kill the study.

**Commit + push.**

---

# Phase 4 — Real Playwright tester harness

## Goal
Each Sparkles sandbox performs a bounded real-user journey.

Create tester harness in repo.

Every tester prompt contains:
- target URL
- optional target repo
- persona
- common journey
- persona behavior
- safety constraints
- result schema/path
- screenshot/artifact upload instructions

Instrument Playwright for:
- navigation/actions
- screenshots
- console errors
- failed requests/statuses
- current URLs
- timings
- journey completion

Keep journeys roughly 4–8 meaningful steps.

When target source repo is available, agent may inspect code after experiencing the problem and add an optional code hint.

## Acceptance
All four personas can test the demo target and return structured results/evidence.

**Commit + push.**

---

# Phase 5 — Real screenshots + Journey Board

## Goal
Turn test evidence into the signature visual experience.

Preferred storage: Vercel Blob.

Build:
- run-scoped signed artifact upload mechanism
- screenshot upload endpoint
- image compression/limits
- screenshot URL in structured results

Never give a Sparkles sandbox the master storage credential.

Wire screenshots into:
- Live Tester preview
- Findings
- Journey Board

### Board polish
Each lane has screenshot steps with:
- page/step label
- pass/friction/fail
- comment count
- optional duration

Clicking a node:
- enlarges screenshot
- shows numbered observations/comments
- shows supporting browser evidence

## Acceptance
Journey Board is populated with **real screenshots from real Sparkles test journeys**.

**Commit + push.**

---

# Phase 6 — Cross-tester clustering + final dashboard

## Goal
Turn four separate agents into one useful product study.

### Deterministic normalization
Group findings first by:
- page/route
- journey step
- category

### Anthropic semantic clustering
Use `ANTHROPIC_API_KEY` server-side to merge semantically related findings.

A cluster contains:
- title
- severity
- affected testers
- actual affected count
- shared explanation
- representative screenshots
- individual observations
- reproduction
- browser evidence
- optional code hint

Example:

`Onboarding Step 3 is a friction hotspot — 3 / 4 testers struggled`

Never fabricate consensus.

### Product Health
Create a simple transparent heuristic based on:
- journey completion
- high-severity failures
- repeated friction
- tester failures

Label it a heuristic.

## Acceptance
A repeated problem independently found by multiple testers becomes one strong clustered insight with all supporting evidence.

**Commit + push.**

---

# Phase 7 — Demo hardening

## Goal
Make the live demo difficult to break.

Test at least:
- preferred demo target
- one second simple demo target if time permits

Handle:
- sandbox timeout/failure
- malformed result JSON
- missing screenshot
- SSE disconnect/reconnect
- duplicate SSE frame
- bad URL
- Vercel production behavior

Add:
- per-tester timeout
- partial-result handling
- concurrency guard
- clean error states
- sandbox cleanup
- run reset
- known-good demo/replay fallback

A study should still be useful if only 3 of 4 testers succeed.

**Commit + push.**

---

# Phase 8 — DEFERRED: Fix It

**Only start if Phases 0–7 are reliable.**

## Goal
Turn one validated finding into a reviewable draft code fix.

User explicitly clicks `Fix this`.

Before launch:
- ensure active sandbox count remains <= 4
- terminate completed tester sandboxes where appropriate

Create a new Sparkles sandbox with:
- target repo
- selected finding
- screenshots
- reproduction steps
- browser evidence
- optional code hint

Ask it to:
- reproduce issue
- implement fix
- add regression test
- run relevant tests
- create/reuse draft PR

Show:
- live fix progress
- changed files
- test result
- PR link

Never auto-fix without user action.

**Commit + push if implemented.**

---

# Final demo flow

1. Open TrialRoom.
2. Paste demo product URL.
3. Click `Run user study`.
4. Four Sparkles sandboxes boot.
5. Live Testers shows four personas working independently.
6. A friction point appears.
7. Overview shows `3 / 4 testers struggled here`.
8. Findings shows evidence + reproduction.
9. Journey Board shows actual screenshots/comments across journeys.
10. Explain optional source-aware code diagnosis.
11. If Phase 8 exists, click `Fix this` and show Sparkles PR flow.

Core pitch:

> **Traditional tests tell you whether your code did what you expected. TrialRoom tells you whether different users can actually use what you built.**
