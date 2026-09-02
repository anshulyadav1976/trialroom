import "server-only";

const API_BASE = "https://sparkles.dev/api/public/v1";

export interface CreateSandboxInput {
  repos: Array<{ fullName: string }>;
  prompt: string;
  title: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
  model?: string;
  signal?: AbortSignal;
}

function apiKey() {
  const value = process.env.SPARKLES_API_KEY;
  if (!value) throw new Error("SPARKLES_API_KEY is not configured");
  return value;
}

async function request(pathname: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new Error(`Sparkles request failed (${response.status})${detail ? `: ${detail}` : ""}`);
  }
  return response;
}

export async function createSandbox(input: CreateSandboxInput) {
  const response = await request("/sandboxes", {
    method: "POST",
    signal: input.signal,
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      repos: input.repos,
      prompt: input.prompt,
      title: input.title,
      toolApprovalMode: "auto",
      metadata: input.metadata,
      ...(input.model ? { model: input.model } : {}),
    }),
  });
  const body = (await response.json()) as { id?: string; status?: string; sandbox?: { id?: string; status?: string } };
  const id = body.id ?? body.sandbox?.id;
  if (!id) throw new Error("Sparkles did not return a sandbox id");
  return { id, status: body.status ?? body.sandbox?.status };
}

export async function getSandbox(sandboxId: string) {
  const response = await request(`/sandboxes/${encodeURIComponent(sandboxId)}`);
  return (await response.json()) as { status?: string; sandbox?: { status?: string } };
}

export async function listSandboxes() {
  const response = await request("/sandboxes");
  const body = (await response.json()) as {
    data?: Array<{
      id: string;
      status?: string;
      metadata?: Record<string, string>;
    }>;
  };
  return body.data ?? [];
}

export function streamSandboxEvents(sandboxId: string, since?: string, signal?: AbortSignal) {
  const query = since ? `?${new URLSearchParams({ since })}` : "";
  return request(`/sandboxes/${encodeURIComponent(sandboxId)}/events/stream${query}`, {
    signal,
    headers: {
      Accept: "text/event-stream",
      ...(since ? { "Last-Event-ID": since } : {}),
    },
  });
}

export async function listSandboxEvents(sandboxId: string, after?: string) {
  const query = new URLSearchParams({ after: after ?? "0", limit: "100" });
  const response = await request(`/sandboxes/${encodeURIComponent(sandboxId)}/events?${query}`);
  return (await response.json()) as {
    data?: Array<{ id?: string; type: string; data?: unknown; ts?: string }>;
    nextCursor?: string;
  };
}

export async function terminateSandbox(sandboxId: string) {
  await request(`/sandboxes/${encodeURIComponent(sandboxId)}/terminate`, { method: "POST" });
}
