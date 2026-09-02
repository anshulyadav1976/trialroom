#!/usr/bin/env node

import { createHash, createHmac } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { list } from "@vercel/blob";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

const API_BASE = "https://sparkles.dev/api/public/v1";
const TERMINAL = new Set(["succeeded", "failed", "terminated"]);
const MEANINGFUL = new Set([
  "sandbox.status",
  "turn.started",
  "tool.updated",
  "message.updated",
  "message.completed",
  "turn.completed",
  "sandbox.error",
]);

export function parseSseBlock(block) {
  let event = "message";
  let id;
  const data = [];

  for (const line of block.replace(/\r\n|\r/g, "\n").split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator < 0 ? line : line.slice(0, separator);
    let value = separator < 0 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    if (field === "id" && !value.includes("\0")) id = value;
    if (field === "data") data.push(value);
  }

  return data.length ? { event, id, data: data.join("\n") } : null;
}

export async function* parseSseStream(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(pending))) {
        const parsed = parseSseBlock(pending.slice(0, boundary.index));
        pending = pending.slice(boundary.index + boundary[0].length);
        if (parsed) yield parsed;
      }
      if (done) break;
    }
    const parsed = parseSseBlock(pending);
    if (parsed) yield parsed;
  } finally {
    reader.releaseLock();
  }
}

function jsonData(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

export function reduceEvent(state, rawEvent) {
  const payload = jsonData(rawEvent.data);
  const id = rawEvent.id ?? payload.id;
  const type = payload.type ?? rawEvent.event;
  const durableKey = id ? `${id}:${type}` : undefined;
  if (durableKey && state.seen.has(durableKey)) return state;
  if (durableKey) state.seen.add(durableKey);

  const data = payload.data ?? payload;
  const status = data.status ?? data.sandbox?.status;
  if (id) state.lastCursor = id;
  if (status) state.status = status;
  if (type === "turn.completed" && data.state) state.status = data.state;
  if (MEANINGFUL.has(type)) state.events.push({ id, type, data });
  return state;
}

function loadLocalEnv() {
  const envPath = path.resolve(import.meta.dirname, "../.env.local");
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function repoName(value) {
  if (!/^[^/\s]+\/[^/\s]+$/.test(value)) {
    throw new Error("SPARKLES_REPOSITORY must be owner/repo");
  }
  return value;
}

function createArtifactGrant(runId) {
  const key = process.env.TRIALROOM_ARTIFACT_SECRET;
  const publicOrigin = process.env.TRIALROOM_PUBLIC_ORIGIN;
  if (!key || !publicOrigin) return undefined;
  const payload = Buffer.from(JSON.stringify({ runId, testerId: "first-time", exp: Date.now() + 30 * 60_000 })).toString("base64url");
  const signature = createHmac("sha256", key).update(`trialroom-artifact\0${payload}`).digest("base64url");
  return {
    url: `${publicOrigin.replace(/\/$/, "")}/api/runs/${encodeURIComponent(runId)}/artifacts`,
    token: `${payload}.${signature}`,
  };
}

function mission(runId, targetUrl, artifactUpload) {
  const uploadInstructions = artifactUpload ? `
8. Before finishing, upload both files to TrialRoom's signed public artifact endpoint. Install @vercel/blob in a temporary directory if needed, then use upload() from @vercel/blob/client with access "public", handleUploadUrl "${artifactUpload.url}", and clientPayload "${artifactUpload.token}". Upload the JPEG as "runs/${runId}/first-time/todomvc-screenshot.jpg" with content type image/jpeg and the JSON as "runs/${runId}/first-time/trialroom-result.json" with content type application/json. Never print the clientPayload.` : "";
  return `You are TrialRoom's Phase-0 browser tester. Run one bounded browser test only.

Target: ${targetUrl}
Run ID: ${runId}
Persona: First-time user

Use the managed coding environment and direct Playwright (not an MCP browser). Install only what is strictly required to run Playwright and Chromium. Do not log in, commit, push, open a pull request, or modify application source.

Steps:
1. Launch headless Chromium and open the target.
2. Record page-load failures, browser console errors, and failed HTTP responses.
3. Add a todo named "TrialRoom browser proof".
4. Mark that todo complete and verify the completed state is visible.
5. Capture a compact 960x540 JPEG screenshot at quality 45.
6. Write the screenshot to artifacts/todomvc-screenshot.jpg and its base64 representation to artifacts/todomvc-screenshot.base64.txt. Keep the base64 file below 1 MB.
7. Write valid JSON only to artifacts/trialroom-result.json with this shape:
{
  "runId": "${runId}",
  "targetUrl": "${targetUrl}",
  "persona": "First-time user",
  "status": "passed or failed",
  "steps": [{"name":"string","status":"passed or failed","observation":"string"}],
  "findings": [],
  "evidence": {
    "consoleErrors": ["string"],
    "failedRequests": [{"url":"string","status":0}],
    "screenshotPath": "artifacts/todomvc-screenshot.jpg",
    "screenshotBase64Path": "artifacts/todomvc-screenshot.base64.txt"
  }
}${uploadInstructions}

If browser setup or any journey step fails, still write the result JSON with status "failed" and the exact failure in steps and findings.`;
}

function eventSummary(event) {
  const detail = event.data.status ?? event.data.message ?? event.data.tool?.name ?? "";
  return detail ? `${event.type}: ${String(detail).slice(0, 160)}` : event.type;
}

async function main() {
  loadLocalEnv();
  const apiKey = required("SPARKLES_API_KEY");
  const repository = repoName(required("SPARKLES_REPOSITORY"));
  const targetUrl = process.env.TRIALROOM_TARGET_URL ?? "https://demo.playwright.dev/todomvc/";
  const model = process.env.SPARKLES_MODEL;
  const runId = process.env.TRIALROOM_RUN_ID ?? "phase-0-todomvc";
  const artifactUpload = createArtifactGrant(runId);
  const stableKey = `trialroom-${createHash("sha256")
    .update(`${repository}\0${targetUrl}\0${runId}\0${model ?? "default"}`)
    .digest("hex")}`;
  const headers = { Authorization: `Bearer ${apiKey}` };
  const timeout = AbortSignal.timeout(Number(process.env.SPARKLES_TIMEOUT_MS ?? 600_000));
  let sandboxId = process.env.SPARKLES_SANDBOX_ID;

  const request = async (pathname, options = {}) => {
    const response = await fetch(`${API_BASE}${pathname}`, {
      ...options,
      signal: options.signal ?? timeout,
      headers: { ...headers, ...options.headers },
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw new Error(`Sparkles ${options.method ?? "GET"} ${pathname} failed (${response.status}): ${detail}`);
    }
    return response;
  };

  const getSandbox = async () =>
    (await request(`/sandboxes/${encodeURIComponent(sandboxId)}`)).json();

  const readFile = async (filePath) => {
    const query = new URLSearchParams({ repo: repository, path: filePath });
    const body = await (
      await request(`/sandboxes/${encodeURIComponent(sandboxId)}/files/content?${query}`)
    ).json();
    return body.working?.content ?? body.content;
  };

  const replayEvents = async (after) => {
    const query = new URLSearchParams({ after: after ?? "0", limit: "100" });
    const body = await (
      await request(`/sandboxes/${encodeURIComponent(sandboxId)}/events?${query}`)
    ).json();
    return body.data ?? [];
  };

  try {
    let initialStatus;
    if (!sandboxId) {
      const created = await (
        await request("/sandboxes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": stableKey,
          },
          body: JSON.stringify({
            repos: [{ fullName: repository }],
            prompt: mission(runId, targetUrl, artifactUpload),
            ...(model ? { model, reasoningEffort: "high" } : {}),
            title: `TrialRoom Phase 0 · ${runId}`,
            toolApprovalMode: "auto",
            metadata: { product: "trialroom", runId, phase: "0" },
          }),
        })
      ).json();
      sandboxId = created.id ?? created.sandbox?.id;
      initialStatus = created.status ?? created.sandbox?.status;
      if (!sandboxId) throw new Error("Sparkles create response did not include a sandbox id");
      console.log(`Created one sandbox: ${sandboxId}`);
    } else {
      const snapshot = await getSandbox();
      initialStatus = snapshot.status ?? snapshot.sandbox?.status;
      console.log(`Resuming one sandbox: ${sandboxId}`);
    }
    const state = {
      seen: new Set(),
      events: [],
      lastCursor: undefined,
      status: initialStatus,
    };

    while (!TERMINAL.has(state.status)) {
      for (const event of await replayEvents(state.lastCursor)) {
        const before = state.events.length;
        reduceEvent(state, { event: event.type, id: event.id, data: JSON.stringify(event) });
        if (state.events.length > before) console.log(eventSummary(state.events.at(-1)));
      }
      if (TERMINAL.has(state.status)) break;

      const query = state.lastCursor
        ? `?${new URLSearchParams({ since: state.lastCursor })}`
        : "";
      const streamStartCursor = state.lastCursor;
      const response = await request(
        `/sandboxes/${encodeURIComponent(sandboxId)}/events/stream${query}`,
        {
          headers: {
            Accept: "text/event-stream",
            ...(state.lastCursor ? { "Last-Event-ID": state.lastCursor } : {}),
          },
        },
      );
      if (!response.body) throw new Error("Sparkles event stream had no response body");

      for await (const event of parseSseStream(response.body)) {
        const before = state.events.length;
        reduceEvent(state, event);
        if (state.events.length > before) console.log(eventSummary(state.events.at(-1)));
        if (TERMINAL.has(state.status)) break;
      }

      for (const event of await replayEvents(streamStartCursor)) {
        const before = state.events.length;
        reduceEvent(state, { event: event.type, id: event.id, data: JSON.stringify(event) });
        if (state.events.length > before) console.log(eventSummary(state.events.at(-1)));
      }

      const snapshot = await getSandbox();
      state.status = snapshot.status ?? snapshot.sandbox?.status ?? state.status;
      console.log(`Reconciled sandbox status: ${state.status ?? "unknown"}`);
      if (!TERMINAL.has(state.status)) await delay(2_000);
    }

    const outputDir = path.resolve(import.meta.dirname, "../outputs");
    mkdirSync(outputDir, { recursive: true });

    if (artifactUpload && process.env.BLOB_READ_WRITE_TOKEN) {
      const prefix = `runs/${runId}/first-time/`;
      const { blobs } = await list({ prefix, token: process.env.BLOB_READ_WRITE_TOKEN });
      const resultBlob = blobs.find(({ pathname }) => pathname.includes("trialroom-result"));
      const screenshotBlob = blobs.find(({ pathname }) => pathname.includes("todomvc-screenshot"));
      if (!resultBlob || !screenshotBlob) throw new Error("Signed artifact upload did not produce both result and screenshot blobs");
      const [resultResponse, screenshotResponse] = await Promise.all([fetch(resultBlob.url), fetch(screenshotBlob.url)]);
      if (!resultResponse.ok || !screenshotResponse.ok) throw new Error("Uploaded artifact could not be downloaded");
      const result = await resultResponse.json();
      const screenshot = Buffer.from(await screenshotResponse.arrayBuffer());
      writeFileSync(path.join(outputDir, "phase-0-result.json"), `${JSON.stringify(result, null, 2)}\n`);
      writeFileSync(path.join(outputDir, "phase-0-todomvc.jpg"), screenshot);
      console.log(`Signed artifact upload verified: ${screenshot.length} screenshot bytes`);
    } else {
      const resultText = await readFile("artifacts/trialroom-result.json");
      if (typeof resultText !== "string") throw new Error("Result file had no working-tree text content");
      const result = JSON.parse(resultText);
      const screenshotBase64 = await readFile("artifacts/todomvc-screenshot.base64.txt");
      if (typeof screenshotBase64 !== "string" || !/^[A-Za-z0-9+/=\s]+$/.test(screenshotBase64)) {
        throw new Error("Screenshot base64 file was missing or invalid");
      }
      const cleanBase64 = screenshotBase64.replaceAll(/\s/g, "");
      writeFileSync(path.join(outputDir, "phase-0-result.json"), `${JSON.stringify(result, null, 2)}\n`);
      writeFileSync(path.join(outputDir, "phase-0-todomvc.jpg"), Buffer.from(cleanBase64, "base64"));
      console.log(`Repository artifact egress verified: ${cleanBase64.length} base64 characters`);
    }
  } finally {
    if (sandboxId) {
      try {
        await request(`/sandboxes/${encodeURIComponent(sandboxId)}/terminate`, {
          method: "POST",
          signal: AbortSignal.timeout(20_000),
        });
        console.log(`Termination requested: ${sandboxId}`);
      } catch (error) {
        console.error(`Termination failed for ${sandboxId}: ${error.message}`);
      }
    }
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
