import type {
  JourneyStepDefinition,
  Persona,
  PersonaId,
  TesterEvent,
  TesterRun,
  TesterStatus,
} from "@/lib/trialroom";

export const MAX_ACTIVE_SANDBOXES = 4;
const TERMINAL = new Set<TesterStatus>(["completed", "partial", "failed"]);

export interface LiveTester extends TesterRun {
  upstreamCursor?: string;
  seenEventIds: Set<string>;
  slotReserved: boolean;
}

export interface LiveRun {
  id: string;
  mode: "live";
  seeded?: boolean;
  targetName: string;
  targetUrl: string;
  repository?: string;
  startedAt: string;
  completedAt?: string;
  journey: JourneyStepDefinition[];
  testers: LiveTester[];
}

export class SandboxSlots {
  #active = 0;

  get active() {
    return this.#active;
  }

  reserve(count: number) {
    if (count < 1 || this.#active + count > MAX_ACTIVE_SANDBOXES) return false;
    this.#active += count;
    return true;
  }

  release(count = 1) {
    this.#active = Math.max(0, this.#active - count);
  }
}

export class RunRegistry {
  readonly slots = new SandboxSlots();
  readonly runs = new Map<string, LiveRun>();

  add(run: LiveRun) {
    this.runs.set(run.id, run);
  }

  get(runId: string) {
    return this.runs.get(runId);
  }

  releaseTester(tester: LiveTester) {
    if (!tester.slotReserved) return;
    tester.slotReserved = false;
    this.slots.release();
  }

  updateStatus(run: LiveRun, tester: LiveTester, status: TesterStatus, sandboxSettled = false) {
    if (!TERMINAL.has(tester.status)) tester.status = status;
    if (sandboxSettled && TERMINAL.has(status)) this.releaseTester(tester);
    if (run.testers.every((item) => TERMINAL.has(item.status))) {
      run.completedAt ??= new Date().toISOString();
    }
  }

  addEvent(tester: LiveTester, event: TesterEvent) {
    tester.events.push(event);
    tester.events = tester.events.slice(-20);
    tester.currentActivity = event.label;
  }
}

declare global {
  // ponytail: process memory is single-instance only; replace with durable storage when multi-instance Vercel traffic matters.
  var trialRoomRunRegistry: RunRegistry | undefined;
}

export const registry = globalThis.trialRoomRunRegistry ??= new RunRegistry();

export function makeTester(persona: Persona, journey: JourneyStepDefinition[]): LiveTester {
  return {
    id: persona.id,
    persona,
    status: "queued",
    currentActivity: "Tester queued",
    elapsedMs: 0,
    journey: journey.map((step) => ({ ...step, outcome: "pending", observationCount: 0 })),
    events: [{
      id: `${persona.id}-queued`,
      testerId: persona.id,
      kind: "queued",
      at: new Date().toISOString(),
      label: "Tester queued",
    }],
    seenEventIds: new Set(),
    slotReserved: true,
  };
}

export function publicRun(run: LiveRun) {
  return {
    ...run,
    testers: run.testers.map((tester) => ({
      id: tester.id,
      persona: tester.persona,
      sandboxId: tester.sandboxId,
      status: tester.status,
      currentStepId: tester.currentStepId,
      currentActivity: tester.currentActivity,
      elapsedMs: tester.elapsedMs,
      journey: tester.journey,
      events: tester.events,
    })),
    activeSandboxCount: run.testers.filter((tester) => tester.slotReserved).length,
  };
}

export function findTester(run: LiveRun, testerId: PersonaId) {
  return run.testers.find((tester) => tester.id === testerId);
}
