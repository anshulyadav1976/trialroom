"use client";

import { useEffect, useState } from "react";

type View = "overview" | "testers" | "findings" | "board";

const personas = [
  { id: "first", short: "FT", name: "First-time user", color: "#426bff", note: "Looking for a clear next step" },
  { id: "fast", short: "IM", name: "Impatient user", color: "#ef704f", note: "Retried the primary action" },
  { id: "keys", short: "KB", name: "Keyboard user", color: "#138a76", note: "Tabbing through the task list" },
  { id: "edge", short: "EC", name: "Edge-case user", color: "#a45ad3", note: "Testing an empty task" },
] as const;

const journey = ["Arrive", "Orient", "Create task", "Complete", "Review"];

const findings = [
  { id: 1, severity: "High", count: 3, title: "The primary action disappears after the first task", detail: "Three testers paused at the same point because the input collapses into the task list without a persistent create action.", evidence: "Observed at / · Step 3: Create task" },
  { id: 2, severity: "Medium", count: 2, title: "Completion state relies on color alone", detail: "The completed task becomes faint, but no visible label confirms that the action succeeded.", evidence: "Observed at / · Step 4: Complete" },
  { id: 3, severity: "Low", count: 1, title: "Empty submission has no explanation", detail: "The interface ignores an empty task submission without feedback or focus recovery.", evidence: "Observed at / · Step 3: Create task" },
];

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

function MiniShot({ step, tint = "blue" }: { step: number; tint?: string }) {
  return <div className={`mini-shot tint-${tint}`} aria-label={`Screenshot of journey step ${step}`}>
    <div className="browser-bar"><i/><i/><i/><span>demo.playwright.dev</span></div>
    <div className="mock-page"><b>{step < 2 ? "todos" : step === 2 ? "What needs doing?" : "My tasks"}</b>{step > 1 && <><em/><em/><em className="short"/></>}</div>
  </div>;
}

function Avatar({ persona, small = false }: { persona: (typeof personas)[number]; small?: boolean }) {
  return <span className={`avatar ${small ? "avatar-small" : ""}`} style={{ "--persona": persona.color } as React.CSSProperties}>{persona.short}</span>;
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [phase, setPhase] = useState(0);
  const [selectedFinding, setSelectedFinding] = useState(1);
  const [selectedNode, setSelectedNode] = useState<{ persona: number; step: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (phase < 1 || phase >= 6) return;
    const timer = window.setTimeout(() => {
      setPhase((value) => value + 1);
      if (phase === 5) setView("overview");
    }, 850);
    return () => window.clearTimeout(timer);
  }, [phase]);

  function runDemo() { setPhase(1); setView("testers"); }
  const activeFinding = findings.find((finding) => finding.id === selectedFinding) ?? findings[0];

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">TR</span><span>TrialRoom<small>Research workspace</small></span></div>
      <nav aria-label="Study views">{([
        ["overview", "grid", "Overview"], ["testers", "users", "Live testers"], ["findings", "flag", "Findings"], ["board", "board", "Journey board"],
      ] as const).map(([id, icon, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><Icon name={icon}/>{label}{id === "findings" && <span className="nav-count">3</span>}</button>)}</nav>
      <div className="sidebar-study"><span className="eyebrow">Current study</span><strong>TodoMVC product pass</strong><span><i className={phase > 0 ? "status-dot live" : "status-dot"}/>{phase === 0 ? "Ready to run" : phase < 6 ? "Study in progress" : "Study complete"}</span></div>
      <div className="sidebar-foot"><span className="status-dot live"/>4 sandbox slots available</div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><span className="eyebrow">Synthetic product study</span><h1>{view === "overview" ? "The room at a glance" : view === "testers" ? "Four perspectives, live" : view === "findings" ? "Evidence worth acting on" : "Every journey, in context"}</h1></div><button className="run-button" onClick={runDemo} disabled={phase > 0 && phase < 6}><Icon name="play"/>{phase > 0 && phase < 6 ? `Running · ${phase}/5` : phase === 6 ? "Run again" : "Run demo"}<span><Icon name="arrow"/></span></button></header>
      <section className="run-strip" aria-label="Study target"><label><span>Product URL</span><input defaultValue="https://demo.playwright.dev/todomvc/" /></label><label><span>Source repository <i>optional</i></span><input placeholder="github.com/your-org/product" /></label><div className="tester-stack" aria-label="Four tester personas">{personas.map((persona) => <Avatar key={persona.id} persona={persona} small/>)}</div></section>
      {view === "overview" && <Overview phase={phase}/>} 
      {view === "testers" && <LiveTesters phase={phase}/>} 
      {view === "findings" && <Findings active={activeFinding} select={setSelectedFinding}/>} 
      {view === "board" && <JourneyBoard zoom={zoom} setZoom={setZoom} selected={selectedNode} setSelected={setSelectedNode}/>} 
    </section>
  </main>;
}

function Overview({ phase }: { phase: number }) {
  const complete = phase === 6;
  return <div className="view overview-view">
    <section className="health-panel"><div className="health-number"><span>Product health <i>heuristic</i></span><strong>{complete ? "72" : "—"}<small>/100</small></strong></div><div className="health-summary"><span className="eyebrow">Readout 01</span><h2>{complete ? "The core flow works. Its next action does not announce itself." : "Run the room to reveal where people hesitate."}</h2><p>{complete ? "All four testers completed the journey. Three lost momentum immediately after creating their first task." : "Four independent testers will follow the same core journey from a different point of view."}</p></div><div className="health-meter" style={{ "--score": complete ? "72%" : "0%" } as React.CSSProperties}><span/></div></section>
    <section className="evidence-ribbon"><div className="ribbon-label"><span className="eyebrow">Shared moment</span><strong>{complete ? "3 / 4 testers struggled here" : "Evidence contact sheet"}</strong><small>{complete ? "Step 3 · Create task" : "Screenshots appear as the study runs"}</small></div>{[0, 1, 2, 3].map((item) => <div className="ribbon-frame" key={item}><MiniShot step={complete ? 2 + (item % 2) : 0} tint={item === 1 ? "coral" : item === 2 ? "green" : item === 3 ? "lilac" : "blue"}/><span>{complete ? personas[item].short : `0${item + 1}`}</span></div>)}</section>
    <div className="overview-grid"><section className="metrics-block"><div className="section-heading"><span><span className="eyebrow">Study pulse</span><h2>Journey outcomes</h2></span><small>{complete ? "Finished 2m 14s ago" : "Awaiting first run"}</small></div><div className="metric-row"><div><strong>{complete ? "4/4" : "—"}</strong><span>Testers completed</span></div><div><strong>{complete ? "92%" : "—"}</strong><span>Journey completion</span></div><div><strong>{complete ? "01" : "—"}</strong><span>High-severity finding</span></div></div><Matrix complete={complete}/></section>
      <section className="hotspot-block"><div className="section-heading"><span><span className="eyebrow">Priority queue</span><h2>Friction hotspots</h2></span><button>View all</button></div>{complete ? <><button className="hotspot"><span className="severity high">H</span><span><strong>Primary action disappears</strong><small>Create task · 3 testers · 4 evidence items</small></span><Icon name="arrow"/></button><button className="hotspot"><span className="severity medium">M</span><span><strong>Completion relies on color</strong><small>Complete · 2 testers · 3 evidence items</small></span><Icon name="arrow"/></button></> : <div className="empty-inline"><span>○</span><p>No signals yet.<br/>Run the demo to populate this view.</p></div>}</section></div>
  </div>;
}

function Matrix({ complete }: { complete: boolean }) {
  return <div className="matrix"><div className="matrix-head"><span/>{journey.map((step) => <b key={step}>{step}</b>)}</div>{personas.map((persona, row) => <div className="matrix-row" key={persona.id}><span><Avatar persona={persona} small/><strong>{persona.short}</strong></span>{journey.map((_, col) => <i key={col} className={complete ? col === 2 && row !== 2 ? "friction" : "pass" : "pending"}>{complete ? col === 2 && row !== 2 ? "!" : "✓" : "·"}</i>)}</div>)}</div>;
}

function LiveTesters({ phase }: { phase: number }) {
  return <div className="view live-view"><div className="view-intro"><p>Each tester runs in an isolated sandbox. Activity is translated into meaningful study moments, not terminal noise.</p><span>{phase === 0 ? "Ready" : phase < 6 ? "Live now" : "Complete"}<i className={phase > 0 && phase < 6 ? "pulse" : ""}/></span></div><div className="tester-grid">{personas.map((persona, index) => {
    const progress = phase === 0 ? 0 : Math.min(100, Math.max(8, (phase - index * .3) * 20)); const done = progress >= 100;
    return <article className="tester-card" key={persona.id} style={{ "--persona": persona.color } as React.CSSProperties}><div className="tester-top"><Avatar persona={persona}/><div><span>Tester {String(index + 1).padStart(2, "0")}</span><h2>{persona.name}</h2></div><b>{done ? "Complete" : progress ? "Running" : "Queued"}</b></div><div className="latest-shot"><MiniShot step={Math.min(4, Math.floor(progress / 22))} tint={index === 1 ? "coral" : index === 2 ? "green" : index === 3 ? "lilac" : "blue"}/><span>Latest evidence · {progress ? "just now" : "—"}</span></div><div className="tester-activity"><span className="eyebrow">Current activity</span><strong>{done ? "Journey complete" : progress ? persona.note : "Waiting for sandbox"}</strong><div className="progress"><i style={{ width: `${progress}%` }}/></div><small>Step {Math.max(1, Math.ceil(progress / 20))} of 5 <em>{Math.round(progress)}%</em></small></div><div className="event-log"><span><i/>Opened the product</span><span className={progress > 35 ? "visible" : ""}><i/>Captured first impression</span><span className={progress > 65 ? "visible" : ""}><i/>Found a point of friction</span></div></article>;
  })}</div></div>;
}

function Findings({ active, select }: { active: (typeof findings)[number]; select: (id: number) => void }) {
  return <div className="view findings-view"><div className="filterbar"><span>3 clustered findings</span><button className="selected">All</button><button>High</button><button>Interaction</button><button>Accessibility</button></div><div className="findings-layout"><section className="findings-list">{findings.map((finding, index) => <button key={finding.id} className={active.id === finding.id ? "finding-row active" : "finding-row"} onClick={() => select(finding.id)}><span className={`finding-index ${finding.severity.toLowerCase()}`}>{String(index + 1).padStart(2, "0")}</span><span><small>{finding.severity} · {finding.count} tester{finding.count > 1 ? "s" : ""}</small><strong>{finding.title}</strong><p>{finding.detail}</p><em>{finding.evidence}</em></span><Icon name="arrow"/></button>)}</section><aside className="finding-detail"><div className="detail-top"><span className={`severity ${active.severity.toLowerCase()}`}>{active.severity.slice(0, 1)}</span><span><small>{active.severity} severity</small><strong>{active.count} / 4 testers</strong></span></div><h2>{active.title}</h2><p>{active.detail}</p><div className="detail-shot"><MiniShot step={2} tint="coral"/><button aria-label="Observation one">1</button><button aria-label="Observation two">2</button></div><span className="eyebrow">Browser evidence</span><div className="evidence-note"><b>Action</b><span>Pressed Enter after typing “Book flights”</span><b>Result</b><span>Task added; input and create affordance disappeared</span><b>Elapsed</b><span>18.4 seconds before next action</span></div><span className="eyebrow">Reproduce</span><ol><li>Create the first task</li><li>Look for a way to add another</li><li>Observe the missing input</li></ol></aside></div></div>;
}

function JourneyBoard({ zoom, setZoom, selected, setSelected }: { zoom: number; setZoom: (z: number) => void; selected: { persona: number; step: number } | null; setSelected: (n: { persona: number; step: number } | null) => void }) {
  return <div className="view board-view"><div className="board-toolbar"><span><b>TodoMVC study</b><small>4 journeys · 20 moments · 9 observations</small></span><div><button onClick={() => setZoom(Math.max(.75, zoom - .1))} aria-label="Zoom out"><Icon name="minus"/></button><b>{Math.round(zoom * 100)}%</b><button onClick={() => setZoom(Math.min(1.2, zoom + .1))} aria-label="Zoom in"><Icon name="plus"/></button></div></div><div className="board-canvas"><div className="board-content" style={{ transform: `scale(${zoom})` }}>{personas.map((persona, row) => <div className="journey-lane" key={persona.id}><div className="lane-label"><Avatar persona={persona}/><span><strong>{persona.name}</strong><small>5 moments</small></span></div><div className="node-track">{journey.map((step, col) => <div className="node-wrap" key={step}>{col > 0 && <svg className="edge" viewBox="0 0 74 18" preserveAspectRatio="none"><path d="M0 9 C28 9 46 9 74 9"/><path d="m67 5 7 4-7 4"/></svg>}<button className={`journey-node ${col === 2 && row !== 2 ? "node-friction" : ""}`} onClick={() => setSelected({ persona: row, step: col })}><MiniShot step={col} tint={row === 1 ? "coral" : row === 2 ? "green" : row === 3 ? "lilac" : "blue"}/><span><b>{step}</b><small>{col === 2 && row !== 2 ? "Friction · 1 note" : "Passed"}</small></span>{col === 2 && row !== 2 && <i>1</i>}</button></div>)}</div></div>)}</div></div>{selected && <aside className="node-inspector"><button className="close" onClick={() => setSelected(null)} aria-label="Close detail">×</button><span className="eyebrow">Journey moment</span><h2>{journey[selected.step]}</h2><p>{personas[selected.persona].name}</p><MiniShot step={selected.step} tint={selected.persona === 1 ? "coral" : selected.persona === 2 ? "green" : selected.persona === 3 ? "lilac" : "blue"}/><div><b>{selected.step === 2 && selected.persona !== 2 ? "Lost the next action" : "Step completed"}</b><p>{selected.step === 2 && selected.persona !== 2 ? "“I added one task, but I can’t see how to add another.”" : "The tester moved through this step without observable friction."}</p></div></aside>}</div>;
}
