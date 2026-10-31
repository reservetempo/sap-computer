// The guided tour's state (useTour) and its UI: for the right-hand column, the first-visit
// invite card and the mission log; below lg, a dock fixed to the bottom of the screen with the
// current mission (TourDock). The steps and their checks are in tourSteps.js.

import { useEffect, useMemo, useRef, useState } from "react";
import { LAST, STEPS, TOUR_KEY, TOUR_START, advance } from "./tourSteps";
import { HtmlText } from "./sigText";

const EMPTY = [];

function load() {
  try {
    return JSON.parse(window.localStorage.getItem(TOUR_KEY) ?? "null");
  } catch {
    return null; // storage blocked or garbled: treat as a first visit
  }
}

function save(v) {
  try {
    window.localStorage.setItem(TOUR_KEY, JSON.stringify(v));
  } catch {
    // storage blocked: progress lasts until the page is left
  }
}

// sim / d: the simulator state and derive(sim). Saved progress is read after hydration, so the
// server and the first client render show no tour.
export function useTour(sim, d) {
  const [t, setT] = useState(TOUR_START);
  const [seen, setSeen] = useState(true); // answered the invite (or started the tour) before
  const [finished, setFinished] = useState(false);
  const [ready, setReady] = useState(false);
  const simRef = useRef(sim);
  simRef.current = sim;

  useEffect(() => {
    const saved = load();
    if (saved && typeof saved === "object") {
      const step = Number.isInteger(saved.step) ? Math.min(Math.max(saved.step, 0), LAST) : 0;
      setT({ ...TOUR_START, open: !!saved.open, max: step, view: step });
      setSeen(!!saved.seen);
      setFinished(!!saved.finished);
    } else {
      setSeen(false);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) save({ seen, open: t.open, step: t.max, finished });
  }, [ready, seen, t.open, t.max, finished]);

  // Check the current step after every change to the machine (and when a new step starts).
  useEffect(() => {
    if (t.open) setT((cur) => (cur.open ? advance(cur, sim, d) : cur));
  }, [sim, d, t.open, t.max]);

  const atFrontier = t.view === t.max;
  const step = STEPS[t.view];
  const done = !atFrontier || t.latched;

  const highlight = useMemo(() => {
    if (!t.open) return EMPTY;
    return (done && step.doneHighlight) || step.highlight;
  }, [t.open, done, step]);

  // Open the tour where it was left (or from the start), with the current machine as the
  // snapshot for the first step's check.
  const start = ({ restart = false } = {}) => {
    setSeen(true);
    setFinished(false);
    setT((cur) => {
      const from = restart ? 0 : cur.max;
      return { ...TOUR_START, open: true, max: from, view: from, snap: simRef.current };
    });
  };

  // Next / Skip: look forward again, or move the frontier on (done or not).
  const next = () => {
    if (atFrontier && t.max >= LAST) {
      setFinished(true);
      setT(TOUR_START);
      return;
    }
    setT((cur) =>
      cur.view < cur.max
        ? { ...cur, view: cur.view + 1 }
        : { ...cur, max: cur.max + 1, view: cur.max + 1, latched: false, snap: simRef.current }
    );
  };

  return {
    open: t.open,
    view: t.view,
    max: t.max,
    snap: t.snap ?? sim,
    step,
    atFrontier,
    done,
    finished,
    highlight,
    invite: ready && !seen && !t.open,
    start,
    next,
    decline: () => setSeen(true),
    close: () => setT((cur) => ({ ...cur, open: false })),
    back: () => setT((cur) => ({ ...cur, view: Math.max(0, cur.view - 1) })),
    goTo: (i) => setT((cur) => (i <= cur.max ? { ...cur, view: i } : cur)),
  };
}

// --- UI -------------------------------------------------------------------------------------

const BTN =
  "border border-[color:var(--sap-ink)] px-3 py-1 text-sm hover:bg-[color:var(--sap-ink)] hover:text-[color:var(--sap-bg)]";
const BTN_GO =
  "border border-[color:var(--sap-led-amber-on)] bg-[color:var(--sap-led-amber-on)] px-3 py-1 text-sm font-bold text-[color:var(--sap-on-accent)] hover:brightness-110";
const LINK = "text-[12px] text-[color:var(--sap-muted)] underline-offset-2 hover:text-[color:var(--sap-ink)] hover:underline";
const KICKER = "font-sap-label text-[11px] font-bold uppercase tracking-[0.2em] text-[color:var(--sap-led-amber-on)]";

function Lamp({ color, lit = true, glow = false, className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${className}`}
      style={{
        background: `var(--sap-led-${color}-${lit ? "on" : "off"})`,
        boxShadow: glow ? `0 0 6px var(--sap-led-${color}-on)` : undefined,
      }}
    />
  );
}

const LEGEND = [
  ["amber", "Address"],
  ["green", "Data"],
  ["red", "Control, output"],
  ["white", "Clock, T states"],
];

export function TourInvite({ onStart, onDecline, className = "" }) {
  return (
    <section
      aria-label="Guided tour"
      className={`mb-6 border border-[color:var(--sap-led-amber-on)] bg-[color:var(--sap-block)] px-3 py-3 ${className}`}
    >
      <p className={KICKER}>New here?</p>
      <p className="mt-1 font-sap-label text-lg font-bold">Take the guided tour</p>
      <p className="mt-1 text-sm text-[color:var(--sap-soft)]">
        {STEPS.length} short missions: switch on, write an instruction, then follow the machine from CLEAR through fetch
        and execute to the answer on the output lamps.
      </p>
      <div className="mt-3 flex gap-1.5">
        <button type="button" className={BTN_GO} onClick={onStart}>
          Start
        </button>
        <button type="button" className={BTN} onClick={onDecline}>
          No thanks
        </button>
      </div>
    </section>
  );
}

// The tour follows the Game-mode front panel; this offers the way back to it.
function OffPanelNote({ onBackToPanel, className = "" }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 border-b border-[color:var(--sap-frame)] px-3 py-2 text-[13px] ${className}`}
    >
      <span className="text-[color:var(--sap-soft)]">The tour follows the Game-mode front panel.</span>
      <button type="button" className={BTN_GO} onClick={onBackToPanel}>
        Back to the panel
      </button>
    </div>
  );
}

// The mission on view: its text, legend, lamps, checklist, hint and buttons. Shared by the
// mission log (lg and up) and the phone dock. heading: show "Mission n of N" and the title (the
// dock shows them in its bar instead).
function MissionBody({ tour, sim, d, onLoadExample, onRestart, heading = true }) {
  const { step, view, max, done, atFrontier, snap } = tour;
  const body = done && step.doneBody ? step.doneBody : typeof step.body === "function" ? step.body(sim, d) : step.body;
  const hint = !done && step.hint ? step.hint(sim, d, snap) : null;
  const checklist = !done && step.checklist ? step.checklist(sim, d, snap) : null;
  const watch = step.watch?.(sim, d);
  const last = view === STEPS.length - 1;

  return (
    <>
      {heading && (
        <>
          <p className="font-sap-label text-[11px] uppercase tracking-wide text-[color:var(--sap-muted)]">
            Mission {view + 1} of {STEPS.length}
          </p>
          <h3 className="font-sap-label text-lg font-bold">{step.title}</h3>
        </>
      )}
      <p className={heading ? "mt-1" : undefined}>
        <HtmlText text={body} />
      </p>

      {step.legend && (
        <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
          {LEGEND.map(([color, label]) => (
            <li key={color} className="flex items-center gap-2">
              <Lamp color={color} glow />
              {label}
            </li>
          ))}
        </ul>
      )}

      {watch && (
        <p className="mt-2 font-sap-mono text-[12px] text-[color:var(--sap-led-white-on)]">
          <span className="text-[color:var(--sap-muted)]">Lamps: </span>
          {watch}
        </p>
      )}

      {checklist && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-sap-mono text-[12px]">
          {checklist.map((c) => (
            <li
              key={c.label}
              className={c.ok ? "text-[color:var(--sap-led-green-on)]" : "text-[color:var(--sap-muted)]"}
            >
              {c.ok ? "✓" : "○"} {c.label}
            </li>
          ))}
        </ul>
      )}

      {done && !(step.readOnly && atFrontier) ? (
        <p className="mt-2 font-bold text-[color:var(--sap-led-green-on)]">✓ Mission complete</p>
      ) : (
        <p className="mt-2 font-bold text-[color:var(--sap-led-amber-on)]">▶ {step.task}</p>
      )}

      {hint && (
        <p className="mt-2 border-l-2 border-[color:var(--sap-led-red-on)] pl-2 text-[13px] text-[color:var(--sap-soft)]">
          {hint}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {view > 0 && (
          <button type="button" className={BTN} onClick={tour.back}>
            ← Back
          </button>
        )}
        {atFrontier && done && step.offer && (
          <button
            type="button"
            className={BTN_GO}
            onClick={() => {
              onLoadExample();
              tour.next();
            }}
          >
            {step.offer}
          </button>
        )}
        {done ? (
          <button type="button" className={step.offer && atFrontier ? BTN : BTN_GO} onClick={tour.next}>
            {atFrontier && last ? step.nextLabel ?? "Finish" : "Next →"}
          </button>
        ) : (
          <button type="button" className={BTN} onClick={tour.next}>
            Skip
          </button>
        )}
        {!atFrontier && (
          <button type="button" className={LINK} onClick={() => tour.goTo(max)}>
            Back to mission {max + 1}
          </button>
        )}
      </div>
      <div className="mt-2 flex gap-3">
        <button type="button" className={LINK} onClick={onRestart}>
          Start over
        </button>
        <button type="button" className={LINK} onClick={tour.close}>
          Close tour
        </button>
      </div>
    </>
  );
}

// tour: useTour(). offPanel: the front panel isn't on screen (a part is open, or Textbook mode).
// Below lg the mission on view is in TourDock, so only the mission list shows here.
export function TourPanel({ tour, sim, d, offPanel, onBackToPanel, onLoadExample, onRestart }) {
  const { view, max } = tour;

  return (
    <section
      aria-label="Guided tour"
      className="mb-6 border border-[color:var(--sap-frame)] bg-[color:var(--sap-block)] text-[14px] leading-relaxed"
    >
      <header className="flex items-center gap-3 border-b border-[color:var(--sap-frame)] bg-[color:var(--sap-block-alt)] px-3 py-1.5">
        <span className={KICKER}>Mission log</span>
        <span className="font-sap-mono text-[11px] text-[color:var(--sap-muted)]">
          {max}/{STEPS.length}
        </span>
        <button
          type="button"
          aria-label="Close the tour"
          title="Close (Tour picks up where you left off)"
          onClick={tour.close}
          className="ml-auto px-1 font-sap-mono text-base leading-none text-[color:var(--sap-muted)] hover:text-[color:var(--sap-ink)]"
        >
          ×
        </button>
      </header>

      {offPanel && <OffPanelNote onBackToPanel={onBackToPanel} className="max-lg:hidden" />}

      <ol className="px-3 py-2 font-sap-mono text-[12px] leading-5">
        {STEPS.map((s, i) => {
          const isDone = i < max;
          const isCurrent = i === max;
          const label = `${String(i + 1).padStart(2, "0")} ${s.title}`;
          return (
            <li key={s.id} className="flex items-center gap-2">
              <Lamp
                color={isDone ? "green" : "amber"}
                lit={isDone || isCurrent}
                glow={isCurrent}
                className={isCurrent ? "motion-safe:animate-pulse" : ""}
              />
              {i <= max ? (
                <button
                  type="button"
                  onClick={() => tour.goTo(i)}
                  aria-current={i === view ? "step" : undefined}
                  className={`truncate text-left hover:underline ${
                    i === view ? "font-bold text-[color:var(--sap-ink)]" : "text-[color:var(--sap-muted)]"
                  }`}
                >
                  {label}
                </button>
              ) : (
                <span className="truncate text-[color:var(--sap-faint)]">{label}</span>
              )}
              {isDone && (
                <span aria-label="done" className="ml-auto text-[color:var(--sap-led-green-on)]">
                  ✓
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="border-t border-[color:var(--sap-frame)] px-3 py-3 max-lg:hidden" aria-live="polite">
        <MissionBody tour={tour} sim={sim} d={d} onLoadExample={onLoadExample} onRestart={onRestart} />
      </div>
    </section>
  );
}

// --- Phone dock -----------------------------------------------------------------------------

const DOCK_KEY = "sap1-tour-dock"; // localStorage: "open" | "closed"
const DOCK_BODY = "sap1-tour-dock-body";
const DOCK_WRAP = "pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 lg:hidden";
const DOCK_CARD =
  "pointer-events-auto mx-auto max-w-6xl border border-b-0 border-t-2 border-[color:var(--sap-frame)] border-t-[color:var(--sap-led-amber-on)] bg-[color:var(--sap-block)] pb-[env(safe-area-inset-bottom)] text-[13px] leading-relaxed shadow-[0_-8px_24px_rgba(0,0,0,0.45)]";

// Below lg: the mission on view (or the first-visit invite) as a card fixed to the bottom of the
// screen, so the mission text sits beside the front panel instead of far below it. It collapses
// to a one-line bar (remembered), and the page is padded by its height so it never hides the end
// of the page. invite: show the invite while the tour is closed. Props otherwise as TourPanel.
export function TourDock({ tour, sim, d, offPanel, invite, onBackToPanel, onLoadExample, onRestart, onStart }) {
  const [expanded, setExpanded] = useState(true);
  const ref = useRef(null);
  const show = tour.open || invite;

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(DOCK_KEY);
      if (v) setExpanded(v !== "closed");
    } catch {
      // storage blocked: start expanded
    }
  }, []);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    try {
      window.localStorage.setItem(DOCK_KEY, next ? "open" : "closed");
    } catch {
      // storage blocked: the choice lasts until the page is left
    }
  };

  // Pad the page by the card's height (0 at lg and up, where the card is display: none).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const s = document.documentElement.style;
    const prev = s.paddingBottom;
    const fit = () => {
      s.paddingBottom = el.offsetHeight ? `${el.offsetHeight}px` : prev;
    };
    fit();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      s.paddingBottom = prev;
    };
  }, [show, tour.open]);

  if (!show) return null;

  if (!tour.open) {
    return (
      <div ref={ref} className={DOCK_WRAP}>
        <section aria-label="Guided tour" className={DOCK_CARD}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className={KICKER}>New here?</p>
              <p className="font-bold">Take the guided tour</p>
            </div>
            <div className="flex gap-1.5">
              <button type="button" className={BTN_GO} onClick={onStart}>
                Start
              </button>
              <button type="button" className={BTN} onClick={tour.decline}>
                No thanks
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const { step, view, done } = tour;
  return (
    <div ref={ref} className={DOCK_WRAP}>
      <section aria-label="Guided tour, mission on view" className={DOCK_CARD}>
        <div className="flex items-stretch bg-[color:var(--sap-block-alt)]">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={DOCK_BODY}
            onClick={toggle}
            className="flex min-w-0 flex-1 items-center gap-2 py-2 pl-3 pr-1 text-left"
          >
            <Lamp color={done ? "green" : "amber"} glow={!done} className={done ? "" : "motion-safe:animate-pulse"} />
            <span className="shrink-0 font-sap-mono text-[11px] text-[color:var(--sap-muted)]">
              <span aria-hidden="true">
                {String(view + 1).padStart(2, "0")}/{STEPS.length}
              </span>
              <span className="sr-only">
                Mission {view + 1} of {STEPS.length}:
              </span>
            </span>
            <span className="truncate font-bold">{step.title}</span>
            {done && (
              <span className="shrink-0 text-[color:var(--sap-led-green-on)]">
                <span aria-hidden="true">✓</span>
                <span className="sr-only">, done</span>
              </span>
            )}
            <span
              aria-hidden="true"
              className={`ml-auto shrink-0 px-1 font-sap-mono text-[color:var(--sap-muted)] transition-transform duration-200 motion-reduce:transition-none ${
                expanded ? "" : "rotate-180"
              }`}
            >
              ▾
            </span>
          </button>
          <button
            type="button"
            aria-label="Close the tour"
            title="Close (Tour picks up where you left off)"
            onClick={tour.close}
            className="shrink-0 px-3 font-sap-mono text-base leading-none text-[color:var(--sap-muted)] hover:text-[color:var(--sap-ink)]"
          >
            ×
          </button>
        </div>

        {/* Collapses by animating the row from 1fr to 0fr; visibility hides it from tab order
            and screen readers once collapsed. */}
        <div
          id={DOCK_BODY}
          className={`grid transition-[grid-template-rows,visibility] duration-200 ease-out motion-reduce:transition-none ${
            expanded ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="max-h-[38vh] overflow-y-auto overscroll-contain border-t border-[color:var(--sap-frame)]">
              {offPanel && <OffPanelNote onBackToPanel={onBackToPanel} />}
              <div className="px-3 py-3" aria-live="polite">
                <MissionBody
                  tour={tour}
                  sim={sim}
                  d={d}
                  onLoadExample={onLoadExample}
                  onRestart={onRestart}
                  heading={false}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
