import type { PersonaId, TesterEventKind, TesterStatus } from "@/lib/trialroom";

export interface RawSseEvent {
  event: string;
  id?: string;
  data: string;
}

export interface NormalizedSparklesEvent {
  id?: string;
  testerId: PersonaId;
  kind: TesterEventKind;
  at: string;
  label: string;
  sourceType: string;
  status?: TesterStatus;
}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function parseSseBlock(block: string): RawSseEvent | null {
  let event = "message";
  let id: string | undefined;
  const data: string[] = [];

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

export async function* parseSseStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let boundary: RegExpExecArray | null;
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

function eventPayload(event: RawSseEvent) {
  let payload: unknown;
  try {
    payload = JSON.parse(event.data);
  } catch {
    payload = { message: event.data };
  }

  const root = isObject(payload) ? payload : {};
  const data = isObject(root.data) ? root.data : root;
  return {
    id: event.id ?? (typeof root.id === "string" ? root.id : undefined),
    type: typeof root.type === "string" ? root.type : event.event,
    data,
    at: typeof root.ts === "string"
      ? root.ts
      : typeof data.createdAt === "string"
        ? data.createdAt
        : undefined,
  };
}

export function mapSandboxStatus(value: unknown): TesterStatus | undefined {
  switch (value) {
    case "queued":
      return "queued";
    case "creating":
      return "booting";
    case "running":
      return "running";
    case "succeeded":
      return "completed";
    case "failed":
      return "failed";
    case "terminating":
      return undefined;
    case "terminated":
      return "partial";
    default:
      return undefined;
  }
}

export function mapTurnStatus(value: unknown): TesterStatus | undefined {
  switch (value) {
    case "completed":
    case "succeeded":
    case "success":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    case "aborted":
    case "canceled":
    case "cancelled":
    case "terminated":
      return "partial";
    default:
      return undefined;
  }
}

export function sparklesEventKey(event: Pick<NormalizedSparklesEvent, "id" | "sourceType">) {
  return event.id ? `${event.id}:${event.sourceType}` : undefined;
}

export function normalizeSparklesEvent(
  testerId: PersonaId,
  event: RawSseEvent,
  now = new Date().toISOString(),
): NormalizedSparklesEvent | null {
  const payload = eventPayload(event);
  const nestedSandbox = isObject(payload.data.sandbox) ? payload.data.sandbox : {};
  const sourceStatus = payload.data.status ?? nestedSandbox.status;
  const status = mapSandboxStatus(sourceStatus);
  const turnStatus = mapTurnStatus(payload.data.state ?? payload.data.outcome ?? payload.data.status);
  const tool = isObject(payload.data.tool) ? payload.data.tool : {};
  const toolName = String(tool.name ?? payload.data.name ?? "").toLowerCase();

  let kind: TesterEventKind;
  let label: string;
  switch (payload.type) {
    case "sandbox.status":
      if (!status) return null;
      kind = status === "queued" ? "queued" : status === "booting" ? "booting" : status === "completed" ? "completed" : status === "failed" ? "failed" : "browser-activity";
      label = status === "queued" ? "Tester queued" : status === "booting" ? "Preparing test environment" : status === "running" ? "Testing journey" : status === "completed" ? "Journey complete" : status === "failed" ? "Tester failed" : "Journey stopped";
      break;
    case "turn.started":
      kind = "step-started";
      label = "Starting bounded journey";
      break;
    case "tool.updated":
      kind = toolName.includes("screenshot") ? "screenshot-captured" : "browser-activity";
      label = toolName.includes("screenshot") ? "Capturing evidence" : toolName.includes("playwright") || toolName.includes("browser") ? "Using the product" : "Checking journey evidence";
      break;
    case "message.updated":
    case "message.completed":
      kind = "browser-activity";
      label = "Reviewing the journey";
      break;
    case "turn.completed":
      kind = turnStatus === "completed" ? "completed" : turnStatus === "failed" ? "failed" : "browser-activity";
      label = turnStatus === "completed" ? "Journey complete" : turnStatus === "failed" ? "Journey failed" : turnStatus === "partial" ? "Journey stopped" : "Journey turn ended";
      break;
    case "sandbox.error":
      kind = "failed";
      label = "Tester encountered an error";
      break;
    default:
      return null;
  }

  return {
    id: payload.id,
    testerId,
    kind,
    at: payload.at ?? now,
    label,
    sourceType: payload.type,
    status: payload.type === "sandbox.error"
      ? "failed"
      : payload.type === "turn.completed"
        ? turnStatus
        : status ?? (payload.type === "turn.started" || payload.type === "tool.updated" || payload.type.startsWith("message.") ? "running" : undefined),
  };
}
