import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CANVAS, ROOT, nodeAt, cleanPath, decodeWord } from "./sap1Parts";
import {
  CON_ORDER,
  PROGRAM,
  bin,
  hex,
  clear,
  derive,
  describe,
  initialState,
  loadExample,
  setProg,
  step,
  toggleAddrBit,
  toggleDataBit,
  write,
} from "./sap1Sim";
import { PALETTES, TEXTBOOK, cssVars } from "./theme";
import { signalType } from "./signalTypes";
import { HtmlText, SvgText } from "./sigText";
import GamePanel, { PANEL_BOXES } from "./GamePanel";
import GameDiagram, { Pulse, bitsMarker, mix, trimEnd } from "./gameParts";
import { TourDock, TourInvite, TourPanel, useTour } from "./Tour";

// The active color palette (see theme.js). SVG parts read it directly; HTML parts use the
// matching CSS variables (--sap-*) set on the page root. An active part is drawn in the color of
// its signal type (pal.type[signalType(...)]); in the textbook look every type is the same red.
const PaletteContext = createContext(TEXTBOOK);
const usePalette = () => useContext(PaletteContext);

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const FULL = [0, 0, CANVAS.w, CANVAS.h];
// The free-running clock's period for each rate setting (the toolbar's and the panel's CLOCK switch).
export const STEP_MS = { slow: 1200, med: 550, fast: 150 };
const RATE_LABELS = [
  ["slow", "Slow"],
  ["med", "Med"],
  ["fast", "Fast"],
];
const MODE_KEY = "sap1-mode"; // localStorage: "game" | "textbook"

// The textbook wires' pulse: a thin pale dash running along each lit wire, the same keyframes as
// game mode's gm-pulse (see Pulse in gameParts.jsx). Off under reduced motion.
const TB_CSS = `
.tb-pulse { animation-name: tb-pulse; animation-timing-function: linear; animation-iteration-count: infinite; }
@keyframes tb-pulse { to { stroke-dashoffset: -100; } }
@media (prefers-reduced-motion: reduce) { .tb-pulse { display: none; } }`;
const TB_ARROW_TRIM = 8; // the pulse stops where a wire's arrowhead begins

// --- geometry & animation helpers -----------------------------------------------------------

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const smooth = (a, b, t) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
const lerpBox = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
const growBox = (k) => [(-(k - 1) * CANVAS.w) / 2, (-(k - 1) * CANVAS.h) / 2, CANVAS.w * k, CANVAS.h * k];

// The block's rectangle, padded and widened to the canvas aspect ratio.
function fitBox(b, pad = 24) {
  let [x, y, w, h] = [b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad];
  const ar = CANVAS.w / CANVAS.h;
  if (w / h > ar) {
    const nh = w / ar;
    y -= (nh - h) / 2;
    h = nh;
  } else {
    const nw = h * ar;
    x -= (nw - w) / 2;
    w = nw;
  }
  return [x, y, w, h];
}

function tween(ms, alive, frame) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = (now) => {
      if (!alive()) return resolve(false);
      const t = Math.min(1, (now - t0) / ms);
      frame(t);
      if (t < 1) requestAnimationFrame(tick);
      else resolve(true);
    };
    requestAnimationFrame(tick);
  });
}

// The box part `id` is drawn in on level `p`: its section on the game front panel (the overview in
// game mode), otherwise its block in the diagram.
const partBox = (mode, p, id) =>
  mode === "game" && p.length === 0 ? PANEL_BOXES[id] : nodeAt(p)?.diagram.blocks.find((b) => b.id === id);

const pathFromHash = () =>
  cleanPath(window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean));

// --- diagram pieces -------------------------------------------------------------------------
// The textbook drawing. Game mode draws the levels below the front panel as hardware instead
// (gameParts.jsx), from the same data.

// A connection; while lit, a pulse runs along it from driver (first point) to loader (last point)
// once per clock period stepMs.
function Wire({ w, d, stepMs }) {
  const P = usePalette();
  const on = Boolean(w.on && d.sig.has(w.on));
  const type = signalType(w);
  const color = on ? P.type[type] : P.ink;
  const m = w.bits ? bitsMarker(w.pts, w.bitsAt) : null;
  const arrow = w.arrow !== false;
  return (
    <g>
      <polyline
        points={w.pts.map((p) => p.join(",")).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={on ? 2.5 : 1.5}
        strokeLinejoin="round"
        markerEnd={arrow ? `url(#sap1-arrow-${on ? type : "off"})` : undefined}
      />
      {on && stepMs > 0 && (
        <Pulse
          className="tb-pulse"
          pts={arrow ? trimEnd(w.pts, TB_ARROW_TRIM) : w.pts}
          stroke={mix(color, "#ffffff", 0.6)}
          width={1.2}
          stepMs={stepMs}
        />
      )}
      {m && (
        <g>
          <line
            x1={m.h ? m.x - 4 : m.x - 6}
            y1={m.h ? m.y + 6 : m.y + 4}
            x2={m.h ? m.x + 4 : m.x + 6}
            y2={m.h ? m.y - 6 : m.y - 4}
            stroke={color}
            strokeWidth={1.5}
          />
          <text
            x={m.h ? m.x : m.x + 10}
            y={m.h ? m.y + 19 : m.y + 4}
            textAnchor={m.h ? "middle" : "start"}
            fontSize={11}
            fill={on ? color : P.muted}
          >
            {w.bits}
          </text>
        </g>
      )}
      {w.dots?.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3.5} fill={color} />)}
      {w.label && (
        <text x={w.labelAt[0]} y={w.labelAt[1]} textAnchor={w.anchor ?? "middle"} fontSize={12} fill={on ? color : P.muted}>
          <SvgText text={w.label} />
        </text>
      )}
    </g>
  );
}

function Pin({ p, d }) {
  const P = usePalette();
  const on = CON_ORDER.includes(p.sig) && d.sig.has(p.sig);
  const color = on ? P.type[signalType(p)] : P.ink;
  const len = p.len ?? 30;
  const [x, y] = p.at;
  let [x2, y2, lx, ly, anchor] = [x, y, x, y, "middle"];
  if (p.dir === "left") [x2, lx, ly, anchor] = [x - len, x - len - 5, y + 4.5, "end"];
  if (p.dir === "right") [x2, lx, ly, anchor] = [x + len, x + len + 5, y + 4.5, "start"];
  if (p.dir === "up") [y2, ly] = [y - len, y - len - 6];
  if (p.dir === "down") [y2, ly] = [y + len, y + len + 15];
  return (
    <g>
      <line x1={x} y1={y} x2={x2} y2={y2} stroke={color} strokeWidth={on ? 2.5 : 1.5} />
      <text x={lx} y={ly} textAnchor={anchor} fontSize={13} fontWeight={on ? 700 : 400} fill={color}>
        <SvgText text={`{${p.sig}}`} />
      </text>
    </g>
  );
}

function Group({ g, sim, d, path }) {
  const P = usePalette();
  const active = g.act?.some((k) => d.sig.has(k));
  const hot = P.type[signalType(g, { d, path })];
  const value = g.value?.(sim, d);
  return (
    <g>
      <rect
        x={g.x}
        y={g.y}
        width={g.w}
        height={g.h}
        rx={6}
        fill="none"
        stroke={active ? hot : P.frame}
        strokeWidth={active ? 2 : 1.2}
        strokeDasharray="5 4"
      />
      <text x={g.x + 10} y={g.y + 19} fontSize={11} letterSpacing={0.6} fill={P.muted}>
        {g.label.toUpperCase()}
      </text>
      {value && (
        <text x={g.x + g.w - 10} y={g.y + 19} textAnchor="end" fontSize={12.5} fontFamily={MONO} fill={active ? hot : P.ink}>
          {value}
        </text>
      )}
    </g>
  );
}

function Leds({ cx, cy, value }) {
  const P = usePalette();
  return Array.from({ length: 8 }, (_, i) => {
    const lit = (value >> (7 - i)) & 1;
    return (
      <circle
        key={i}
        cx={cx - 77 + i * 22}
        cy={cy}
        r={7}
        fill={lit ? P.type.output : P.typeOff.output}
        stroke={lit ? P.type.output : P.frame}
        strokeWidth={1.5}
      />
    );
  });
}

function ConRow({ b, d }) {
  const P = usePalette();
  const cell = b.w / CON_ORDER.length;
  const mid = b.y + b.h / 2 + 5;
  return (
    <g>
      {CON_ORDER.map((k, i) => {
        const on = d.sig.has(k);
        return (
          <g key={k}>
            <rect
              x={b.x + i * cell}
              y={b.y}
              width={cell}
              height={b.h}
              fill={on ? P.type.control : P.block}
              stroke={P.ink}
              strokeWidth={1.2}
            />
            <text x={b.x + (i + 0.5) * cell} y={mid - 2} textAnchor="middle" fontSize={13} fill={on ? P.onAccent : P.ink}>
              <SvgText text={`{${k}}`} />
            </text>
          </g>
        );
      })}
      <text x={b.x - 8} y={mid} textAnchor="end" fontSize={13} fontWeight={700} fill={P.ink}>
        CON
      </text>
      <text x={b.x + b.w + 8} y={mid} fontSize={13} fontFamily={MONO} fill={P.ink}>
        {hex(d.con, 3)}H
      </text>
    </g>
  );
}

function Block({ b, sim, d, path, drill, focused, onEnter, onLeave, onActivate }) {
  const P = usePalette();
  const active = b.kind === "bus" ? d.bus !== null : Boolean(b.act?.some((k) => d.sig.has(k)));
  const type = signalType(b, { d, path });
  const [hot, tint] = [P.type[type], P.tint[type]];
  const name = [b.tag, b.title].filter(Boolean).join(" ");
  const handlers = {
    role: "button",
    tabIndex: 0,
    "aria-label": drill ? `Open ${name}` : name,
    onClick: () => onActivate(b, drill),
    onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate(b, drill);
      }
    },
    onMouseEnter: () => onEnter(b.id),
    onMouseLeave: () => onLeave(b.id),
    onFocus: () => onEnter(b.id),
    onBlur: () => onLeave(b.id),
    style: { cursor: "pointer", outline: "none" },
  };

  if (b.kind === "con") {
    return (
      <g {...handlers}>
        <ConRow b={b} d={d} />
        {focused && <rect x={b.x - 3} y={b.y - 3} width={b.w + 6} height={b.h + 6} fill="none" stroke={P.ink} strokeWidth={2} />}
      </g>
    );
  }

  if (b.kind === "bus") {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    return (
      <g {...handlers}>
        <rect
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          fill={active ? tint : focused ? P.hoverStrong : P.hover}
          stroke={active ? hot : P.ink}
          strokeWidth={active || focused ? 2.5 : 1.5}
        />
        <text x={cx} y={b.y - 8} textAnchor="middle" fontSize={13} fontWeight={700} fill={P.ink}>
          {b.title}
        </text>
        <text
          x={cx}
          y={cy + 4.5}
          transform={`rotate(-90 ${cx} ${cy})`}
          textAnchor="middle"
          fontSize={13}
          fontFamily={MONO}
          fill={active ? hot : P.muted}
        >
          {d.bus === null ? "not driven" : bin(d.bus, d.busBits)}
        </text>
      </g>
    );
  }

  const value = b.value?.(sim, d);
  const lines = [{ text: b.title, size: 15, weight: 700, fill: P.ink }];
  if (b.sub) lines.push({ text: b.sub, size: 12, fill: P.muted });
  if (value != null) lines.push({ text: value, size: 13, mono: true, fill: active ? hot : P.ink });
  if (b.kind === "display") lines.push({ leds: true, size: 16 });
  const gap = 6;
  const total = lines.reduce((sum, l) => sum + l.size, 0) + gap * (lines.length - 1);
  let cursor = b.y + b.h / 2 - total / 2;
  const cx = b.x + b.w / 2;

  return (
    <g {...handlers}>
      <rect
        x={b.x}
        y={b.y}
        width={b.w}
        height={b.h}
        rx={b.kind === "switch" ? 12 : 3}
        fill={active ? tint : focused ? P.hover : b.kind === "switch" ? P.blockAlt : P.block}
        stroke={active ? hot : P.ink}
        strokeWidth={active || focused ? 2.5 : 1.5}
      />
      {b.tag && (
        <text x={b.x + 8} y={b.y + 15} fontSize={11} fill={P.muted}>
          {b.tag}
        </text>
      )}
      {drill && (
        <g>
          <circle cx={b.x + b.w - 14} cy={b.y + 14} r={8} fill={focused ? P.ink : P.block} stroke={P.ink} strokeWidth={1.3} />
          <path
            d={`M${b.x + b.w - 18} ${b.y + 14}h8M${b.x + b.w - 14} ${b.y + 10}v8`}
            stroke={focused ? P.block : P.ink}
            strokeWidth={1.5}
          />
        </g>
      )}
      {lines.map((l, i) => {
        const top = cursor;
        cursor += l.size + gap;
        if (l.leds) return <Leds key={i} cx={cx} cy={top + l.size / 2} value={sim.out} />;
        return (
          <text
            key={i}
            x={cx}
            y={top + l.size * 0.82}
            textAnchor="middle"
            fontSize={l.size}
            fontWeight={l.weight ?? 400}
            fontFamily={l.mono ? MONO : undefined}
            fill={l.fill}
          >
            {l.text}
          </text>
        );
      })}
    </g>
  );
}

function Diagram({ node, path, sim, d, focusId, onEnter, onLeave, onActivate, stepMs }) {
  const P = usePalette();
  const dg = node.diagram;
  return (
    <>
      {dg.groups?.map((g, i) => <Group key={`g${i}`} g={g} sim={sim} d={d} path={path} />)}
      {dg.wires?.map((w, i) => <Wire key={`w${i}`} w={w} d={d} stepMs={stepMs} />)}
      {dg.pins?.map((p, i) => <Pin key={`p${i}`} p={p} d={d} />)}
      {dg.notes?.map((n, i) => (
        <text key={`n${i}`} x={n.at[0]} y={n.at[1]} textAnchor={n.anchor ?? "middle"} fontSize={11.5} fill={P.muted}>
          <SvgText text={n.text} />
        </text>
      ))}
      {dg.blocks.map((b) => (
        <Block
          key={b.id}
          b={b}
          sim={sim}
          d={d}
          path={path}
          drill={Boolean(node.children?.[b.id])}
          focused={focusId === b.id}
          onEnter={onEnter}
          onLeave={onLeave}
          onActivate={onActivate}
        />
      ))}
    </>
  );
}

// --- side panel -----------------------------------------------------------------------------

// HTML colors come from the --sap-* variables (see cssVars in theme.js).
const BTN =
  "border border-[color:var(--sap-ink)] px-3 py-1 text-sm hover:bg-[color:var(--sap-ink)] hover:text-[color:var(--sap-bg)]";
const BTN_DISABLED =
  "disabled:border-[color:var(--sap-disabled)] disabled:text-[color:var(--sap-disabled)] disabled:hover:bg-transparent";

// What each RAM word means to the program in memory. SAP-1 has no jumps, so a run goes from 0H to
// the first HLT; the words its LDA/ADD/SUB instructions point at past that are data, and the
// rest is never reached.
function listing(ram) {
  let end = ram.length - 1;
  const data = new Set();
  for (let i = 0; i < ram.length; i++) {
    const op = ram[i] >> 4;
    if (op <= 0x2) data.add(ram[i] & 15);
    if (op === 0xf) {
      end = i;
      break;
    }
  }
  return ram.map((v, i) => {
    if (i > end && data.has(i)) return { text: `data ${v}`, kind: "data" };
    return { text: decodeWord(v) ?? String(v), kind: i <= end ? "code" : "unused" };
  });
}

function Memory({ sim, d }) {
  const reading = d.sig.has("CE");
  const rows = useMemo(() => listing(sim.ram), [sim.ram]);
  const isExample = sim.ram.every((v, i) => v === PROGRAM[i]);
  return (
    <section className="mt-6 border-t border-[color:var(--sap-rule)] pt-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-[color:var(--sap-muted)]">Memory</h3>
      <p className="mt-1 text-sm text-[color:var(--sap-soft)]">
        {isExample ? "Example 10-1 from the book: 1 + 2 + 3 − 4." : "Your program. Load example puts Example 10-1 back."}
      </p>
      <table className="mt-2 w-full font-mono text-[13px]">
        <tbody>
          {sim.ram.map((v, i) => {
            const here = d.ramAddr === i;
            const hot = here && (sim.prog || reading);
            return (
              <tr
                key={i}
                aria-current={here ? "true" : undefined}
                className={
                  hot
                    ? "bg-[color:var(--sap-tint-data)] text-[color:var(--sap-type-data)]"
                    : here
                      ? "bg-[color:var(--sap-hover)]"
                      : ""
                }
              >
                <td className="py-0.5 pl-1 pr-3 text-[color:var(--sap-muted)]">{hex(i, 1)}H</td>
                <td className="pr-3">{bin(v)}</td>
                <td className={`pr-2 ${rows[i].kind === "unused" && !hot ? "text-[color:var(--sap-faint)]" : ""}`}>
                  {rows[i].text}
                </td>
                <td className="pr-1 text-right text-[11px] text-[color:var(--sap-muted)]">
                  {[sim.pc === i && "PC", sim.mar === i && "MAR", sim.prog && sim.addrSw === i && "SW"]
                    .filter(Boolean)
                    .join(" ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-[color:var(--sap-muted)]">
        Grey words come after the first HLT, so a run never reaches them.
      </p>
    </section>
  );
}

// Lit bit switches take the color of what they set: an address or a data byte.
const BIT_ON = {
  address: "border-[color:var(--sap-type-address)] bg-[color:var(--sap-type-address)] text-[color:var(--sap-on-accent)]",
  data: "border-[color:var(--sap-type-data)] bg-[color:var(--sap-type-data)] text-[color:var(--sap-on-accent)]",
};

// One front-panel bit switch: shows 0 or 1, lit when 1.
function BitButton({ caption, label, type, on, onClick, className = "" }) {
  return (
    <span className={`flex flex-col items-center gap-0.5 ${className}`}>
      <span aria-hidden="true" className="font-mono text-[10px] text-[color:var(--sap-muted)]">
        {caption}
      </span>
      <button
        type="button"
        aria-label={label}
        aria-pressed={on}
        onClick={onClick}
        className={`h-7 w-7 border font-mono text-sm ${
          on ? BIT_ON[type] : "border-[color:var(--sap-ink)] hover:bg-[color:var(--sap-hover)]"
        }`}
      >
        {on ? 1 : 0}
      </button>
    </span>
  );
}

// PROG mode: the address switches (S1), data switches (S3) and Write (S4).
function ProgSwitches({ sim, onAddrBit, onDataBit, onWrite }) {
  const addr = sim.addrSw & 15;
  const word = decodeWord(sim.dataSw);
  return (
    <div className="border border-b-0 border-[color:var(--sap-frame)] px-3 py-2">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
        <div role="group" aria-label="Address switches" className="flex gap-1">
          {[3, 2, 1, 0].map((i) => (
            <BitButton
              key={i}
              caption={`A${i}`}
              label={`Address bit ${i}`}
              type="address"
              on={Boolean((addr >> i) & 1)}
              onClick={() => onAddrBit(i)}
            />
          ))}
        </div>
        <div role="group" aria-label="Data switches" className="flex gap-1">
          {[7, 6, 5, 4, 3, 2, 1, 0].map((i) => (
            <BitButton
              key={i}
              caption={`D${i}`}
              label={`Data bit ${i}`}
              type="data"
              on={Boolean((sim.dataSw >> i) & 1)}
              onClick={() => onDataBit(i)}
              className={i === 3 ? "ml-2" : ""}
            />
          ))}
        </div>
        <button type="button" className={BTN} onClick={onWrite}>
          Write
        </button>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 font-mono text-[13px]">
        <span>
          Address <span className="font-bold">{hex(addr, 1)}H</span>
        </span>
        <span>
          Byte <span className="font-bold">{bin(sim.dataSw)}</span> = {hex(sim.dataSw)}H
        </span>
        <span>
          {word ? (
            <>
              <span className="font-bold">{word}</span> as an instruction, or {sim.dataSw} as a number
            </>
          ) : (
            <>Not an instruction; {sim.dataSw} as a number</>
          )}
        </span>
      </p>
      <p className="mt-1 text-xs text-[color:var(--sap-muted)]" aria-live="polite">
        Set an address and a byte, then Write. Word {hex(addr, 1)}H holds {bin(sim.ram[addr])} now.
      </p>
    </div>
  );
}

function Panel({ node, path, focus, drill, sim, d, onOpen }) {
  return (
    <aside className="text-[15px] leading-relaxed">
      <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--sap-muted)]">{node.part}</p>
      <h2 className="text-2xl font-bold">{node.title}</h2>
      {node.about.map((p, i) => (
        <p key={i} className="mt-2">
          <HtmlText text={p} />
        </p>
      ))}

      <section className="mt-6 min-h-[150px] border-t border-[color:var(--sap-rule)] pt-4">
        {focus ? (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--sap-muted)]">{focus.tag ?? "Part"}</p>
            <h3 className="text-lg font-bold">
              {focus.title}
              {focus.sub && <span className="font-normal text-[color:var(--sap-muted)]"> · {focus.sub}</span>}
            </h3>
            <p className="mt-1">
              <HtmlText text={focus.about ?? ""} />
            </p>
            {drill && (
              <button onClick={() => onOpen(focus.id)} className={`mt-3 ${BTN}`}>
                Look inside →
              </button>
            )}
          </>
        ) : (
          <p className="text-[color:var(--sap-muted)]">Hover over a part, or tap it, to see what it does. Parts marked + open up.</p>
        )}
      </section>

      {(path.length === 0 || path[0] === "ram") && <Memory sim={sim} d={d} />}
    </aside>
  );
}

// --- main -----------------------------------------------------------------------------------

export default function Sap1Visualizer() {
  // "game" (the default) or "textbook". The server and the first client render use the default;
  // a saved choice is read after hydration.
  const [mode, setMode] = useState("game");
  const pal = PALETTES[mode];
  const [path, setPath] = useState([]);
  const [sim, setSim] = useState(initialState);
  const [running, setRunning] = useState(false);
  const [rate, setRate] = useState("med"); // "slow" | "med" | "fast"
  const stepMs = STEP_MS[rate];
  const [hoverId, setHoverId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const svgRef = useRef(null);
  const sceneRef = useRef(null);
  const pathRef = useRef([]);
  const animToken = useRef(0);
  const busy = useRef(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const node = nodeAt(path) ?? ROOT;
  const d = useMemo(() => derive(sim), [sim]);
  const tour = useTour(sim, d);

  const setView = (box, opacity) => {
    svgRef.current?.setAttribute("viewBox", box.join(" "));
    sceneRef.current?.setAttribute("opacity", String(opacity));
  };

  const commit = (next, push) => {
    flushSync(() => {
      setPath(next);
      setHoverId(null);
      setSelectedId(null);
    });
    // The focused part (or breadcrumb) may have just unmounted, which drops keyboard focus to
    // the page; keep it in the diagram so the next Tab reaches the new level's parts.
    const ae = document.activeElement;
    if (!ae || ae === document.body || !ae.isConnected) svgRef.current?.focus({ preventScroll: true });
    pathRef.current = next;
    if (push) {
      const url = next.length ? `#/${next.join("/")}` : window.location.pathname + window.location.search;
      window.history.pushState(null, "", url);
    }
  };

  // Zoom into a block (or back out of one), swapping the diagram at the midpoint.
  const navigate = useCallback(async (next, { push = true, force = false } = {}) => {
    const cur = pathRef.current;
    if (next.join("/") === cur.join("/")) return;
    if (busy.current && !force) return;
    const token = ++animToken.current;
    const alive = () => animToken.current === token;
    const done = () => {
      setView(FULL, 1);
      busy.current = false;
    };

    const into = next.length === cur.length + 1 && cur.every((id, i) => next[i] === id);
    const outOf = next.length < cur.length && next.every((id, i) => cur[i] === id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || (!into && !outOf)) {
      commit(next, push);
      return done();
    }

    busy.current = true;
    if (into) {
      const blk = partBox(modeRef.current, cur, next[next.length - 1]);
      const target = blk ? fitBox(blk) : growBox(0.6);
      if (!(await tween(380, alive, (t) => setView(lerpBox(FULL, target, ease(t)), 1 - smooth(0.55, 1, t))))) return;
      commit(next, push);
      setView(growBox(1.35), 0);
      if (!(await tween(280, alive, (t) => setView(lerpBox(growBox(1.35), FULL, easeOut(t)), t)))) return;
    } else {
      if (!(await tween(200, alive, (t) => setView(lerpBox(FULL, growBox(1.35), ease(t)), 1 - t)))) return;
      commit(next, push);
      const blk = partBox(modeRef.current, next, cur[next.length]);
      const from = blk ? fitBox(blk) : growBox(0.8);
      setView(from, 0);
      if (!(await tween(380, alive, (t) => setView(lerpBox(from, FULL, ease(t)), smooth(0, 0.45, t))))) return;
    }
    done();
  }, []);

  // Deep links (#/ctrl/clock), the browser back button, and Esc to go up a level.
  useEffect(() => {
    const initial = pathFromHash();
    if (initial.length) {
      pathRef.current = initial;
      setPath(initial);
    }
    const onPop = () => navigate(pathFromHash(), { push: false, force: true });
    const onKey = (e) => {
      if (e.key === "Escape" && pathRef.current.length) navigate(pathRef.current.slice(0, -1));
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MODE_KEY);
      if (saved === "game" || saved === "textbook") setMode(saved);
    } catch {
      // storage blocked: keep the default
    }
  }, []);
  const chooseMode = (m) => {
    // The other mode draws different parts, so a hover or selection from this one would linger
    // in the info panel (the hovered part unmounts without a pointer-leave).
    if (m !== modeRef.current) {
      setHoverId(null);
      setSelectedId(null);
    }
    setMode(m);
    try {
      window.localStorage.setItem(MODE_KEY, m);
    } catch {
      // storage blocked: the choice lasts until the page is left
    }
  };

  // The guided tour runs on the Game-mode front panel.
  const backToPanel = () => {
    chooseMode("game");
    navigate([], { force: true });
  };
  const startTour = (opts) => {
    backToPanel();
    tour.start(opts);
  };

  // The one free-running clock: the toolbar's Run / Pause and the panel's AUTO lever both drive
  // `running`, and both rate controls drive `rate`.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSim((s) => step(s)), stepMs);
    return () => clearInterval(id);
  }, [running, stepMs]);
  useEffect(() => {
    if (sim.halted || sim.prog) setRunning(false);
  }, [sim.halted, sim.prog]);

  // Paint the whole page (overscroll included) in the palette while this route is open.
  useEffect(() => {
    const s = document.documentElement.style;
    const prev = [s.backgroundColor, s.colorScheme];
    s.backgroundColor = pal.bg;
    s.colorScheme = pal.scheme;
    return () => {
      [s.backgroundColor, s.colorScheme] = prev;
    };
  }, [pal]);

  const onEnter = useCallback((id) => setHoverId(id), []);
  const onLeave = useCallback((id) => setHoverId((h) => (h === id ? null : h)), []);
  const onActivate = useCallback(
    (b, drill) => {
      if (drill) navigate([...pathRef.current, b.id]);
      else setSelectedId(b.id);
    },
    [navigate]
  );

  const openPart = useCallback((id) => navigate([...pathRef.current, id]), [navigate]);
  // Game mode shows the overview as a front panel and the levels below as chips on a board.
  const showPanel = mode === "game" && path.length === 0;

  const focusId = hoverId ?? selectedId;
  const focus = node.diagram.blocks.find((b) => b.id === focusId);

  const crumbs = [{ title: "SAP-1", path: [] }].concat(
    path.map((_, i) => ({ title: nodeAt(path.slice(0, i + 1)).title, path: path.slice(0, i + 1) }))
  );

  const btn = `${BTN} ${BTN_DISABLED}`;
  const clockStopped = sim.halted || sim.prog;

  const setProgSwitch = (on) => {
    if (on) setRunning(false);
    setSim((s) => setProg(s, on));
  };

  return (
    <PaletteContext.Provider value={pal}>
      <div
        className="min-h-screen bg-[color:var(--sap-bg)] font-sans text-[color:var(--sap-ink)]"
        style={{ ...cssVars(pal), colorScheme: pal.scheme }}
      >
        <main className="mx-auto max-w-6xl px-4 py-10">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <h1 className="text-4xl font-bold">sap-1</h1>
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-pressed={tour.open}
                onClick={() => startTour()}
                title="A guided tour of the front panel"
                className={`border border-[color:var(--sap-led-amber-on)] px-3 py-1 text-sm ${
                  tour.open
                    ? "bg-[color:var(--sap-led-amber-on)] text-[color:var(--sap-on-accent)]"
                    : "text-[color:var(--sap-led-amber-on)] hover:bg-[color:var(--sap-hover)]"
                }`}
              >
                Tour
              </button>
              <div role="group" aria-label="View mode" className="flex">
                {[
                  ["game", "Game"],
                  ["textbook", "Textbook"],
                ].map(([m, label], i) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => chooseMode(m)}
                    className={`border border-[color:var(--sap-ink)] px-3 py-1 text-sm ${i ? "-ml-px" : ""} ${
                      mode === m ? "bg-[color:var(--sap-ink)] text-[color:var(--sap-bg)]" : "hover:bg-[color:var(--sap-hover)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-[color:var(--sap-soft)]">
            The Simple-As-Possible computer from Malvino &amp; Brown&apos;s <i>Digital Computer Electronics</i>, chapter 10.
            Click a part marked + to look inside it, and step the clock to watch the example program run. Switch to
            PROG to write your own program into memory.
          </p>

          <nav aria-label="Breadcrumb" className="mt-6 flex flex-wrap items-center gap-x-2 text-sm">
            {crumbs.map((c, i) => (
              <span key={c.path.join("/") || "root"} className="flex items-center gap-x-2">
                {i > 0 && <span className="text-[color:var(--sap-faint)]">/</span>}
                {i === crumbs.length - 1 ? (
                  <span className="font-bold">{c.title}</span>
                ) : (
                  <button
                    onClick={() => navigate(c.path)}
                    className="text-[color:var(--sap-soft)] underline-offset-2 hover:underline"
                  >
                    {c.title}
                  </button>
                )}
              </span>
            ))}
          </nav>

          <div className="mt-3 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border border-b-0 border-[color:var(--sap-frame)] px-3 py-2">
                <div role="group" aria-label="RUN / PROG switch" className="flex">
                  {[
                    ["RUN", false],
                    ["PROG", true],
                  ].map(([label, on], i) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={sim.prog === on}
                      onClick={() => setProgSwitch(on)}
                      className={`border border-[color:var(--sap-ink)] px-2.5 py-1 font-mono text-[13px] ${
                        i ? "-ml-px" : ""
                      } ${
                        sim.prog === on
                          ? "bg-[color:var(--sap-ink)] text-[color:var(--sap-bg)]"
                          : "hover:bg-[color:var(--sap-hover)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={btn}
                    onClick={() => {
                      setRunning(false);
                      setSim((s) => clear(s));
                    }}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className={btn}
                    disabled={clockStopped || running}
                    onClick={() => setSim((s) => step(s))}
                  >
                    Step
                  </button>
                  <button
                    type="button"
                    className={`${btn} w-[4.5rem]`}
                    disabled={clockStopped}
                    onClick={() => setRunning((r) => !r)}
                  >
                    {running ? "Pause" : "Run"}
                  </button>
                  <div role="group" aria-label="Clock rate" className="flex">
                    {RATE_LABELS.map(([r, label], i) => (
                      <button
                        key={r}
                        type="button"
                        aria-pressed={rate === r}
                        onClick={() => setRate(r)}
                        className={`border border-[color:var(--sap-ink)] px-2 py-1 font-mono text-[12px] ${
                          i ? "-ml-px" : ""
                        } ${
                          rate === r
                            ? "bg-[color:var(--sap-ink)] text-[color:var(--sap-bg)]"
                            : "hover:bg-[color:var(--sap-hover)]"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={btn}
                    onClick={() => {
                      setRunning(false);
                      setSim((s) => clear(loadExample(s)));
                    }}
                  >
                    Load example
                  </button>
                </div>
                <div className="flex gap-1 font-mono text-[13px]" aria-label="T state">
                  {[1, 2, 3, 4, 5, 6].map((t) => (
                    <span
                      key={t}
                      className={`px-1.5 py-0.5 ${
                        !sim.halted && sim.t === t
                          ? "bg-[color:var(--sap-type-status)] text-[color:var(--sap-on-accent)]"
                          : t <= 3
                            ? "text-[color:var(--sap-muted)]"
                            : "text-[color:var(--sap-faint)]"
                      }`}
                    >
                      T{t}
                    </span>
                  ))}
                </div>
                <div className="font-mono text-[13px]">
                  CON <span className="font-bold">{hex(d.con, 3)}H</span>
                </div>
                <div className="font-mono text-[13px]">
                  OUT <span className="font-bold">{bin(sim.out)}</span> = {sim.out}
                </div>
              </div>

              {sim.prog && (
                <ProgSwitches
                  sim={sim}
                  onAddrBit={(i) => setSim((s) => toggleAddrBit(s, i))}
                  onDataBit={(i) => setSim((s) => toggleDataBit(s, i))}
                  onWrite={() => setSim((s) => write(s))}
                />
              )}

              <div className="overflow-x-auto border border-[color:var(--sap-frame)]">
                <svg
                  ref={svgRef}
                  viewBox={FULL.join(" ")}
                  className="block h-auto w-full min-w-[680px] select-none outline-none"
                  tabIndex={-1}
                  role="group"
                  aria-label={showPanel ? "SAP-1 front panel" : `${node.title} diagram`}
                >
                  <defs>
                    <style>{TB_CSS}</style>
                    {[["off", pal.ink], ...Object.entries(pal.type)].map(([id, color]) => (
                      <marker
                        key={id}
                        id={`sap1-arrow-${id}`}
                        viewBox="0 0 10 10"
                        refX={9}
                        refY={5}
                        markerWidth={9}
                        markerHeight={9}
                        markerUnits="userSpaceOnUse"
                        orient="auto-start-reverse"
                      >
                        <path d="M0,1 L10,5 L0,9 z" fill={color} />
                      </marker>
                    ))}
                  </defs>
                  <g ref={sceneRef}>
                    {showPanel ? (
                      <GamePanel
                        sim={sim}
                        d={d}
                        setSim={setSim}
                        running={running}
                        setRunning={setRunning}
                        rate={rate}
                        setRate={setRate}
                        stepMs={stepMs}
                        onOpen={openPart}
                        focusId={focusId}
                        onEnter={onEnter}
                        onLeave={onLeave}
                        onActivate={onActivate}
                        highlight={tour.highlight}
                      />
                    ) : mode === "game" ? (
                      <GameDiagram
                        node={node}
                        path={path}
                        sim={sim}
                        d={d}
                        focusId={focusId}
                        onEnter={onEnter}
                        onLeave={onLeave}
                        onActivate={onActivate}
                        stepMs={stepMs}
                      />
                    ) : (
                      <Diagram
                        node={node}
                        path={path}
                        sim={sim}
                        d={d}
                        focusId={focusId}
                        onEnter={onEnter}
                        onLeave={onLeave}
                        onActivate={onActivate}
                        stepMs={stepMs}
                      />
                    )}
                  </g>
                </svg>
              </div>

              <p className="border border-t-0 border-[color:var(--sap-frame)] px-3 py-2 text-sm" aria-live="polite">
                <span className="font-bold">
                  {sim.prog
                    ? "PROG · clock stopped"
                    : sim.halted
                      ? "Halted"
                      : `T${sim.t} · ${sim.t <= 3 ? "fetch" : `execute ${d.op}`}`}
                </span>{" "}
                — {describe(sim)}
              </p>
              <p className="mt-2 text-xs text-[color:var(--sap-muted)]">
                {mode === "game"
                  ? "Lit parts are active in this T state: amber carries an address, green data, red control signals and the output, warm white the clock and T states."
                  : "Red marks what is active in this T state."}{" "}
                Esc or the breadcrumbs go back up a level.
              </p>
              {/* Below lg: the mission on view, docked to the bottom of the screen. */}
              <TourDock
                tour={tour}
                sim={sim}
                d={d}
                offPanel={!showPanel}
                invite={tour.invite && mode === "game"}
                onBackToPanel={backToPanel}
                onLoadExample={() => setSim((s) => loadExample(s))}
                onRestart={() => startTour({ restart: true })}
                onStart={() => startTour({ restart: true })}
              />
            </div>

            <div className="min-w-0">
              {tour.open ? (
                <TourPanel
                  tour={tour}
                  sim={sim}
                  d={d}
                  offPanel={!showPanel}
                  onBackToPanel={backToPanel}
                  onLoadExample={() => setSim((s) => loadExample(s))}
                  onRestart={() => startTour({ restart: true })}
                />
              ) : (
                tour.invite &&
                mode === "game" && (
                  <TourInvite
                    onStart={() => startTour({ restart: true })}
                    onDecline={tour.decline}
                    className="max-lg:hidden"
                  />
                )
              )}
              <Panel
                node={node}
                path={path}
                focus={focus}
                drill={Boolean(focus && node.children?.[focus.id])}
                sim={sim}
                d={d}
                onOpen={(id) => navigate([...path, id])}
              />
            </div>
          </div>
        </main>
      </div>
    </PaletteContext.Provider>
  );
}
