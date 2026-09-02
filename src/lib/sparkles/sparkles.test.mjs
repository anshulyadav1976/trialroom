import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSparklesEvent, parseSseBlock, sparklesEventKey } from "./events.ts";
import { fixDigest, fixPrompt, parseFixRequest } from "./fix.ts";
import { MAX_ACTIVE_SANDBOXES, RunRegistry, SandboxSlots, makeTester } from "./registry.ts";
import { journey, personas } from "./study.ts";

test("sandbox slots enforce the exact four-sandbox ceiling", () => {
  const slots = new SandboxSlots();
  assert.equal(slots.reserve(MAX_ACTIVE_SANDBOXES), true);
  assert.equal(slots.reserve(1), false);
  slots.release();
  assert.equal(slots.reserve(1), true);
  assert.equal(slots.active, MAX_ACTIVE_SANDBOXES);
  assert.equal(slots.reserve(0), false);
  assert.equal(slots.reserve(MAX_ACTIVE_SANDBOXES + 1), false);
});

test("Sparkles SSE is parsed and normalized without exposing message text", () => {
  const raw = parseSseBlock('id: evt-1\nevent: sandbox.status\ndata: {"type":"sandbox.status","data":{"status":"running"}}');
  assert.ok(raw);
  assert.deepEqual(normalizeSparklesEvent("first-time", raw, "2026-01-01T00:00:00.000Z"), {
    id: "evt-1",
    testerId: "first-time",
    kind: "browser-activity",
    at: "2026-01-01T00:00:00.000Z",
    label: "Testing journey",
    sourceType: "sandbox.status",
    status: "running",
  });
});

test("turn outcome controls completion and events sharing a cursor stay distinct", () => {
  const message = normalizeSparklesEvent("first-time", {
    event: "message.completed",
    id: "32",
    data: '{"id":"32","type":"message.completed","ts":"2026-09-02T18:21:56.000Z","data":{}}',
  });
  const turn = normalizeSparklesEvent("first-time", {
    event: "turn.completed",
    id: "32",
    data: '{"id":"32","type":"turn.completed","ts":"2026-09-02T18:21:56.141Z","data":{"state":"failed"}}',
  });

  assert.ok(message);
  assert.ok(turn);
  assert.notEqual(sparklesEventKey(message), sparklesEventKey(turn));
  assert.equal(turn.kind, "failed");
  assert.equal(turn.status, "failed");
  assert.equal(turn.at, "2026-09-02T18:21:56.141Z");
});

test("tester completion does not release a sandbox slot before sandbox settlement", () => {
  const local = new RunRegistry();
  assert.equal(local.slots.reserve(1), true);
  const tester = makeTester(personas[0], journey);
  const run = {
    id: "run-test",
    mode: "live",
    targetName: "example.test",
    targetUrl: "https://example.test/",
    startedAt: "2026-01-01T00:00:00.000Z",
    journey,
    testers: [tester],
  };

  local.updateStatus(run, tester, "completed");
  assert.equal(local.slots.active, 1);
  local.updateStatus(run, tester, "partial", true);
  assert.equal(local.slots.active, 0);
  assert.equal(tester.status, "completed");
});

test("fix request validation stays bounded and idempotent", () => {
  const value = {
    repository: "acme/storefront",
    targetUrl: "https://example.test/cart",
    finding: {
      id: "finding-1",
      title: "Cart feedback is unclear",
      severity: "medium",
      category: "feedback",
      observation: { summary: "No confirmation", expected: "Confirm the add", actual: "No message appeared" },
      reproduction: ["Open the cart", "Add one item"],
    },
  };
  const parsed = parseFixRequest(value);
  const reparsed = parseFixRequest(JSON.parse(JSON.stringify(value)));
  assert.ok(parsed);
  assert.ok(reparsed);
  assert.equal(fixDigest(parsed), fixDigest(reparsed));
  assert.match(fixPrompt(parsed), /Do not push, open a pull request, deploy/);
  assert.equal(parseFixRequest({ ...value, finding: { ...value.finding, title: "x".repeat(201) } }), null);
});
