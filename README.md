# TrialRoom

Autonomous synthetic product testing with four isolated Sparkles agents, real Playwright journeys, screenshot evidence, and cross-tester insight clustering.

## Local development

```bash
pnpm install
pnpm dev
```

Required server-side variables live in `.env.local` and must never be committed:

```text
SPARKLES_API_KEY
ANTHROPIC_API_KEY
SPARKLES_REPOSITORY
SPARKLES_MODEL           # optional; omit to use Sparkles' managed default
TRIALROOM_TARGET_URL
BLOB_READ_WRITE_TOKEN
TRIALROOM_ARTIFACT_SECRET
TRIALROOM_PUBLIC_ORIGIN
```

## Verification

```bash
pnpm lint
pnpm build
pnpm test:spike
pnpm test:results
node --test src/lib/sparkles/sparkles.test.mjs
```

The real Phase-0 browser proof is intentionally explicit because it creates one paid cloud sandbox:

```bash
pnpm spike:sparkles
```

The checked-in TodoMVC study is backed by 20 real browser screenshots. To refresh its public Blob artifacts:

```bash
node scripts/seed-demo.mjs
```

TrialRoom uses one durable public-study lock and enforces a hard maximum of four active Sparkles sandboxes. Normal testing never modifies the target product or opens pull requests.
