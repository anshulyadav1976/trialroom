import assert from "node:assert/strict";
import test from "node:test";
import { parseSseStream, reduceEvent } from "./sparkles-spike.mjs";

test("SSE parser survives chunk boundaries and reducer deduplicates durable ids", async () => {
  const chunks = [
    'id: 1\r\nevent: sandbox.status\r\ndata: {"status":"running"}\r',
    '\n\r\nid: 1\nevent: sandbox.status\ndata: {"status":"running"}\n\n',
    'id: 2\nevent: message.completed\ndata: {"message":"done"}\n\n',
    'id: 3\nevent: sandbox.status\ndata: {"status":"succeeded"}\n\n',
  ];
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });
  const state = { seen: new Set(), events: [], lastCursor: undefined, status: undefined };

  for await (const event of parseSseStream(stream)) reduceEvent(state, event);

  assert.equal(state.events.length, 3);
  assert.equal(state.lastCursor, "3");
  assert.equal(state.status, "succeeded");
  assert.deepEqual(
    state.events.map(({ type }) => type),
    ["sandbox.status", "message.completed", "sandbox.status"],
  );
});

test("events sharing a cursor remain distinct and failed turns stop the run", () => {
  const state = { seen: new Set(), events: [], lastCursor: undefined, status: "running" };
  reduceEvent(state, {
    id: "32",
    event: "message.completed",
    data: '{"id":"32","type":"message.completed","data":{}}',
  });
  reduceEvent(state, {
    id: "32",
    event: "turn.completed",
    data: '{"id":"32","type":"turn.completed","data":{"state":"failed"}}',
  });

  assert.deepEqual(state.events.map(({ type }) => type), ["message.completed", "turn.completed"]);
  assert.equal(state.lastCursor, "32");
  assert.equal(state.status, "failed");
});
