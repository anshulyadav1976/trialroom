import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { PersonaId } from "@/lib/trialroom";

interface ArtifactGrant {
  runId: string;
  testerId: PersonaId;
  exp: number;
}

function signingKey() {
  const value = process.env.TRIALROOM_ARTIFACT_SECRET ?? process.env.SPARKLES_API_KEY;
  if (!value) throw new Error("TRIALROOM_ARTIFACT_SECRET is not configured");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", signingKey()).update(`trialroom-artifact\0${payload}`).digest("base64url");
}

export function createArtifactGrant(runId: string, testerId: PersonaId, ttlMs = 30 * 60_000) {
  const payload = Buffer.from(JSON.stringify({ runId, testerId, exp: Date.now() + ttlMs })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyArtifactGrant(token: string, runId: string): ArtifactGrant {
  const [payload, supplied, extra] = token.split(".");
  if (!payload || !supplied || extra) throw new Error("Invalid artifact grant");
  const expected = signature(payload);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) throw new Error("Invalid artifact grant");

  const grant = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ArtifactGrant;
  if (grant.runId !== runId || !grant.testerId || !Number.isFinite(grant.exp) || grant.exp < Date.now()) {
    throw new Error("Expired artifact grant");
  }
  return grant;
}
