"use client";
/* eslint-disable @next/next/no-img-element -- tester evidence comes from dynamic run-scoped Blob URLs */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Handle,
  Position,
  ReactFlow,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

type View = "overview" | "testers" | "findings" | "board";
type RunMode = "preview" | "live";
type LiveStatus = "queued" | "booting" | "running" | "completed" | "partial" | "failed";

type LiveEvent = { id: string; label: string; at: string };
type LiveTester = {
  id: string;
  sandboxId?: string;
  status: LiveStatus;
  currentStepId?: string;
  currentActivity: string;
  elapsedMs: number;
  events: LiveEvent[];
};
type LiveRun = {
  id: string;
  seeded?: boolean;
  targetName: string;
  targetUrl: string;
  repository?: string;
  startedAt: string;
  completedAt?: string;
  testers: LiveTester[];
  activeSandboxCount: number;
};
type EvidenceFinding = {
  id: string;
  testerId: string;
  route: string;
  stepId: string;
  category: string;
  severity: string;
  observation: { summary: string; expected: string; actual: string };
  evidence: Array<{ pageUrl: string; attemptedAction?: string; elapsedMs?: number; screenshot?: { url?: string; label?: string } }>;
  reproduction: string[];
};
type EvidenceCluster = {
  id: string;
  title: string;
  summary: string;
  severity: string;
  findingIds: string[];
  affectedCount: number;
  totalTesters: number;
};
type EvidenceStudy = {
  id: string;
  targetName: string;
  targetUrl: string;
  testers: Array<LiveTester & { journey: Array<{ id: string; title: string; outcome: string; observationCount: number; durationMs?: number; screenshot?: { url?: string; label?: string } }> }>;
  findings: EvidenceFinding[];
  clusters: EvidenceCluster[];
};

const validViews: View[] = ["overview", "testers", "findings", "board"];

function shareState(session: string, view: View) {
  const url = new URL(window.location.href);
  url.searchParams.set("session", session);
  url.searchParams.set("view", view);
  window.history.replaceState(null, "", url);
}

function runList(payload: unknown): LiveRun[] {
  if (Array.isArray(payload)) return payload as LiveRun[];
  if (payload && typeof payload === "object" && Array.isArray((payload as { runs?: unknown }).runs)) return (payload as { runs: LiveRun[] }).runs;
  return [];
}

function studyResult(payload: unknown, run: Pick<LiveRun, "id" | "targetName" | "targetUrl">): EvidenceStudy | null {
  if (!payload || typeof payload !== "object") return null;
  const envelope = payload as { study?: unknown; results?: unknown };
  const candidate = (envelope.study ?? envelope.results ?? payload) as {
    runId?: string;
    status?: string;
    testers?: Array<{ personaId: string; status: LiveStatus; steps: EvidenceStudy["testers"][number]["journey"] }>;
    findings?: EvidenceFinding[];
    clusters?: EvidenceCluster[];
  };
  if (candidate.status === "pending" || !Array.isArray(candidate.testers) || !Array.isArray(candidate.findings) || !Array.isArray(candidate.clusters)) return null;
  return {
    id: candidate.runId ?? run.id,
    targetName: run.targetName,
    targetUrl: run.targetUrl,
    testers: candidate.testers.map((tester) => ({ id: tester.personaId, status: tester.status, currentActivity: "Evidence received", elapsedMs: 0, events: [], journey: tester.steps })),
    findings: candidate.findings,
    clusters: candidate.clusters,
  };
}

const personas = [
  { id: "first", asset: "first-time", short: "FT", name: "First-time user", color: "#426bff", note: "Looking for a clear next step" },
  { id: "fast", asset: "impatient", short: "IM", name: "Impatient user", color: "#ef704f", note: "Retried the primary action" },
  { id: "keys", asset: "keyboard", short: "KB", name: "Keyboard user", color: "#138a76", note: "Tabbing through the task list" },
  { id: "edge", asset: "edge-case", short: "EC", name: "Edge-case user", color: "#a45ad3", note: "Testing an empty task" },
] as const;

const journey = ["Arrive", "Create task", "Complete", "Filter", "Recover"];

const findings = [
  { id: 1, category: "Feedback", severity: "Medium", count: 2, title: "Empty submission has no visible feedback", detail: "The impatient and edge-case testers both pressed Enter on an empty field. Nothing was added, but the interface did not explain that the action was ignored.", evidence: "Observed at / · Step 5: Recover", persona: "impatient", step: 4, action: "Pressed Enter with an empty task field", result: "Task count stayed unchanged; no alert or message appeared", elapsed: "42 ms", reproduce: ["Focus the new-task input", "Leave it empty", "Press Enter and observe the unchanged page"] },
  { id: 2, category: "Accessibility", severity: "Medium", count: 1, title: "Keyboard focus is invisible on key controls", detail: "The keyboard tester could operate the task checkbox and footer filters, but both reported no outline or box-shadow while focused.", evidence: "Observed at / · Steps 3–4", persona: "keyboard", step: 3, action: "Tabbed to the task checkbox and Completed filter", result: "Both controls worked, but computed focus styling was none", elapsed: "25 ms", reproduce: ["Create a task with Enter", "Tab to its checkbox and then the footer filters", "Observe focus before pressing Space or Enter"] },
  { id: 3, category: "Navigation", severity: "Medium", count: 1, title: "Completed-task filters are easy to miss", detail: "The first-time tester found the filters only after completing a task; the small links sit beneath the remaining-item count with little emphasis.", evidence: "Observed at / · Step 4: Filter", persona: "first-time", step: 3, action: "Looked for a way to review completed work", result: "Filter links appeared quietly beneath the task list", elapsed: "42 ms", reproduce: ["Add two tasks", "Complete one task", "Look for a completed-work view"] },
];

const findingCategories = ["All", "Feedback", "Navigation", "Accessibility"] as const;

function Icon({ name }: { name: "grid" | "users" | "flag" | "board" | "arrow" | "play" | "plus" | "minus" }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2.2-6 6-6s6 2 6 6"/><path d="M16 5.5a3 3 0 0 1 0 5.8M16.5 14c3 .2 4.5 2.2 4.5 5"/></>,
    flag: <><path d="M5 21V4"/><path d="M5 5h12l-2.5 4L17 13H5"/></>,
    board: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16M3 10h18"/></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    play: <path d="m9 7 8 5-8 5Z"/>,
    plus: <path d="M12 5v14M5 12h14"/>,
    minus: <path d="M5 12h14"/>,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

const shotNames = ["01-orient", "02-enter", "03-primary-task", "04-review", "05-recover"];

function MiniShot({ step, tint = "blue", persona = "first-time" }: { step: number; tint?: string; persona?: string }) {
  const src = `/demo/todomvc/${persona}/${shotNames[Math.max(0, Math.min(4, step))]}.jpg`;
  return <div className={`mini-shot tint-${tint}`} aria-label={`Screenshot of journey step ${step}`}>
    <img src={src} alt={`${persona} tester evidence at ${journey[Math.max(0, Math.min(4, step))]}`}/>
  </div>;
}

function Avatar({ persona, small = false }: { persona: (typeof personas)[number]; small?: boolean }) {
  return <span className={`avatar ${small ? "avatar-small" : ""}`} style={{ "--persona": persona.color } as React.CSSProperties}>{persona.short}</span>;
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [phase, setPhase] = useState(6);
  const [selectedFinding, setSelectedFinding] = useState(1);
  const [mode, setMode] = useState<RunMode>("preview");
  const [targetUrl, setTargetUrl] = useState("https://demo.playwright.dev/todomvc/");
  const [repository, setRepository] = useState("");
  const [liveRun, setLiveRun] = useState<LiveRun | null>(null);
  const [history, setHistory] = useState<LiveRun[]>([]);
  const [results, setResults] = useState<EvidenceStudy | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState("preview");
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState("");
  const [presentationStep, setPresentationStep] = useState<number | null>(null);
  const liveRunId = liveRun?.id;
  const liveRunSeeded = liveRun?.seeded;
  const liveRunCompletedAt = liveRun?.completedAt;
  const liveTargetName = liveRun?.targetName;
  const liveTargetUrl = liveRun?.targetUrl;

  useEffect(() => {
    if (phase < 1 || phase >= 6) return;
    const timer = window.setTimeout(() => {
      setPhase((value) => value + 1);
      if (phase === 5) setView("overview");
    }, 850);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    let active = true;
    void fetch("/api/runs").then(async (response) => response.ok ? response.json() : null).then((payload) => {
      if (!active) return;
      const runs = runList(payload).filter((run) => run.id !== "seeded-todomvc-preview");
      setHistory(runs);
      const featured = runs.find((run) => run.id === "seeded-hesta-health-study") ?? runs.find((run) => run.id === "seeded-saucedemo-showcase");
      const params = new URLSearchParams(window.location.search);
      const requestedSession = params.get("session");
      const requestedView = params.get("view") as View | null;
      const initialView = requestedView && validViews.includes(requestedView) ? requestedView : "overview";
      const requestedRun = runs.find((run) => run.id === requestedSession);
      setView(initialView);
      if (requestedSession === "preview") {
        setMode("preview");
        setSelectedSessionId("preview");
      } else if (requestedRun ?? featured) {
        const chosen = requestedRun ?? featured!;
        setMode("live");
        setLiveRun(chosen);
        setSelectedSessionId(chosen.id);
        setTargetUrl(chosen.targetUrl);
        setRepository(chosen.repository ?? (chosen.id === "seeded-saucedemo-showcase" ? "saucelabs/sample-app-web" : ""));
        shareState(chosen.id, initialView);
      }
    }).catch(() => { /* Preview remains available when persistence is offline. */ });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!liveRunId || liveRunSeeded || liveRunId === "seeded-saucedemo-showcase") return;
    const stream = new EventSource(`/api/runs/${liveRunId}/events`);
    const updateSnapshot = (event: MessageEvent<string>) => {
      try { setLiveRun(JSON.parse(event.data) as LiveRun); } catch { /* Ignore malformed transient frames. */ }
    };
    const updateTester = (event: MessageEvent<string>) => {
      try {
        const next = JSON.parse(event.data) as { testerId: string; status?: LiveStatus; label: string; id: string; at: string };
        setLiveRun((run) => run ? {
          ...run,
          testers: run.testers.map((tester) => tester.id === next.testerId ? {
            ...tester,
            status: next.status ?? tester.status,
            currentActivity: next.label,
            events: [...tester.events.filter((item) => item.id !== next.id), next].slice(-20),
          } : tester),
        } : run);
      } catch { /* The next snapshot remains authoritative. */ }
    };
    stream.addEventListener("run.snapshot", updateSnapshot as EventListener);
    stream.addEventListener("tester.updated", updateTester as EventListener);
    return () => stream.close();
  }, [liveRunId, liveRunSeeded]);

  useEffect(() => {
    if (!liveRunId || !liveTargetName || !liveTargetUrl) return;
    let active = true;
    void fetch(`/api/runs/${liveRunId}/results`).then(async (response) => response.ok ? response.json() : null).then((payload) => {
      const next = studyResult(payload, { id: liveRunId, targetName: liveTargetName, targetUrl: liveTargetUrl });
      if (active && next) setResults(next);
    }).catch(() => { /* Results can arrive after the next SSE snapshot. */ });
    return () => { active = false; };
  }, [liveRunId, liveRunCompletedAt, liveTargetName, liveTargetUrl]);

  function runDemo() {
    setRunError("");
    setLiveRun(null);
    setResults(null);
    setSelectedSessionId("preview");
    setPhase(1);
    setView("testers");
    setPresentationStep(null);
    shareState("preview", "testers");
  }

  function newStudy() {
    setMode("live");
    setLiveRun(null);
    setResults(null);
    setSelectedSessionId("new");
    setRunError("");
    setPhase(0);
    setView("overview");
    setPresentationStep(null);
    shareState("new", "overview");
  }

  function openPreview() {
    setMode("preview");
    setLiveRun(null);
    setResults(null);
    setSelectedSessionId("preview");
    setRunError("");
    setPhase(6);
    setTargetUrl("https://demo.playwright.dev/todomvc/");
    setRepository("");
    setView("overview");
    setPresentationStep(null);
    shareState("preview", "overview");
  }

  function openSession(run: LiveRun) {
    setMode("live");
    setLiveRun(run);
    setResults(null);
    setSelectedSessionId(run.id);
    setRunError("");
    setTargetUrl(run.targetUrl);
    setRepository(run.repository ?? (run.id === "seeded-saucedemo-showcase" ? "saucelabs/sample-app-web" : ""));
    setView("overview");
    setPresentationStep(null);
    shareState(run.id, "overview");
  }

  async function runLive() {
    setStarting(true);
    setRunError("");
    try {
      const response = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUrl, ...(repository.trim() ? { repository: repository.trim() } : {}) }),
      });
      const body = await response.json() as LiveRun | { error?: string };
      if (!response.ok) throw new Error("error" in body && body.error ? body.error : "The live study could not start");
      const next = body as LiveRun;
      setLiveRun(next);
      setResults(null);
      setSelectedSessionId(next.id);
      setHistory((runs) => [next, ...runs.filter((run) => run.id !== next.id)]);
      setView("testers");
      shareState(next.id, "testers");
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "The live study could not start");
    } finally {
      setStarting(false);
    }
  }

  const previewRunning = phase > 0 && phase < 6;
  const liveRunning = Boolean(liveRun?.testers.some((tester) => !["completed", "partial", "failed"].includes(tester.status)));
  const running = mode === "preview" ? previewRunning : starting || liveRunning;
  const studyStatus = mode === "preview"
    ? phase === 0 ? "Ready to run" : previewRunning ? "Study in progress" : "Study complete"
    : starting ? "Starting four testers" : liveRunning ? "Study in progress" : liveRun ? "Study complete" : "Ready for live run";
  const targetName = (() => { try { return new URL(targetUrl).hostname; } catch { return "New product"; } })();
  const activeFinding = findings.find((finding) => finding.id === selectedFinding) ?? findings[0];
  const featuredEvidence = liveRun?.seeded || liveRun?.id === "seeded-saucedemo-showcase";
  const presentationFinding = results?.findings.find((finding) => finding.severity === "critical" || finding.severity === "high") ?? results?.findings[0];
  const presentationNodeId = presentationFinding ? `${presentationFinding.testerId}-${presentationFinding.stepId}` : undefined;

  function changeView(next: View) {
    setView(next);
    shareState(selectedSessionId, next);
  }

  function startPresentation() {
    setPresentationStep(0);
    changeView("overview");
  }

  function advancePresentation() {
    if (presentationStep === null) return;
    if (presentationStep >= 2) {
      setPresentationStep(null);
      return;
    }
    const next = presentationStep + 1;
    setPresentationStep(next);
    changeView(next === 1 ? "findings" : "board");
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">TR</span><span>TrialRoom<small>Research workspace</small></span></div>
      <nav aria-label="Study views">{([
        ["overview", "grid", "Overview"], ["testers", "users", "Live testers"], ["findings", "flag", "Findings"], ["board", "board", "Journey board"],
      ] as const).map(([id, icon, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => { setPresentationStep(null); changeView(id); }}><Icon name={icon}/>{label}{id === "findings" && <span className="nav-count">{mode === "live" && results ? Math.max(results.clusters.length, results.findings.length) : 3}</span>}</button>)}</nav>
      <section className="sessions"><div className="sessions-title"><span className="eyebrow">Past sessions</span><button onClick={newStudy}>New study</button></div>{history.slice(0, 3).map((run) => <button className={`session-row ${selectedSessionId === run.id ? "selected" : ""}`} key={run.id} onClick={() => openSession(run)}><i className={`session-swatch ${run.completedAt ? "complete" : "live"}`}/><span><strong>{run.targetName}</strong><small>{run.seeded || run.id === "seeded-saucedemo-showcase" ? "Featured evidence" : run.completedAt ? "Completed" : "Live or partial"} · {new Date(run.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></span></button>)}<button className={`session-row ${selectedSessionId === "preview" ? "selected" : ""}`} onClick={openPreview}><i className="session-swatch preview"/><span><strong>TodoMVC product pass</strong><small>Seeded preview · Complete</small></span></button></section>
      <div className="sidebar-study"><span className="eyebrow">Current study</span><strong>{targetName} product pass</strong><span><i className={running ? "status-dot live" : "status-dot"}/>{studyStatus}</span></div>
      <div className="sidebar-foot"><span className="status-dot live"/>{liveRun ? Math.max(0, 4 - liveRun.activeSandboxCount) : 4} sandbox slots available</div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><span className="eyebrow">Synthetic product study · {mode === "preview" ? "Preview data" : featuredEvidence ? "Seeded evidence" : "Live Sparkles"}</span><h1>{view === "overview" ? "The room at a glance" : view === "testers" ? "Four perspectives, live" : view === "findings" ? "Evidence worth acting on" : "Every journey, in context"}</h1></div><div className="topbar-actions">{featuredEvidence && liveRun?.completedAt && <button className="present-button" onClick={startPresentation} disabled={!results}><Icon name="play"/>{results ? "Present study" : "Loading evidence"}</button>}<button className="run-button" onClick={mode === "preview" ? runDemo : featuredEvidence ? newStudy : runLive} disabled={running}><Icon name="play"/>{mode === "preview" ? previewRunning ? `Running · ${phase}/5` : phase === 6 ? "Run preview again" : "Run preview" : featuredEvidence ? "Start new study" : starting ? "Starting four rooms" : liveRunning ? "Study running" : liveRun ? "Run live again" : "Run live study"}<span><Icon name="arrow"/></span></button></div></header>
      {presentationStep !== null && <section className="presentation-rail" aria-label="Captured evidence presentation"><div><span className="eyebrow">Captured evidence presentation · {presentationStep + 1} / 3</span><strong>{presentationStep === 0 ? "Begin with the study readout" : presentationStep === 1 ? "Inspect the highest-priority finding" : "See the evidence moment in context"}</strong><small>Replaying a completed {liveRun?.targetName ?? "product"} study. No new testing is running.</small></div><div className="presentation-progress" aria-hidden="true">{[0, 1, 2].map((step) => <i className={step <= presentationStep ? "active" : ""} key={step}/>)}</div><button className="presentation-close" onClick={() => setPresentationStep(null)}>Close</button><button className="presentation-next" onClick={advancePresentation}>{presentationStep === 2 ? "Finish" : "Next"}<Icon name="arrow"/></button></section>}
      <section className="run-strip" aria-label="Study target"><label><span>Product URL</span><input type="url" value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} disabled={running}/></label><label><span>Source repository <i>optional</i></span><input value={repository} onChange={(event) => setRepository(event.target.value)} placeholder="owner/repository" disabled={running}/></label><div className="run-mode" aria-label="Study mode"><button className={mode === "preview" ? "selected" : ""} onClick={() => { setMode("preview"); setRunError(""); }}>Preview</button><button className={mode === "live" ? "selected" : ""} onClick={() => { setMode("live"); setRunError(""); }}>Live</button></div></section>
      {runError && <div className="run-error" role="alert"><span><b>Live study did not start.</b>{runError}. Choose Preview to explore the full study.</span><button onClick={() => { setMode("preview"); setRunError(""); }}>Use preview</button></div>}
      {view === "overview" && (mode === "live" ? <LiveOverview run={liveRun} study={results}/> : <Overview phase={phase}/>)}
      {view === "testers" && <LiveTesters phase={phase} run={mode === "live" ? liveRun : null} study={mode === "live" ? results : null}/>}
      {view === "findings" && (mode === "live" ? results ? <LiveFindings study={results} repository={repository || (liveRun?.id === "seeded-saucedemo-showcase" ? "saucelabs/sample-app-web" : "")} targetUrl={targetUrl} focusFindingId={presentationStep === 1 ? presentationFinding?.id : undefined}/> : <LiveEvidencePending kind="findings" run={liveRun}/> : <Findings active={activeFinding} select={setSelectedFinding}/>)}
      {view === "board" && (mode === "live" ? results ? <JourneyBoard key={presentationStep === 2 ? "presenting" : "standard"} study={results} spotlightNodeId={presentationStep === 2 ? presentationNodeId : undefined}/> : <LiveEvidencePending kind="board" run={liveRun}/> : <JourneyBoard/>)}
    </section>
  </main>;
}

function Overview({ phase }: { phase: number }) {
  const complete = phase === 6;
  return <div className="view overview-view">
    <section className="health-panel"><div className="health-number"><span>Product health <i>heuristic</i></span><strong>{complete ? "97" : "—"}<small>/100</small></strong></div><div className="health-summary"><span className="eyebrow">Readout 01</span><h2>{complete ? "The core flow is resilient. Feedback and focus need a pass." : "Run the room to reveal where people hesitate."}</h2><p>{complete ? "All four testers completed every bounded step. Two independently hit the same silent empty-input state, and the keyboard path lacked visible focus." : "Four independent testers will follow the same core journey from a different point of view."}</p></div><div className="health-meter" style={{ "--score": complete ? "97%" : "0%" } as React.CSSProperties}><span/></div></section>
    <section className="evidence-ribbon"><div className="ribbon-label"><span className="eyebrow">Shared moment</span><strong>{complete ? "2 / 4 testers saw silent rejection" : "Evidence contact sheet"}</strong><small>{complete ? "Step 5 · Recover" : "Screenshots appear as the study runs"}</small></div>{[0, 1, 2, 3].map((item) => <div className="ribbon-frame" key={item}><MiniShot step={complete ? 4 : 0} tint={item === 1 ? "coral" : item === 2 ? "green" : item === 3 ? "lilac" : "blue"} persona={personas[item].asset}/><span>{complete ? personas[item].short : `0${item + 1}`}</span></div>)}</section>
    <div className="overview-grid"><section className="metrics-block"><div className="section-heading"><span><span className="eyebrow">Study pulse</span><h2>Journey outcomes</h2></span><small>{complete ? "20 evidence moments captured" : "Awaiting first run"}</small></div><div className="metric-row"><div><strong>{complete ? "4/4" : "—"}</strong><span>Testers completed</span></div><div><strong>{complete ? "100%" : "—"}</strong><span>Journey completion</span></div><div><strong>{complete ? "00" : "—"}</strong><span>High-severity findings</span></div></div><Matrix complete={complete}/></section>
      <section className="hotspot-block"><div className="section-heading"><span><span className="eyebrow">Priority queue</span><h2>Friction hotspots</h2></span><button>View all</button></div>{complete ? <><button className="hotspot"><span className="severity medium">M</span><span><strong>Empty submission has no visible feedback</strong><small>Recover · 2 testers · 2 evidence items</small></span><Icon name="arrow"/></button><button className="hotspot"><span className="severity medium">M</span><span><strong>Keyboard focus is invisible</strong><small>Complete + Filter · 1 tester · 2 evidence items</small></span><Icon name="arrow"/></button></> : <div className="empty-inline"><span>○</span><p>No signals yet.<br/>Run the demo to populate this view.</p></div>}</section></div>
  </div>;
}

function Matrix({ complete }: { complete: boolean }) {
  return <div className="matrix"><div className="matrix-head"><span/>{journey.map((step) => <b key={step}>{step}</b>)}</div>{personas.map((persona, row) => <div className="matrix-row" key={persona.id}><span><Avatar persona={persona} small/><strong>{persona.short}</strong></span>{journey.map((_, col) => <i key={col} className={complete ? seedFriction(row, col) ? "friction" : "pass" : "pending"}>{complete ? seedFriction(row, col) ? "!" : "✓" : "·"}</i>)}</div>)}</div>;
}

function LiveOverview({ run, study }: { run: LiveRun | null; study: EvidenceStudy | null }) {
  const completed = run?.testers.filter((tester) => tester.status === "completed").length ?? 0;
  const failed = run?.testers.filter((tester) => tester.status === "failed" || tester.status === "partial").length ?? 0;
  const active = run?.testers.filter((tester) => tester.status === "booting" || tester.status === "running").length ?? 0;
  const high = study?.findings.filter((finding) => finding.severity === "high" || finding.severity === "critical").length ?? 0;
  const penalty = study?.findings.reduce((total, finding) => total + (finding.severity === "critical" ? 15 : finding.severity === "high" ? 8 : finding.severity === "medium" ? 3 : 1), 0) ?? 0;
  const health = study ? Math.max(0, 100 - penalty) : completed * 25;
  const priority = study?.findings.find((finding) => finding.severity === "critical" || finding.severity === "high") ?? study?.findings[0];
  const shared = study?.clusters[0];
  const snapshots = study?.testers.map((tester) => tester.journey.find((step) => step.observationCount)?.screenshot ?? tester.journey.at(-1)?.screenshot) ?? [];
  return <div className="view overview-view">
    <section className="health-panel live-health"><div className="health-number"><span>Product health <i>heuristic</i></span><strong>{run ? health : "—"}<small>/100</small></strong></div><div className="health-summary"><span className="eyebrow">{run?.seeded ? "Verified showcase" : "Sparkles run"}</span><h2>{!run ? "Set the target, then open four independent rooms." : study && priority ? priority.observation.summary : run.completedAt ? "Collection finished. The evidence is ready for synthesis." : `${active || 4} perspectives are moving through the product.`}</h2><p>{!run ? "Live mode creates real sandboxes. Preview stays available when server credentials are not configured." : study ? `${completed} testers completed ${study.testers.reduce((sum, tester) => sum + tester.journey.length, 0)} captured moments. ${shared ? `${shared.affectedCount} / ${shared.totalTesters} independently reported the leading shared signal.` : "No repeated signal was inferred."}` : `${completed} complete · ${active} active · ${failed} partial or failed. Raw tool noise stays out of the workspace.`}</p></div><div className="health-meter" style={{ "--score": `${health}%` } as React.CSSProperties}><span/></div></section>
    {study && <section className="evidence-ribbon"><div className="ribbon-label"><span className="eyebrow">Shared moment</span><strong>{shared ? `${shared.affectedCount} / ${shared.totalTesters} · ${shared.title}` : "Independent journeys complete"}</strong><small>{study.findings.length} findings · {study.testers.reduce((sum, tester) => sum + tester.journey.length, 0)} screenshots</small></div>{snapshots.map((shot, index) => <div className="ribbon-frame" key={personas[index]?.id ?? index}>{shot?.url ? <img src={shot.url} alt={shot.label || `${personas[index]?.name} evidence`}/> : <span>No image</span>}<span>{personas[index]?.short}</span></div>)}</section>}
    {study ? <div className="overview-grid"><section className="metrics-block"><div className="section-heading"><span><span className="eyebrow">Study pulse</span><h2>Evidence inventory</h2></span><small>Deterministic aggregation</small></div><div className="metric-row"><div><strong>{completed}/4</strong><span>Testers completed</span></div><div><strong>{study.findings.length}</strong><span>Findings captured</span></div><div><strong>{high}</strong><span>High-severity findings</span></div></div><section className="live-ledger"><div><span className="eyebrow">Run status</span><strong>{run?.targetName}</strong><small>{run ? `Run ${run.id.slice(0, 18)} · ${run.activeSandboxCount} active sandboxes` : ""}</small></div>{personas.map((persona, index) => <span className="ledger-persona" key={persona.id} style={{ "--persona": persona.color } as React.CSSProperties}><Avatar persona={persona} small/><b>{run?.testers[index]?.status ?? "ready"}</b></span>)}</section></section><section className="hotspot-block"><div className="section-heading"><span><span className="eyebrow">Priority queue</span><h2>Evidence hotspots</h2></span><small>{study.clusters.length} clusters</small></div>{study.clusters.slice(0, 3).map((cluster) => <div className="hotspot" key={cluster.id}><span className={`severity ${cluster.severity.toLowerCase()}`}>{cluster.severity.slice(0, 1).toUpperCase()}</span><span><strong>{cluster.title}</strong><small>{cluster.affectedCount} / {cluster.totalTesters} testers · {cluster.findingIds.length} evidence item{cluster.findingIds.length === 1 ? "" : "s"}</small></span><Icon name="arrow"/></div>)}</section></div> : <section className="live-ledger"><div><span className="eyebrow">Run status</span><strong>{run ? run.targetName : "No live run yet"}</strong><small>{run ? `Run ${run.id.slice(0, 12)} · ${run.activeSandboxCount} active sandboxes` : "The four-slot limit is enforced server-side."}</small></div></section>}
  </div>;
}

function LiveEvidencePending({ kind, run }: { kind: "findings" | "board"; run: LiveRun | null }) {
  const complete = Boolean(run?.completedAt);
  return <div className="view live-evidence-empty"><span className="eyebrow">Live evidence</span><strong>{!run ? "Start a live study first" : complete ? "Journey collection is complete" : "Evidence is still arriving"}</strong><p>{kind === "board" ? "The Journey Board will replace these placeholders as screenshot artifacts are ingested." : "Clustered findings appear only after real tester results are normalized. Preview mode shows the complete dashboard story now."}</p></div>;
}

function LiveTesters({ phase, run, study }: { phase: number; run: LiveRun | null; study: EvidenceStudy | null }) {
  const terminal = run ? run.testers.every((tester) => ["completed", "partial", "failed"].includes(tester.status)) : phase >= 6;
  const active = run ? run.testers.some((tester) => tester.status === "booting" || tester.status === "running") : phase > 0 && phase < 6;
  return <div className="view live-view"><div className="view-intro"><p>Each tester runs in an isolated sandbox. Activity is translated into meaningful study moments, not terminal noise.</p><span>{terminal ? "Complete" : active ? "Live now" : "Ready"}<i className={active ? "pulse" : ""}/></span></div><div className="tester-grid">{personas.map((persona, index) => {
    const tester = run?.testers[index];
    const progress = tester ? tester.status === "completed" || tester.status === "partial" || tester.status === "failed" ? 100 : tester.status === "running" ? Math.min(88, 24 + tester.events.length * 10) : tester.status === "booting" ? 10 : 0 : phase === 0 ? 0 : Math.min(100, Math.max(8, (phase - index * .3) * 20));
    const done = tester ? tester.status === "completed" : progress >= 100;
    const status = tester?.status ?? (done ? "completed" : progress ? "running" : "queued");
    const events = tester?.events.slice(-3) ?? [];
    const evidenceJourney = study?.testers.find((item) => item.id === tester?.id)?.journey;
    const latestShot = evidenceJourney?.at(-1)?.screenshot;
    return <article className="tester-card" key={persona.id} style={{ "--persona": persona.color } as React.CSSProperties}><div className="tester-top"><Avatar persona={persona}/><div><span>Tester {String(index + 1).padStart(2, "0")}{tester?.id ? ` · ${tester.id}` : ""}</span><h2>{persona.name}</h2></div><b className={`tester-status status-${status}`}>{status}</b></div>{latestShot?.url ? <div className="latest-shot"><img src={latestShot.url} alt={latestShot.label || `${persona.name} latest evidence`}/><span>{evidenceJourney?.length ?? 0} captured moments · complete</span></div> : run ? <div className="latest-shot live-pending"><span className="live-frame-mark">{tester?.sandboxId ? "ROOM CONNECTED" : "WAITING FOR ROOM"}</span><small>{tester?.sandboxId ? tester.sandboxId.slice(0, 18) : "Sandbox ID pending"}</small></div> : <div className="latest-shot"><MiniShot step={Math.min(4, Math.floor(progress / 22))} tint={index === 1 ? "coral" : index === 2 ? "green" : index === 3 ? "lilac" : "blue"} persona={persona.asset}/><span>Latest evidence · {progress ? "just now" : "—"}</span></div>}<div className="tester-activity"><span className="eyebrow">Current activity</span><strong>{tester?.currentActivity ?? (done ? "Journey complete" : progress ? persona.note : "Waiting for sandbox")}</strong><div className="progress"><i style={{ width: `${progress}%` }}/></div><small>{run ? `${tester?.events.length ?? 0} meaningful events` : `Step ${Math.max(1, Math.ceil(progress / 20))} of 5`} <em>{Math.round(progress)}%</em></small></div><div className="event-log">{run ? events.length ? events.map((event) => <span className="visible" key={event.id}><i/>{event.label}</span>) : <span><i/>Waiting for first event</span> : <><span><i/>Opened the product</span><span className={progress > 35 ? "visible" : ""}><i/>Captured first impression</span><span className={progress > 65 ? "visible" : ""}><i/>Found a point of friction</span></>}</div></article>;
  })}</div></div>;
}

function Findings({ active, select }: { active: (typeof findings)[number]; select: (id: number) => void }) {
  const [category, setCategory] = useState<(typeof findingCategories)[number]>("All");
  const visibleFindings = category === "All" ? findings : findings.filter((finding) => finding.category === category);
  const evidencePersona = personas.find((persona) => persona.asset === active.persona) ?? personas[0];
  function filterBy(next: (typeof findingCategories)[number]) {
    setCategory(next);
    const first = next === "All" ? findings[0] : findings.find((finding) => finding.category === next);
    if (first) select(first.id);
  }
  return <div className="view findings-view"><div className="filterbar"><span>{visibleFindings.length} of {findings.length} evidence-backed findings</span>{findingCategories.map((item) => <button key={item} className={category === item ? "selected" : ""} aria-pressed={category === item} onClick={() => filterBy(item)}>{item}</button>)}</div><div className="findings-layout"><section className="findings-list">{visibleFindings.length ? visibleFindings.map((finding) => <button key={finding.id} className={active.id === finding.id ? "finding-row active" : "finding-row"} onClick={() => select(finding.id)}><span className={`finding-index ${finding.severity.toLowerCase()}`}>{String(findings.indexOf(finding) + 1).padStart(2, "0")}</span><span><small>{finding.category} · {finding.severity} · {finding.count} tester{finding.count > 1 ? "s" : ""}</small><strong>{finding.title}</strong><p>{finding.detail}</p><em>{finding.evidence}</em></span><Icon name="arrow"/></button>) : <div className="findings-empty"><strong>No {category.toLowerCase()} findings</strong><p>Nothing in this study matches the selected category.</p><button onClick={() => filterBy("All")}>Clear filter</button></div>}</section>{visibleFindings.length > 0 && <aside className="finding-detail"><div className="detail-top"><span className={`severity ${active.severity.toLowerCase()}`}>{active.severity.slice(0, 1)}</span><span><small>{active.severity} severity</small><strong>{active.count} / 4 testers</strong></span></div><h2>{active.title}</h2><p>{active.detail}</p><div className="detail-shot"><MiniShot step={active.step} tint={active.persona === "impatient" ? "coral" : active.persona === "keyboard" ? "green" : "blue"} persona={evidencePersona.asset}/><button aria-label="Observation one">1</button>{active.count > 1 && <button aria-label="Observation two">2</button>}</div><span className="eyebrow">Browser evidence</span><div className="evidence-note"><b>Action</b><span>{active.action}</span><b>Result</b><span>{active.result}</span><b>Elapsed</b><span>{active.elapsed}</span></div><span className="eyebrow">Reproduce</span><ol>{active.reproduce.map((step) => <li key={step}>{step}</li>)}</ol></aside>}</div></div>;
}

function LiveFindings({ study, repository, targetUrl, focusFindingId }: { study: EvidenceStudy; repository: string; targetUrl: string; focusFindingId?: string }) {
  const rows = study.clusters.length ? study.clusters.map((cluster) => {
    const members = study.findings.filter((finding) => cluster.findingIds.includes(finding.id));
    const representative = members.find((finding) => finding.id === focusFindingId) ?? members[0];
    return { id: cluster.id, findingIds: cluster.findingIds, title: cluster.title, detail: cluster.summary, severity: cluster.severity, category: representative?.category ?? "uncategorized", count: cluster.affectedCount, finding: representative };
  }) : study.findings.map((finding) => ({ id: finding.id, findingIds: [finding.id], title: finding.observation.summary, detail: finding.observation.actual, severity: finding.severity, category: finding.category, count: 1, finding }));
  const categories = ["All", ...new Set(rows.map((row) => row.category))];
  const focused = rows.find((row) => row.findingIds.includes(focusFindingId ?? ""));
  const [category, setCategory] = useState(focused?.category ?? "All");
  const [selected, setSelected] = useState(focused?.id ?? rows[0]?.id ?? "");
  const [fixRequest, setFixRequest] = useState<{ findingId: string; state: "opening" | "launched" | "error"; sandboxId?: string; message?: string } | null>(null);
  const visibleRows = category === "All" ? rows : rows.filter((row) => row.category === category);
  const active = visibleRows.find((row) => row.id === selected) ?? visibleRows[0];
  const evidence = active?.finding?.evidence[0];
  function filterBy(next: string) {
    setCategory(next);
    const first = next === "All" ? rows[0] : rows.find((row) => row.category === next);
    if (first) setSelected(first.id);
  }
  async function launchFix() {
    if (!active?.finding || !repository || fixRequest?.state === "opening" || (fixRequest?.findingId === active.finding.id && fixRequest.state === "launched")) return;
    const finding = active.finding;
    setFixRequest({ findingId: finding.id, state: "opening" });
    try {
      const response = await fetch("/api/fixes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository, targetUrl, finding: { id: finding.id, title: active.title, severity: finding.severity, category: finding.category, observation: finding.observation, reproduction: finding.reproduction } }),
      });
      const body = await response.json() as { sandboxId?: string; error?: string };
      if (!response.ok || !body.sandboxId) throw new Error(body.error || "The fix room could not be opened");
      setFixRequest({ findingId: finding.id, state: "launched", sandboxId: body.sandboxId });
    } catch (error) {
      setFixRequest({ findingId: finding.id, state: "error", message: error instanceof Error ? error.message : "The fix room could not be opened" });
    }
  }
  if (!rows.length) return <div className="view live-evidence-empty"><span className="eyebrow">Live findings</span><strong>No friction was returned</strong><p>The completed tester results contain no findings, so TrialRoom is not inventing any.</p></div>;
  const activeFix = active?.finding && fixRequest?.findingId === active.finding.id ? fixRequest : null;
  return <div className="view findings-view"><div className="filterbar"><span>{visibleRows.length} of {rows.length} evidence-backed findings</span>{categories.map((item) => <button key={item} className={category === item ? "selected" : ""} aria-pressed={category === item} onClick={() => filterBy(item)}>{item === "All" ? item : item.replace(/(^|-)([a-z])/g, (_, separator, letter: string) => `${separator}${letter.toUpperCase()}`)}</button>)}</div><div className="findings-layout"><section className="findings-list">{visibleRows.length ? visibleRows.map((row) => <button key={row.id} className={active?.id === row.id ? "finding-row active" : "finding-row"} onClick={() => setSelected(row.id)}><span className={`finding-index ${row.severity.toLowerCase()}`}>{String(rows.indexOf(row) + 1).padStart(2, "0")}</span><span><small>{row.category} · {row.severity} · {row.count} tester{row.count === 1 ? "" : "s"}</small><strong>{row.title}</strong><p>{row.detail}</p><em>{row.finding ? `${row.finding.route} · ${row.finding.stepId}` : "Clustered tester evidence"}</em></span><Icon name="arrow"/></button>) : <div className="findings-empty"><strong>No {category} findings</strong><p>Nothing in this study matches the selected category.</p><button onClick={() => filterBy("All")}>Clear filter</button></div>}</section>{active && <aside className="finding-detail"><div className="detail-top"><span className={`severity ${active.severity.toLowerCase()}`}>{active.severity.slice(0, 1).toUpperCase()}</span><span><small>{active.severity} severity</small><strong>{active.count} / {study.testers.length} testers</strong></span></div><h2>{active.title}</h2><p>{active.detail}</p><div className="detail-shot live-detail-shot">{evidence?.screenshot?.url ? <img src={evidence.screenshot.url} alt={evidence.screenshot.label || `Evidence for ${active.title}`}/> : <span>No screenshot URL returned</span>}</div>{active.finding && <><span className="eyebrow">Browser evidence</span><div className="evidence-note"><b>Page</b><span>{evidence?.pageUrl ?? active.finding.route}</span><b>Action</b><span>{evidence?.attemptedAction ?? "Not recorded"}</span><b>Observed</b><span>{active.finding.observation.actual}</span></div><span className="eyebrow">Reproduce</span><ol>{active.finding.reproduction.map((step) => <li key={step}>{step}</li>)}</ol><div className="fix-launch"><div><span className="eyebrow">Sparkles fix room</span><p>{activeFix?.state === "launched" ? `Sandbox ${activeFix.sandboxId?.slice(0, 12)} launched with this evidence.` : activeFix?.state === "error" ? activeFix.message : repository ? `Uses ${repository}. No code or pull request is merged automatically.` : "Add a source repository above to enable a fix room."}</p></div><button onClick={launchFix} disabled={!repository || activeFix?.state === "opening" || activeFix?.state === "launched"}>{activeFix?.state === "opening" ? "Opening Sparkles room" : activeFix?.state === "launched" ? "Fix room launched" : "Fix now"}<Icon name="arrow"/></button></div></>}</aside>}</div></div>;
}

type MomentData = {
  friction: boolean;
  live?: boolean;
  screenshotUrl?: string;
  outcome?: string;
  observationCount?: number;
  observation?: string;
  evidence?: string;
  reproduction?: string[];
  personaName?: string;
  personaIndex: number;
  stepIndex: number;
  tint: string;
  title: string;
};

type LaneData = { persona: (typeof personas)[number]; moments?: number };
type MomentNode = Node<MomentData, "moment">;
type LaneNode = Node<LaneData, "lane">;
type BoardNode = MomentNode | LaneNode;

function MomentCard({ data, selected }: NodeProps<MomentNode>) {
  return <article className={`journey-node ${data.friction ? "node-friction" : ""} ${selected ? "node-selected" : ""}`}>
    <Handle type="target" position={Position.Left} className="flow-handle"/>
    {data.live ? data.screenshotUrl ? <img className="journey-image" src={data.screenshotUrl} alt={`Captured ${data.title} step`}/> : <div className="journey-image missing">No screenshot returned</div> : <MiniShot step={data.stepIndex} tint={data.tint} persona={personas[data.personaIndex].asset}/>}
    <span><b>{data.title}</b><small>{data.live ? `${data.outcome ?? "pending"}${data.observationCount ? ` · ${data.observationCount} note` : ""}` : data.friction ? "Friction · 1 note" : "Passed"}</small></span>
    {Boolean(data.observationCount ?? (data.friction ? 1 : 0)) && <i>{data.observationCount ?? 1}</i>}
    <Handle type="source" position={Position.Right} className="flow-handle"/>
  </article>;
}

function PersonaLane({ data }: NodeProps<LaneNode>) {
  return <div className="journey-lane" style={{ "--persona": data.persona.color } as React.CSSProperties}>
    <div className="lane-label"><Avatar persona={data.persona}/><span><strong>{data.persona.name}</strong><small>{data.moments ?? 5} captured moments</small></span></div>
    <span className="lane-rule"/>
  </div>;
}

function JourneyEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd }: EdgeProps) {
  const [path] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 14 });
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} className="journey-edge"/>;
}

const tintNames = ["blue", "coral", "green", "lilac"];
const seedFriction = (row: number, col: number) => (row === 0 && col === 3) || (row === 1 && col === 4) || (row === 2 && (col === 2 || col === 3)) || (row === 3 && col === 4);
const seedObservation = (row: number, col: number) => row === 0 && col === 3
  ? "The completed-work filters were easy to overlook beneath the item count."
  : row === 1 && col === 4 || row === 3 && col === 4
    ? "The empty submission was safely ignored, but no visible feedback explained why."
    : row === 2 && (col === 2 || col === 3)
      ? "The control was keyboard-operable, but its focused state had no visible outline or shadow."
      : undefined;
const boardNodes: BoardNode[] = personas.flatMap((persona, row) => [
  {
    id: `lane-${persona.id}`,
    type: "lane",
    position: { x: 18, y: row * 178 + 12 },
    data: { persona },
    draggable: false,
    selectable: false,
    focusable: false,
    zIndex: 0,
  } as LaneNode,
  ...journey.map((title, col) => ({
    id: `${persona.id}-${col}`,
    type: "moment" as const,
    position: { x: 235 + col * 233, y: row * 178 + 35 },
    data: { title, stepIndex: col, personaIndex: row, tint: tintNames[row], friction: seedFriction(row, col), observation: seedObservation(row, col) },
    draggable: false,
    zIndex: 2,
  })),
]);

const boardEdges: Edge[] = personas.flatMap((persona) => journey.slice(1).map((_, col) => ({
  id: `${persona.id}-edge-${col}`,
  source: `${persona.id}-${col}`,
  target: `${persona.id}-${col + 1}`,
  type: "journey",
  zIndex: 1,
})));

const nodeTypes = { lane: PersonaLane, moment: MomentCard };
const edgeTypes = { journey: JourneyEdge };

function JourneyBoard({ study, spotlightNodeId }: { study?: EvidenceStudy; spotlightNodeId?: string }) {
  const [flow, setFlow] = useState<ReactFlowInstance<BoardNode, Edge> | null>(null);
  const [zoom, setZoom] = useState(.82);
  const [selectedId, setSelectedId] = useState<string | null>(spotlightNodeId ?? null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const liveBoard = useMemo(() => {
    if (!study) return null;
    const nodes: BoardNode[] = study.testers.slice(0, 4).flatMap((tester, row) => {
      const persona = personas[row];
      return [{ id: `lane-${tester.id}`, type: "lane", position: { x: 18, y: row * 178 + 12 }, data: { persona, moments: tester.journey.length }, draggable: false, selectable: false, focusable: false, zIndex: 0 } as LaneNode,
        ...tester.journey.map((step, col) => {
          const finding = study.findings.find((item) => item.testerId === tester.id && item.stepId === step.id);
          const browserEvidence = finding?.evidence[0];
          return { id: `${tester.id}-${step.id}`, type: "moment" as const, position: { x: 235 + col * 233, y: row * 178 + 35 }, data: { title: step.title, stepIndex: col, personaIndex: row, personaName: persona.name, tint: tintNames[row], friction: step.outcome === "friction" || step.outcome === "fail", live: true, screenshotUrl: step.screenshot?.url, outcome: step.outcome, observationCount: step.observationCount, observation: finding?.observation.actual, reproduction: finding?.reproduction, evidence: browserEvidence?.attemptedAction ? `${browserEvidence.attemptedAction} · ${browserEvidence.pageUrl}` : browserEvidence?.pageUrl }, draggable: false, zIndex: 2 } as MomentNode;
        })];
    });
    const edges: Edge[] = study.testers.slice(0, 4).flatMap((tester) => tester.journey.slice(1).map((step, index) => ({ id: `${tester.id}-edge-${index}`, source: `${tester.id}-${tester.journey[index].id}`, target: `${tester.id}-${step.id}`, type: "journey", zIndex: 1 })));
    return { nodes, edges };
  }, [study]);
  const activeNodes = liveBoard?.nodes ?? boardNodes;
  const activeEdges = liveBoard?.edges ?? boardEdges;
  const selected = activeNodes.find((node): node is MomentNode => node.id === selectedId && node.type === "moment");
  const renderedNodes = activeNodes.map((node) => node.type === "moment" ? { ...node, selected: node.id === selectedId } : node);
  const observationTotal = study?.testers.reduce((total, tester) => total + tester.journey.reduce((sum, step) => sum + step.observationCount, 0), 0) ?? 5;
  const momentTotal = study?.testers.reduce((total, tester) => total + tester.journey.length, 0) ?? 20;

  useEffect(() => {
    if (!selected) return;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selected]);

  return <div className="view board-view">
    <div className="board-toolbar"><span><b>{study?.targetName ?? "TodoMVC"} study</b><small>{study?.testers.length ?? 4} journeys · {momentTotal} moments · {observationTotal} observations</small></span><div className="board-controls">
      <button onClick={() => flow?.zoomOut({ duration: 180 })} aria-label="Zoom out"><Icon name="minus"/></button>
      <b>{Math.round(zoom * 100)}%</b>
      <button onClick={() => flow?.zoomIn({ duration: 180 })} aria-label="Zoom in"><Icon name="plus"/></button>
      <button className="fit-button" onClick={() => flow?.fitView({ padding: .04, duration: 260 })}>Fit board</button>
    </div></div>
    <div className="board-canvas">
      <ReactFlow<BoardNode, Edge>
        nodes={renderedNodes}
        edges={activeEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onInit={setFlow}
        onMove={(_, viewport) => setZoom(viewport.zoom)}
        onNodeClick={(_, node) => setSelectedId(node.type === "moment" ? node.id : null)}
        onPaneClick={() => setSelectedId(null)}
        fitView
        fitViewOptions={{ padding: .04 }}
        minZoom={.48}
        maxZoom={1.45}
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        zoomOnDoubleClick={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#b8c0b8"/>
      </ReactFlow>
    </div>
    {selected && <div className="spotlight-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(null); }}><aside className="moment-spotlight" role="dialog" aria-modal="true" aria-labelledby="moment-spotlight-title"><button ref={closeButton} className="close" onClick={() => setSelectedId(null)} aria-label="Close screenshot spotlight">×</button><div className="spotlight-visual">{selected.data.live ? selected.data.screenshotUrl ? <img src={selected.data.screenshotUrl} alt={`Captured ${selected.data.title} step`}/> : <div className="missing">No screenshot returned</div> : <MiniShot step={selected.data.stepIndex} tint={selected.data.tint} persona={personas[selected.data.personaIndex].asset}/>}</div><div className="spotlight-copy"><span className="eyebrow">Captured journey moment</span><h2 id="moment-spotlight-title">{selected.data.title}</h2><p className="spotlight-persona">{selected.data.personaName ?? personas[selected.data.personaIndex].name} · <b>{selected.data.live ? selected.data.outcome ?? "recorded" : selected.data.friction ? "friction" : "passed"}</b></p><span className="eyebrow">Observation</span><p>{selected.data.live ? selected.data.observation ?? `${selected.data.observationCount ?? 0} observations attached to this moment.` : selected.data.observation ?? "The tester moved through this step without observable friction."}</p>{selected.data.evidence && <><span className="eyebrow">Browser evidence</span><p className="spotlight-evidence">{selected.data.evidence}</p></>}{selected.data.reproduction?.length ? <><span className="eyebrow">Reproduce</span><ol>{selected.data.reproduction.map((step) => <li key={step}>{step}</li>)}</ol></> : null}</div></aside></div>}
  </div>;
}
