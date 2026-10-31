// Game mode's drill-down diagrams, drawn as the hardware the book's SAP-1 was built from: black
// 74LS-series DIP packages on a dark green board, DIP-switch banks, push buttons and toggles, red
// LEDs, and jumper wires in the lamp color of what they carry (theme.js TYPE_LED). The data is the
// same as the textbook diagrams (sap1Parts.js), and so is the hover / click / keyboard behaviour;
// only the drawing differs. Gradients, patterns, filters and arrowheads are defined once, in
// GameDefs, with gm-* ids (the front panel uses gp-*).
//
// Pieces to reuse: Jumper (one wire, idle or lit), Led (one lamp), wireColor(type, on), Pulse (a
// dash that runs along a lit wire, from driver to loader, once per clock period).

import { CANVAS } from "./sap1Parts";
import { CON_ORDER, bin, hex } from "./sap1Sim";
import { GAME as P, TYPE_LED } from "./theme";
import { signalType } from "./signalTypes";
import { SvgText } from "./sigText";

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const BOARD = "#0b1510"; // the circuit board under everything
const SILK = P.ink; // silkscreen lettering on the board
const PRINT = "#d9d7d0"; // part numbers printed on the chips
const PRINT_SUB = "#8f8d86";
const EDGE = "#050806"; // wire insulation, shadows

// Blend two #rrggbb colors (t = 0 → a, 1 → b).
export function mix(a, b, t) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

// Wire colors by signal type: lit is the type's lamp color, idle a dim tone of it.
const DIM = Object.fromEntries(Object.entries(P.type).map(([t, on]) => [t, mix(on, P.typeOff[t], 0.6)]));
export const wireColor = (type, on) => (on ? P.type[type] : DIM[type]);

// A thin outline in the board color, so text stays readable over wires and holes.
const HALO = { stroke: BOARD, strokeWidth: 3, strokeLinejoin: "round", paintOrder: "stroke" };

// Where to draw a wire's bit-width mark: at bitsAt if given, else halfway along its longest
// segment. Shared with the textbook Wire.
export function bitsMarker(pts, at) {
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const h = y1 === y2;
    if (at) {
      const inside = h
        ? at[1] === y1 && at[0] >= Math.min(x1, x2) && at[0] <= Math.max(x1, x2)
        : at[0] === x1 && at[1] >= Math.min(y1, y2) && at[1] <= Math.max(y1, y2);
      if (inside) return { x: at[0], y: at[1], h };
    } else {
      const len = Math.abs(x2 - x1) + Math.abs(y2 - y1);
      if (!best || len > best.len) best = { x: (x1 + x2) / 2, y: (y1 + y2) / 2, h, len };
    }
  }
  return best;
}

// --- defs -----------------------------------------------------------------------------------

const ARROW_TRIM = 7; // a wire with an arrowhead stops this far short of its end; the head covers it

// The pulse and flash animations. A pulse is a dash on a polyline with pathLength 100: its
// dasharray is "<dash> 100" and its dashoffset starts at <dash> (just before the start), so moving
// the offset to -100 carries it from the first point to just past the last, then it loops.
// Reduced motion keeps the lit wires and drops the movement.
const GM_CSS = `
.gm-pulse { animation-name: gm-pulse; animation-timing-function: linear; animation-iteration-count: infinite; }
@keyframes gm-pulse { to { stroke-dashoffset: -100; } }
.gm-flash { animation: gm-flash 450ms ease-out; }
@keyframes gm-flash { from { opacity: 1; } to { opacity: 0.5; } }
@media (prefers-reduced-motion: reduce) {
  .gm-pulse { display: none; }
  .gm-flash { animation: none; }
}`;

function GameDefs() {
  const lin = (id, stops, vertical = true) => (
    <linearGradient key={id} id={id} x1="0" y1="0" x2={vertical ? "0" : "1"} y2={vertical ? "1" : "0"}>
      {stops.map(([o, c]) => (
        <stop key={o} offset={o} stopColor={c} />
      ))}
    </linearGradient>
  );
  const metal = [
    ["0", "#6c6c6c"],
    ["0.45", "#ececec"],
    ["1", "#7a7a7a"],
  ];
  return (
    <defs>
      <style>{GM_CSS}</style>
      <pattern id="gm-board-holes" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="10" cy="10" r="1.9" fill="none" stroke="#1a2e22" strokeWidth="0.7" />
        <circle cx="10" cy="10" r="1" fill="#000" opacity="0.55" />
      </pattern>
      <pattern id="gm-proto-holes" width="10" height="10" patternUnits="userSpaceOnUse">
        <circle cx="5" cy="5" r="2.1" fill="none" stroke="#2c4a35" strokeWidth="0.7" opacity="0.7" />
        <circle cx="5" cy="5" r="1.2" fill="#06100a" />
      </pattern>
      {lin("gm-chip", [
        ["0", "#2e2e33"],
        ["0.12", "#1d1d21"],
        ["1", "#101012"],
      ])}
      {lin("gm-chip-hi", [
        ["0", "#45454c"],
        ["0.12", "#2d2d33"],
        ["1", "#1e1e23"],
      ])}
      {lin("gm-plate", [
        ["0", "#2c2b27"],
        ["1", "#1a1917"],
      ])}
      {lin("gm-plate-hi", [
        ["0", "#3d3c36"],
        ["1", "#282722"],
      ])}
      {lin("gm-dipsw", [
        ["0", "#7d2219"],
        ["1", "#4c120d"],
      ])}
      {lin("gm-slider", [
        ["0", "#fbf4e2"],
        ["1", "#c9bd9e"],
      ])}
      {lin("gm-leg-v", metal, false)}
      {lin("gm-leg-h", metal)}
      <radialGradient id="gm-metal" cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stopColor="#f4f4f4" />
        <stop offset="0.55" stopColor="#a2a2a2" />
        <stop offset="1" stopColor="#4c4c4c" />
      </radialGradient>
      <radialGradient id="gm-cap" cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stopColor="#56565c" />
        <stop offset="0.6" stopColor="#1c1c1f" />
        <stop offset="1" stopColor="#060606" />
      </radialGradient>
      <filter id="gm-glow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="6" />
      </filter>
      <filter id="gm-led-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="3.2" />
      </filter>
      <filter id="gm-text-glow" x="-20%" y="-50%" width="140%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      {Object.entries(P.led).flatMap(([c, { on, off }]) => [
        <radialGradient key={`on-${c}`} id={`gm-led-on-${c}`} cx="0.42" cy="0.38" r="0.62">
          <stop offset="0" stopColor={mix(on, "#ffffff", 0.7)} />
          <stop offset="0.45" stopColor={on} />
          <stop offset="1" stopColor={mix(on, "#000000", 0.3)} />
        </radialGradient>,
        <radialGradient key={`off-${c}`} id={`gm-led-off-${c}`} cx="0.42" cy="0.38" r="0.65">
          <stop offset="0" stopColor={mix(off, "#ffffff", 0.14)} />
          <stop offset="0.7" stopColor={off} />
          <stop offset="1" stopColor={mix(off, "#000000", 0.45)} />
        </radialGradient>,
      ])}
      {Object.keys(P.type).flatMap((t) =>
        [true, false].map((on) => (
          <marker
            key={`${t}-${on}`}
            id={`gm-arrow-${on ? "on" : "off"}-${t}`}
            viewBox="0 0 10 10"
            refX={10 - ARROW_TRIM}
            refY={5}
            markerWidth={10}
            markerHeight={10}
            markerUnits="userSpaceOnUse"
            orient="auto-start-reverse"
          >
            <path d="M0,0.6 L10,5 L0,9.4 z" fill={wireColor(t, on)} stroke={EDGE} strokeWidth={0.7} strokeLinejoin="round" />
          </marker>
        ))
      )}
    </defs>
  );
}

// --- wires ----------------------------------------------------------------------------------

const pointsAttr = (pts) => pts.map((p) => p.join(",")).join(" ");

// The path with its last point pulled back by `by` px. Shared with the textbook Wire.
export function trimEnd(pts, by) {
  const out = pts.map((p) => [...p]);
  const [x1, y1] = out[out.length - 2];
  const [x2, y2] = out[out.length - 1];
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len > by) out[out.length - 1] = [x2 - ((x2 - x1) / len) * by, y2 - ((y2 - y1) / len) * by];
  return out;
}

// A pulse runs the length of its wire once per clock period, but never faster than this, so it
// still reads at the fast rate.
const PULSE_MIN_MS = 300;

const pathLength = (pts) => pts.slice(1).reduce((n, [x, y], i) => n + Math.hypot(x - pts[i][0], y - pts[i][1]), 0);

// A bright dash travelling along pts, from the first point to the last, looping (see GM_CSS for
// the dash math). className picks the keyframes: gm-pulse here, tb-pulse in the textbook drawing.
// The dash is about 26 px long, kept between 5% and 40% of the wire.
export function Pulse({ pts, stroke, width, stepMs, className = "gm-pulse", opacity }) {
  const dash = Math.min(40, Math.max(5, (26 / Math.max(1, pathLength(pts))) * 100));
  return (
    <polyline
      className={className}
      points={pointsAttr(pts)}
      pathLength={100}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeOpacity={opacity}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={`${dash.toFixed(2)} 100`}
      strokeDashoffset={dash.toFixed(2)}
      style={{ animationDuration: `${Math.max(stepMs, PULSE_MIN_MS)}ms` }}
    />
  );
}

// One jumper wire along pts ([[x, y], ...]) in the color of its signal type: dim when idle; when
// lit, bright with a soft glow (wide translucent strokes, so no filter is needed) and, given the
// clock period stepMs, a pulse running from the first point to the last (from the last to the
// first when reverse is set).
export function Jumper({ pts, type, on, arrow = false, stepMs, reverse = false }) {
  const color = wireColor(type, on);
  const full = pointsAttr(pts);
  const bodyPts = arrow ? trimEnd(pts, ARROW_TRIM) : pts;
  const body = pointsAttr(bodyPts);
  const pulsePts = reverse ? [...bodyPts].reverse() : bodyPts;
  const line = { fill: "none", strokeLinejoin: "round" };
  return (
    <g>
      {on && <polyline points={full} {...line} stroke={color} strokeWidth={11} strokeOpacity={0.09} strokeLinecap="round" />}
      {on && <polyline points={full} {...line} stroke={color} strokeWidth={6} strokeOpacity={0.2} strokeLinecap="round" />}
      <polyline points={body} {...line} stroke={EDGE} strokeWidth={on ? 4.6 : 4} />
      <polyline
        points={body}
        {...line}
        stroke={color}
        strokeWidth={on ? 2.6 : 2.2}
        markerEnd={arrow ? `url(#gm-arrow-${on ? "on" : "off"}-${type})` : undefined}
      />
      {on && <polyline points={body} {...line} stroke={mix(color, "#ffffff", 0.6)} strokeWidth={0.8} strokeOpacity={0.8} />}
      {on && stepMs > 0 && <Pulse pts={pulsePts} stroke={color} width={7} opacity={0.35} stepMs={stepMs} />}
      {on && stepMs > 0 && <Pulse pts={pulsePts} stroke={mix(color, "#ffffff", 0.75)} width={2.6} stepMs={stepMs} />}
    </g>
  );
}

function Solder({ x, y, color }) {
  return (
    <g>
      <circle cx={x} cy={y} r={4.6} fill={EDGE} />
      <circle cx={x} cy={y} r={3.4} fill={color} />
      <circle cx={x - 1.1} cy={y - 1.2} r={1.1} fill="#fff" opacity={0.35} />
    </g>
  );
}

function GameWire({ w, d, stepMs }) {
  const on = Boolean(w.on && d.sig.has(w.on));
  const type = signalType(w);
  const color = wireColor(type, on);
  const text = on ? color : P.muted;
  const m = w.bits ? bitsMarker(w.pts, w.bitsAt) : null;
  const tick = m && (m.h ? [m.x - 4, m.y + 6, m.x + 4, m.y - 6] : [m.x - 6, m.y + 4, m.x + 6, m.y - 4]);
  return (
    <g>
      <Jumper pts={w.pts} type={type} on={on} arrow={w.arrow !== false} stepMs={stepMs} />
      {m && (
        <g>
          <line x1={tick[0]} y1={tick[1]} x2={tick[2]} y2={tick[3]} stroke={EDGE} strokeWidth={3.6} strokeLinecap="round" />
          <line
            x1={tick[0]}
            y1={tick[1]}
            x2={tick[2]}
            y2={tick[3]}
            stroke={on ? color : mix(color, SILK, 0.35)}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          <text
            x={m.h ? m.x : m.x + 10}
            y={m.h ? m.y + 19 : m.y + 4}
            textAnchor={m.h ? "middle" : "start"}
            fontSize={11}
            fill={text}
            {...HALO}
          >
            {w.bits}
          </text>
        </g>
      )}
      {w.dots?.map(([x, y], i) => <Solder key={i} x={x} y={y} color={color} />)}
      {w.label && (
        <text x={w.labelAt[0]} y={w.labelAt[1]} textAnchor={w.anchor ?? "middle"} fontSize={12} fill={text} {...HALO}>
          <SvgText text={w.label} />
        </text>
      )}
    </g>
  );
}

// A control line coming in from elsewhere: a short jumper ending in a pad, with its signal name.
// Its pulse runs from the pad in to the part.
function GamePin({ p, d, stepMs }) {
  const on = CON_ORDER.includes(p.sig) && d.sig.has(p.sig);
  const type = signalType(p);
  const color = wireColor(type, on);
  const len = p.len ?? 30;
  const [x, y] = p.at;
  let [x2, y2, lx, ly, anchor] = [x, y, x, y, "middle"];
  if (p.dir === "left") [x2, lx, ly, anchor] = [x - len, x - len - 6, y + 4.5, "end"];
  if (p.dir === "right") [x2, lx, ly, anchor] = [x + len, x + len + 6, y + 4.5, "start"];
  if (p.dir === "up") [y2, ly] = [y - len, y - len - 7];
  if (p.dir === "down") [y2, ly] = [y + len, y + len + 16];
  return (
    <g>
      <Jumper
        pts={[
          [x, y],
          [x2, y2],
        ]}
        type={type}
        on={on}
        stepMs={stepMs}
        reverse
      />
      <circle cx={x2} cy={y2} r={3.4} fill={EDGE} />
      <circle cx={x2} cy={y2} r={2.3} fill={color} />
      <text
        x={lx}
        y={ly}
        textAnchor={anchor}
        fontSize={13}
        fontWeight={on ? 700 : 400}
        fill={on ? color : mix(color, SILK, 0.5)}
        {...HALO}
      >
        <SvgText text={`{${p.sig}}`} />
      </text>
    </g>
  );
}

// --- board ----------------------------------------------------------------------------------

// A prototyping-board area holding a few chips, with its label silkscreened on.
function GameGroup({ g, sim, d, path }) {
  const active = g.act?.some((k) => d.sig.has(k));
  const hot = P.type[signalType(g, { d, path })];
  const value = g.value?.(sim, d);
  return (
    <g>
      {active && (
        <rect x={g.x - 2} y={g.y - 2} width={g.w + 4} height={g.h + 4} rx={8} fill="none" stroke={hot} strokeWidth={6} strokeOpacity={0.16} />
      )}
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={6} fill="#11241a" />
      <rect x={g.x} y={g.y} width={g.w} height={g.h} rx={6} fill="url(#gm-proto-holes)" />
      <rect
        x={g.x}
        y={g.y}
        width={g.w}
        height={g.h}
        rx={6}
        fill="none"
        stroke={active ? hot : "#2f4c39"}
        strokeOpacity={active ? 0.9 : 1}
        strokeWidth={active ? 1.6 : 1}
      />
      <rect x={g.x + 4} y={g.y + 4} width={g.w - 8} height={g.h - 8} rx={4} fill="none" stroke={SILK} strokeOpacity={0.14} />
      <text x={g.x + 10} y={g.y + 16} fontSize={10.5} fontFamily={FONT} letterSpacing={1.2} fill={SILK} opacity={0.8} {...HALO}>
        {g.label.toUpperCase()}
      </text>
      {value && (
        <text x={g.x + g.w - 10} y={g.y + 16} textAnchor="end" fontSize={12.5} fontFamily={MONO} fill={active ? hot : SILK} {...HALO}>
          {value}
        </text>
      )}
    </g>
  );
}

// --- lamps, switches and fittings -----------------------------------------------------------

// One LED: its seat, a glow when lit, the lens and a highlight. color is a lamp name (red, amber...).
export function Led({ x, y, r = 7, color = "red", on }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r + 2.2} fill="#08090a" stroke="#000" strokeWidth={0.8} />
      {on && <circle cx={x} cy={y} r={r * 2.1} fill={P.led[color].on} opacity={0.45} filter="url(#gm-led-glow)" />}
      <circle cx={x} cy={y} r={r} fill={`url(#gm-led-${on ? "on" : "off"}-${color})`} />
      <ellipse cx={x - r * 0.32} cy={y - r * 0.4} rx={r * 0.42} ry={r * 0.24} fill="#fff" opacity={on ? 0.55 : 0.16} />
    </g>
  );
}

// The "+" that marks a part you can open: a Phillips screw head that lights up when focused.
function DrillScrew({ x, y, focused }) {
  return (
    <g>
      {focused && <circle cx={x} cy={y} r={13} fill={P.led.white.on} opacity={0.4} filter="url(#gm-led-glow)" />}
      <circle cx={x} cy={y} r={8.5} fill={focused ? "url(#gm-led-on-white)" : "url(#gm-metal)"} stroke="#000" strokeWidth={1} />
      <path d={`M${x - 4.5} ${y}h9M${x} ${y - 4.5}v9`} stroke="#262626" strokeWidth={2} strokeLinecap="round" />
    </g>
  );
}

// A row of slide switches, one per character of bits ('1' = on, slider up), MSB on the left.
function DipSwitches({ cx, cy, bits }) {
  const cell = 16;
  const w = bits.length * cell + 10;
  const [x0, y0] = [cx - w / 2, cy - 13];
  return (
    <g>
      <rect x={x0} y={y0} width={w} height={26} rx={2} fill="url(#gm-dipsw)" stroke="#000" strokeWidth={1} />
      <path d={`M${x0 + 2} ${y0 + 1}H${x0 + w - 2}`} stroke="#fff" strokeOpacity={0.18} />
      {[...bits].map((bit, i) => {
        const sx = x0 + 5 + i * cell + cell / 2;
        return (
          <g key={i}>
            <rect x={sx - 3.8} y={y0 + 5} width={7.6} height={16} rx={1} fill="#0a0a0a" />
            <rect x={sx - 3.2} y={bit === "1" ? y0 + 5.6 : y0 + 13.4} width={6.4} height={7} rx={0.8} fill="url(#gm-slider)" />
          </g>
        );
      })}
    </g>
  );
}

function PushButton({ cx, cy }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={15} fill="url(#gm-metal)" stroke="#000" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={11} fill="#050505" />
      <circle cx={cx} cy={cy} r={9.6} fill="url(#gm-cap)" />
      <ellipse cx={cx - 3} cy={cy - 3.6} rx={4} ry={2.3} fill="#fff" opacity={0.14} />
    </g>
  );
}

// A bat-handle toggle between two named positions (up, down).
function Toggle({ cx, cy, down, names }) {
  const tip = cy + (down ? 13 : -13);
  const hex6 = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${cx + 10 * Math.cos(a)},${cy + 10 * Math.sin(a)}`;
  }).join(" ");
  return (
    <g>
      {names.length === 2 &&
        names.map((n, i) => (
          <text
            key={n}
            x={cx}
            y={i ? cy + 28 : cy - 21}
            textAnchor="middle"
            fontSize={8.5}
            fontFamily={FONT}
            letterSpacing={0.6}
            fontWeight={Boolean(i) === down ? 700 : 400}
            fill={SILK}
            opacity={Boolean(i) === down ? 1 : 0.55}
          >
            {n.toUpperCase()}
          </text>
        ))}
      <polygon points={hex6} fill="url(#gm-metal)" stroke="#000" strokeWidth={1} />
      <circle cx={cx} cy={cy} r={5.5} fill="#0a0a0a" />
      <line x1={cx} y1={cy} x2={cx} y2={tip} stroke="#000" strokeWidth={6.2} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={cx} y2={tip} stroke="#bdbdbd" strokeWidth={4.2} strokeLinecap="round" />
      <line x1={cx - 0.9} y1={cy} x2={cx - 0.9} y2={tip} stroke="#f4f4f4" strokeWidth={1.1} strokeLinecap="round" />
      <circle cx={cx} cy={tip} r={3.6} fill="#e6e6e6" stroke="#000" strokeWidth={0.8} />
    </g>
  );
}

// --- blocks ---------------------------------------------------------------------------------

// The same button behaviour as the textbook blocks: hover / focus show the part in the info panel,
// click / Enter / Space open it (drill) or select it.
function handlers(b, drill, { onEnter, onLeave, onActivate }) {
  const name = [b.tag, b.title].filter(Boolean).join(" ");
  return {
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
}

// The block's whole rectangle, so gaps between pins still count as hovering it.
const Hit = ({ b }) => <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" />;

const FocusRing = ({ b }) => (
  <rect x={b.x - 4} y={b.y - 4} width={b.w + 8} height={b.h + 8} rx={7} fill="none" stroke={SILK} strokeOpacity={0.85} strokeWidth={1.5} />
);

// The reference designator (C4, S1...) silkscreened on the board above the part's top-left corner.
const Tag = ({ b }) =>
  b.tag ? (
    <text x={b.x + 2} y={b.y - 4} fontSize={10.5} fontFamily={FONT} letterSpacing={0.8} fill={SILK} opacity={0.85} {...HALO}>
      {b.tag}
    </text>
  ) : null;

// Stacked, centred lines of text ({ text, size, weight?, mono?, fill, glow? }) or other rows
// ({ size, draw: (top) => element }) inside the box [x, y, w, h].
function Lines({ lines, x, y, w, h, gap = 6, align = "middle" }) {
  const total = lines.reduce((sum, l) => sum + l.size, 0) + gap * (lines.length - 1);
  let cursor = y + h / 2 - total / 2;
  const tx = align === "start" ? x : x + w / 2;
  return lines.map((l, i) => {
    const top = cursor;
    cursor += l.size + gap;
    if (l.draw) return <g key={i}>{l.draw(top)}</g>;
    return (
      <text
        key={i}
        x={tx}
        y={top + l.size * 0.82}
        textAnchor={align}
        fontSize={l.size}
        fontWeight={l.weight ?? 400}
        fontFamily={l.mono ? MONO : FONT}
        letterSpacing={l.spacing}
        fill={l.fill}
        filter={l.glow ? "url(#gm-text-glow)" : undefined}
      >
        {l.text}
      </text>
    );
  });
}

const PIN_OUT = 6; // how far a chip's pins stick out of its package
const PITCH = 24; // pin spacing

// A chip: a black DIP package with a row of pins along each long side, a notch and a pin-1 dot.
// While active it glows, and the glow flares briefly at each new T state.
function GameChip({ b, sim, d, path, drill, focused, ev, stepMs }) {
  const active = Boolean(b.act?.some((k) => d.sig.has(k)));
  const hot = P.type[signalType(b, { d, path })];
  const value = b.value?.(sim, d);
  const vertical = b.h > b.w;
  const [bx, by, bw, bh] = vertical
    ? [b.x + PIN_OUT, b.y, b.w - 2 * PIN_OUT, b.h]
    : [b.x, b.y + PIN_OUT, b.w, b.h - 2 * PIN_OUT];
  const long = vertical ? bh : bw;
  const n = Math.max(3, Math.floor((long - 20) / PITCH) + 1);
  const first = (long - (n - 1) * PITCH) / 2;
  const legFill = `url(#gm-leg-${vertical ? "h" : "v"})`;
  const legs = [];
  for (let i = 0; i < n; i++) {
    const t = first + i * PITCH;
    // [tip x, y, w, h], [shoulder x, y, w, h] on each side
    const sides = vertical
      ? [
          [[b.x, by + t - 1.4, PIN_OUT, 2.8], [bx - 2.6, by + t - 2.6, 3.2, 5.2]],
          [[bx + bw, by + t - 1.4, PIN_OUT, 2.8], [bx + bw - 0.6, by + t - 2.6, 3.2, 5.2]],
        ]
      : [
          [[bx + t - 1.4, b.y, 2.8, PIN_OUT], [bx + t - 2.6, by - 2.6, 5.2, 3.2]],
          [[bx + t - 1.4, by + bh, 2.8, PIN_OUT], [bx + t - 2.6, by + bh - 0.6, 5.2, 3.2]],
        ];
    sides.forEach((parts, s) =>
      parts.forEach(([x, y, w, h], k) =>
        legs.push(<rect key={`${i}-${s}-${k}`} x={x} y={y} width={w} height={h} fill={legFill} />)
      )
    );
  }
  const [cx, cy] = [bx + bw / 2, by + bh / 2];
  const notch = vertical ? `M${cx - 6} ${by}A6 6 0 0 0 ${cx + 6} ${by}Z` : `M${bx} ${cy - 6}A6 6 0 0 1 ${bx} ${cy + 6}Z`;
  const dot = vertical ? [bx + 9, by + 9] : [bx + 9, by + bh - 9];

  const lines = [{ text: b.title, size: 15, weight: 700, spacing: 0.6, fill: PRINT }];
  if (b.sub) lines.push({ text: b.sub, size: 11.5, fill: PRINT_SUB });
  if (value != null) lines.push({ text: value, size: 13, mono: true, fill: active ? hot : SILK, glow: active });

  return (
    <g {...handlers(b, drill, ev)}>
      <Hit b={b} />
      {active && (
        <rect
          key={`glow-${sim.cycles}`}
          className="gm-flash"
          x={bx - 2}
          y={by - 2}
          width={bw + 4}
          height={bh + 4}
          rx={6}
          fill={hot}
          opacity={0.5}
          filter="url(#gm-glow)"
          style={stepMs ? { animationDuration: `${Math.round(Math.min(450, stepMs * 0.9))}ms` } : undefined}
        />
      )}
      {legs}
      <rect
        x={bx}
        y={by}
        width={bw}
        height={bh}
        rx={3.5}
        fill={focused ? "url(#gm-chip-hi)" : "url(#gm-chip)"}
        stroke={active ? hot : "#000"}
        strokeOpacity={active ? 0.85 : 1}
        strokeWidth={active ? 1.4 : 1}
      />
      <rect x={bx + 1.5} y={by + 1.5} width={bw - 3} height={bh - 3} rx={2.5} fill="none" stroke="#fff" strokeOpacity={0.06} />
      <path d={`M${bx + 4} ${by + 1.2}H${bx + bw - 4}`} stroke="#fff" strokeOpacity={0.16} />
      <path d={notch} fill="#060607" stroke="#fff" strokeOpacity={0.08} />
      <circle cx={dot[0]} cy={dot[1]} r={2.4} fill="#0a0a0b" stroke="#fff" strokeOpacity={0.12} strokeWidth={0.6} />
      <Lines lines={lines} x={bx} y={by} w={bw} h={bh} />
      {drill && <DrillScrew x={bx + bw - 14} y={by + 14} focused={focused} />}
      <Tag b={b} />
      {focused && <FocusRing b={b} />}
    </g>
  );
}

// A switch on a small metal plate: a DIP-switch bank when its value is a bit string (S1, S3; a
// space between nibbles is allowed),
// otherwise a push button or a toggle (named "UP / DOWN" by its title; down when its value says so).
function GameSwitch({ b, sim, d, drill, focused, ev }) {
  const value = b.value?.(sim, d);
  const bits = typeof value === "string" && /^[01 ]+$/.test(value) ? value.replace(/ /g, "") : null;
  let inner;
  if (bits) {
    const lines = [
      { text: b.title, size: 12.5, weight: 700, fill: SILK },
      { size: 26, draw: (top) => <DipSwitches cx={b.x + b.w / 2} cy={top + 13} bits={bits} /> },
      { text: value, size: 13, mono: true, fill: SILK },
    ];
    inner = <Lines lines={lines} x={b.x} y={b.y} w={b.w} h={b.h} gap={b.h >= 85 ? 6 : 4} />;
  } else {
    const push = /push button/i.test(b.sub ?? "");
    const names = b.title.split(" / ");
    const down = !push && names.length === 2 && value != null && value.toUpperCase().includes(names[1].toUpperCase());
    const [cx, cy] = [b.x + 23, b.y + b.h / 2];
    const lines = [{ text: b.title, size: 12.5, weight: 700, fill: SILK }];
    if (b.sub) lines.push({ text: b.sub, size: 11, fill: P.muted });
    if (value != null) lines.push({ text: value, size: 12, mono: true, fill: SILK });
    inner = (
      <>
        {push ? <PushButton cx={cx} cy={cy} /> : <Toggle cx={cx} cy={cy} down={down} names={names} />}
        <Lines lines={lines} x={b.x + 44} y={b.y} w={b.w - 48} h={b.h} gap={5} align="start" />
      </>
    );
  }
  return (
    <g {...handlers(b, drill, ev)}>
      <Hit b={b} />
      <Plate b={b} focused={focused} />
      {inner}
      {drill && <DrillScrew x={b.x + b.w - 14} y={b.y + 14} focused={focused} />}
      <Tag b={b} />
      {focused && <FocusRing b={b} />}
    </g>
  );
}

function Plate({ b, focused }) {
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={6} fill={focused ? "url(#gm-plate-hi)" : "url(#gm-plate)"} stroke="#000" strokeWidth={1} />
      <rect x={b.x + 1.5} y={b.y + 1.5} width={b.w - 3} height={b.h - 3} rx={4.5} fill="none" stroke="#fff" strokeOpacity={0.07} />
    </g>
  );
}

// x positions of n lamps centred on cx, `step` apart, with an extra `gap` after every four.
function lampXs(n, cx, step, gap = 0) {
  const width = (n - 1) * step + (Math.ceil(n / 4) - 1) * gap;
  return Array.from({ length: n }, (_, i) => cx - width / 2 + i * step + Math.floor(i / 4) * gap);
}

// The binary display: eight red LEDs showing the output register, its value printed underneath.
function GameDisplay({ b, sim, drill, focused, ev }) {
  const xs = lampXs(8, b.x + b.w / 2, 24, 8);
  const lines = [
    { text: b.title, size: 12.5, weight: 700, fill: SILK },
    {
      size: 20,
      draw: (top) => xs.map((x, i) => <Led key={i} x={x} y={top + 10} r={7.5} color="red" on={Boolean((sim.out >> (7 - i)) & 1)} />),
    },
    { text: bin(sim.out), size: 13, mono: true, fill: SILK },
  ];
  return (
    <g {...handlers(b, drill, ev)}>
      <Hit b={b} />
      <Plate b={b} focused={focused} />
      <Lines lines={lines} x={b.x} y={b.y} w={b.w} h={b.h} />
      <Tag b={b} />
      {focused && <FocusRing b={b} />}
    </g>
  );
}

// The W bus as a strip of lamps, one per line (MSB at the top), in the color of what it carries.
function GameBus({ b, d, path, drill, focused, ev }) {
  const lamp = TYPE_LED[signalType(b, { d, path })];
  const cx = b.x + b.w / 2;
  const step = (b.h - 40) / 7;
  return (
    <g {...handlers(b, drill, ev)}>
      <Hit b={b} />
      <Plate b={b} focused={focused} />
      <text x={cx} y={b.y - 8} textAnchor="middle" fontSize={13} fontWeight={700} fontFamily={FONT} fill={SILK} {...HALO}>
        {b.title}
      </text>
      {Array.from({ length: 8 }, (_, i) => (
        <Led
          key={i}
          x={cx}
          y={b.y + 20 + i * step}
          r={Math.min(7, b.w / 2 - 5)}
          color={lamp}
          on={d.bus !== null && Boolean((d.bus >> (7 - i)) & 1)}
        />
      ))}
      {focused && <FocusRing b={b} />}
    </g>
  );
}

// The control word as a row of red lamps, one per CON bit, each named underneath.
function GameCon({ b, d, drill, focused, ev }) {
  const cell = b.w / CON_ORDER.length;
  const mid = b.y + b.h / 2 + 5;
  return (
    <g {...handlers(b, drill, ev)}>
      <Hit b={b} />
      <Plate b={b} focused={focused} />
      {CON_ORDER.map((k, i) => {
        const on = d.sig.has(k);
        const x = b.x + (i + 0.5) * cell;
        return (
          <g key={k}>
            <Led x={x} y={b.y + 10} r={4.5} color={TYPE_LED.control} on={on} />
            <text x={x} y={b.y + b.h - 5} textAnchor="middle" fontSize={11} fill={on ? P.type.control : SILK}>
              <SvgText text={`{${k}}`} />
            </text>
          </g>
        );
      })}
      <text x={b.x - 8} y={mid} textAnchor="end" fontSize={13} fontWeight={700} fill={SILK} {...HALO}>
        CON
      </text>
      <text x={b.x + b.w + 8} y={mid} fontSize={13} fontFamily={MONO} fill={SILK} {...HALO}>
        {hex(d.con, 3)}H
      </text>
      {focused && <FocusRing b={b} />}
    </g>
  );
}

const BLOCKS = { switch: GameSwitch, display: GameDisplay, bus: GameBus, con: GameCon };

// A diagram level (a node of sap1Parts.js) drawn as hardware. Same props as the textbook Diagram,
// including stepMs, the clock period that times the wire pulses.
export default function GameDiagram({ node, path, sim, d, focusId, onEnter, onLeave, onActivate, stepMs }) {
  const dg = node.diagram;
  const ev = { onEnter, onLeave, onActivate };
  return (
    <>
      <GameDefs />
      <rect x={0} y={0} width={CANVAS.w} height={CANVAS.h} fill={BOARD} />
      <rect x={0} y={0} width={CANVAS.w} height={CANVAS.h} fill="url(#gm-board-holes)" />
      {dg.groups?.map((g, i) => <GameGroup key={`g${i}`} g={g} sim={sim} d={d} path={path} />)}
      {dg.wires?.map((w, i) => <GameWire key={`w${i}`} w={w} d={d} stepMs={stepMs} />)}
      {dg.pins?.map((p, i) => <GamePin key={`p${i}`} p={p} d={d} stepMs={stepMs} />)}
      {dg.notes?.map((n, i) => (
        <text key={`n${i}`} x={n.at[0]} y={n.at[1]} textAnchor={n.anchor ?? "middle"} fontSize={11.5} fill={P.muted} {...HALO}>
          <SvgText text={n.text} />
        </text>
      ))}
      {dg.blocks.map((b) => {
        const Part = BLOCKS[b.kind] ?? GameChip;
        return (
          <Part
            key={b.id}
            b={b}
            sim={sim}
            d={d}
            path={path}
            drill={Boolean(node.children?.[b.id])}
            focused={focusId === b.id}
            ev={ev}
            stepMs={stepMs}
          />
        );
      })}
    </>
  );
}
