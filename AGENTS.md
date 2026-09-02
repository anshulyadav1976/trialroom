# AGENTS.md — TrialRoom (working name)

## Mission

Build **TrialRoom**, a hackathon MVP for autonomous product testing.

A user provides a deployed web-app URL and optionally its GitHub repository. TrialRoom launches up to **4 independent Sparkles cloud sandboxes**, each acting as a different synthetic user. Every tester uses real browser automation, captures evidence, and returns structured findings. TrialRoom then combines them into a beautiful centralized product-quality workspace.

Core idea:

> **Put your product in front of users before your users.**

This is NOT “ask four agents what they think of a website.” The product value comes from:
- isolated user/browser sessions
- real Playwright execution
- deterministic browser evidence
- screenshots
- parallel personas and journeys
- cross-tester clustering
- code-aware diagnosis when a repo is available

No cybersecurity or pentesting scope in the MVP.

---

## STOP before implementation

On first launch, read `AGENTS.md` and `PLAN.md`, inspect the machine/repo/auth state, and return a readiness brief. **Do not build until the user explicitly says to start.**

Tell the user exactly what is missing. Do not ask for things you can detect yourself.

Likely required:
- `SPARKLES_API_KEY`
- `ANTHROPIC_API_KEY`
- GitHub authorization / repo owner if not already available
- Vercel scope/project choice only if ambiguous
- screenshot storage setup if needed

Secrets may live in local `.env.local`. Never print their values, commit them, or expose them client-side.

---

## Tech stack

### App
- Next.js App Router + TypeScript
- Tailwind CSS
- Framer Motion
- React Flow for the Figma/Miro-style Journey Board
- Lucide icons
- lightweight charts only where useful

### Server
Use Next.js route handlers/server code for:
- Sparkles Sandbox API calls
- authenticated Sparkles SSE proxying/normalization
- Anthropic journey generation and clustering
- artifact/screenshot upload
- run orchestration

Deploy to Vercel.

### Storage
Prefer Vercel Blob for screenshots/artifacts if available. Do not expose the Blob master write token to sandboxes. Use a run-scoped signed upload token/endpoint.

---

## Sparkles is the primary execution primitive

Treat a Sparkles sandbox as a managed asynchronous coding-agent job. Use it to run each synthetic tester independently.

Hard safety limit:

`MAX_ACTIVE_SANDBOXES=4`

Never exceed 4 active TrialRoom sandboxes, even if the account allows 5.

Use idempotency keys. Deduplicate durable SSE events by event ID. Terminate completed/unused sandboxes when practical.

Sparkles' curated stream may expose events such as:
- `sandbox.status`
- `turn.started`
- `tool.updated`
- `message.updated`
- `message.completed`
- `turn.completed`
- `sandbox.error`

The Sparkles key must remain server-side because the browser cannot directly authenticate the SSE stream safely.

---

## Coding-agent choice

Do **not** make Pi/OpenCode a hard dependency before testing Sparkles' managed agent.

Preferred order:
1. Sparkles managed coding agent + Playwright harness
2. Sparkles managed agent + Playwright MCP, only if reliably supported
3. only if needed, a custom/nested coding harness

If a custom harness is genuinely necessary, prefer **Pi** first because it is lightweight and can use `ANTHROPIC_API_KEY`. Use OpenCode only if Pi materially fails the use case.

The user's Anthropic key should primarily power TrialRoom's server-side:
- shared journey generation
- finding normalization
- cross-tester clustering
- report synthesis

Do not waste the hackathon building an agent framework Sparkles already provides.

---

## Browser-testing requirement

Before UI polish, verify a real Sparkles sandbox can:
- install/use Playwright
- launch Chromium headlessly
- reach a public target URL
- navigate/click/type
- capture screenshots
- capture console errors
- observe failed HTTP requests/statuses where practical
- write structured JSON results

If browser execution fails, it is a P0 blocker.

The sandbox receives:
- TrialRoom tester-harness repo
- target URL
- optional target repo
- persona
- bounded mission/journey
- run ID
- artifact upload instructions
- strict output schema

---

## Four synthetic testers

### 1. First-Time User
- knows nothing about the product
- understand landing page/value proposition
- enter/login/signup if credentials are supplied
- complete the primary workflow
- flag confusing copy, unclear actions, dead ends, unexpected behavior

### 2. Impatient User
- moves quickly
- clicks before loading finishes
- double-clicks important actions
- navigates back/forward
- refreshes during flows
- looks for weak feedback, duplicate actions, stale state, fragile navigation

### 3. Keyboard / Accessibility User
- attempts key flows keyboard-first
- checks focus order and modal traps
- identifies controls difficult to reach/use
- notes obvious label/semantic issues

Do not claim formal WCAG certification.

### 4. Edge-Case User
- empty values
- long but legitimate values
- unusual valid input
- alternate navigation order
- recovery from validation errors
- revisiting previous steps
- brittle assumptions

No exploit attempts.

---

## Shared journey generation

For each target, create a concise bounded journey, generally 4–8 meaningful steps, e.g.:
1. understand landing page
2. enter product
3. complete primary task
4. visit another key area
5. recover from one mistake
6. reach success/confirmation

Each persona receives a variation of the same underlying product journey so findings can be compared.

---

## Evidence model

AI opinions alone are not enough.

Whenever possible attach:
- page URL
- screenshot
- attempted action/element
- journey step
- console error
- failed request / HTTP status
- elapsed time
- reproduction steps

Keep three concepts separate:

**Observation** — what the synthetic user experienced.

**Technical evidence** — what Playwright/browser/runtime measured.

**Likely cause** — what the coding agent infers from source code.

Use structured JSON for tester results and findings. A finding should contain persona, page/step, category, severity, observation, expected/actual behavior, reproduction, screenshot, browser evidence, and optional code hint.

---

## Screenshots/artifacts

Preferred flow:

```text
Playwright in Sparkles
        ↓
TrialRoom signed upload endpoint
        ↓
Vercel Blob / object storage
        ↓
Dashboard + Journey Board
```

Do not assume Sparkles' external file API is ideal for serving binary screenshots.

Screenshot support is a core feature because visual evidence powers the Journey Board.

---

## Live UI event model

Proxy/normalize Sparkles events into product-friendly events such as:

- tester queued
- tester booting
- tester running
- current journey step
- browser/tool activity
- finding discovered
- screenshot captured
- tester complete
- tester failed

Do not display raw tool noise as the main UX. Translate it into useful language:
- `Opening product`
- `Testing onboarding`
- `Checking validation`
- `Capturing evidence`
- `Journey blocked`
- `Reviewing source`

---

## Cross-tester clustering

This is a core differentiator.

Pipeline:
1. normalize findings by route + journey step + category
2. group obvious matches deterministically
3. use Anthropic to semantically cluster related observations
4. produce one Clustered Finding with all supporting evidence

Example:

> **Onboarding Step 3 is a friction hotspot**  
> **3 / 4 testers struggled here.**

Cluster shows:
- affected testers
- actual count
- screenshots
- individual comments
- shared diagnosis
- severity
- reproduction
- optional likely code area

Never invent consensus. `3/4` must mean three real testers produced relevant evidence.

---

## The four product views

### View 1 — Overview
Understand product health in seconds.

Include:
- Product Health heuristic score
- testers completed / partial / failed
- journey completion rate
- high/critical finding count
- top friction hotspots
- tester × journey-step matrix
- clustered-observation highlights

Do not present Product Health as scientific.

### View 2 — Live Testers
Watch four independent Sparkles sandboxes work.

Each tester card shows:
- persona
- sandbox status
- current activity
- current journey step
- recent meaningful events
- progress
- elapsed time
- optional latest screenshot preview

It should feel alive, but never like four terminal windows.

### View 3 — Findings
Centralized product feedback.

Include:
- clustered findings first
- severity/category/persona/page filters
- screenshots
- individual tester comments
- deterministic browser evidence
- reproduction steps
- affected tester count
- likely code cause if repo available

Click a finding to open a rich detail drawer.

### View 4 — Journey Board
This is the signature visual.

Use React Flow to make a polished Figma/Miro-style zoomable canvas.

Each tester receives a horizontal lane:

`Landing → Login → Product → Action → Confirmation`

Each node contains:
- real screenshot thumbnail
- step/page title
- pass / friction / fail state
- comment count
- optional duration

Edges show progression.

Clicking a screenshot opens it larger with numbered comment pins/observations where practical.

Support pan, zoom, fit-to-view, and lane focus.

Do NOT leave default React Flow styling.

---

## Visual design

Aim for:

> **premium product-research workspace × Linear/Notion clarity × Figma spatial playfulness**

Avoid:
- spy/cyber UI
- neon terminals
- generic AI purple gradients
- over-corporate QA software

Prefer:
- warm off-white / soft neutral surfaces
- charcoal typography
- subtle pastel identity per persona
- restrained borders/shadows
- excellent spacing
- large visual evidence
- elegant cards
- gentle motion

The app should be desirable to PMs/designers as well as engineers.

---

## Demo target

Codex must find and verify an automation-friendly public demo site from inside Sparkles before relying on it.

Preferred candidate: **SauceDemo**, because it has a login → inventory → cart → checkout journey intended for browser automation.

Fallback: Playwright TodoMVC or another site explicitly designed for testing/demo automation.

Do not autonomously test random third-party production sites.

---

## GitHub + Vercel workflow

Codex owns repo creation and deployment setup.

Before implementation inspect:
- git
- `gh` auth
- Node/package manager
- Vercel CLI/auth

If no repo exists:
- initialize git
- create GitHub repo with `gh` if authenticated
- otherwise ask user to authenticate
- push `main`

Vercel:
- verify CLI login
- create/link project
- connect/import GitHub repository so pushes trigger automatic deployments
- if browser authorization/import is required, open the default browser and let the user complete it

After every major working phase:
1. lint/typecheck/build
2. commit descriptively
3. push
4. verify Vercel deployment
5. do not continue on top of an unexplained broken production build

Never commit `.env.local`.

---

## Reliability rules

- maximum 4 active Sparkles sandboxes
- each tester gets a timeout
- one failed tester does not fail the study
- use idempotency keys
- deduplicate SSE durable events
- preserve partial results
- validate model JSON
- cap screenshot dimensions/size
- keep missions bounded
- no infinite agent loops
- no code modification during testing
- no destructive testing
- terminate sandboxes after completion where practical

---

## Deferred feature: Fix It

This is **not core MVP**. Build only if all four views and live testing are reliable.

User explicitly clicks `Fix this` on a validated finding.

Then:
- ensure active sandbox count stays <= 4
- launch a new Sparkles coding sandbox
- provide repo + finding + screenshots + reproduction + browser evidence + code hint
- ask it to reproduce, fix, and add a regression test
- create/reuse a draft PR
- surface progress, tests, changed files, and PR link

Never auto-fix without explicit user action.

---

## Scope exclusions

Do not build during MVP:
- cybersecurity/pentesting
- billing
- teams/workspaces
- mobile app
- giant persistent backend
- generalized scraping
- unlimited personas
- formal WCAG certification
- automatic production mutation during testing

---

## Demo north star

1. Paste app URL.
2. Click `Run user study`.
3. Four Sparkles sandboxes wake up.
4. Four synthetic users test independently.
5. Live Testers shows their journeys.
6. A friction point appears.
7. Overview says `3 / 4 testers struggled here`.
8. Findings shows screenshots + evidence + reproduction.
9. Journey Board shows the same moment across user journeys.
10. If source exists, show likely code cause.
11. If deferred feature exists, `Fix this` generates a Sparkles PR.

Core pitch:

> **Traditional tests tell you whether your code did what you expected. TrialRoom tells you whether different users can actually use what you built.**

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
