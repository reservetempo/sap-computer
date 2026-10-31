import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CANVAS, ROOT, ROOT_TALL, nodeAt, cleanPath, decodeWord } from "./sap1Parts";
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
import { TEXTBOOK as P, cssVars } from "./theme";
import { signalType } from "./signalTypes";
import { HtmlText, SvgText } from "./sigText";
import { PULSE_CSS, Pulse, bitsMarker, mix, trimEnd } from "./drawing";

// The color palette is P (theme.js TEXTBOOK). SVG parts read it directly; HTML parts use the
// matching CSS variables (--sap-*) set on the page root. An active part is drawn in the color of
// its signal type (P.type[signalType(...)]), which is the same red for every type.

// The free-running clock's period for each rate setting (the toolbar's speed buttons).
const STEP_MS = { slow: 1200, med: 550, fast: 150 };
// [rate, label, the short label a phone shows]
const RATE_LABELS = [
  ["slow", "Slow", "›"],
  ["med", "Med", "››"],
  ["fast", "Fast", "›››"],
];

const ARROW_TRIM = 8; // a lit wire's pulse stops where its arrowhead begins

// --- geometry & animation helpers -----------------------------------------------------------

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const smooth = (a, b, t) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
const lerpBox = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
const fullBox = (c) => [0, 0, c.w, c.h];
const growBox = (c, k) => [(-(k - 1) * c.w) / 2, (-(k - 1) * c.h) / 2, c.w * k, c.h * k];

// The block's rectangle, padded and widened to the aspect ratio of canvas c.
function fitBox(b, c, pad = 24) {
  let [x, y, w, h] = [b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad];
  const ar = c.w / c.h;
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

// A frame narrower than this (px) draws the overview upright (ROOT_TALL in sap1Parts.js).
const TALL_BELOW = 600;
const isTall = (p, narrow) => narrow && p.length === 0;
// The diagram drawn on level `p`, and the canvas it is drawn on.
const diagramAt = (p, narrow) => (isTall(p, narrow) ? ROOT_TALL : nodeAt(p)?.diagram);
const canvasAt = (p, narrow) => (isTall(p, narrow) ? ROOT_TALL.canvas : CANVAS);

// The block part `id` is drawn as on level `p`.
const partBox = (p, id, narrow) => diagramAt(p, narrow)?.blocks.find((b) => b.id === id);

const pathFromHash = () =>
  cleanPath(window.location.hash.replace(/^#\/?/, "").split("/").filter(Boolean));
const urlFor = (p) => (p.length ? `#/${p.join("/")}` : window.location.pathname + window.location.search);

// --- diagram pieces -------------------------------------------------------------------------

// A connection; while lit, a pulse runs along it from driver (first point) to loader (last point)
// once per clock period stepMs. Font sizes go through f, the diagram's minimum (see Diagram).
function Wire({ w, d, stepMs, f }) {
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
          pts={arrow ? trimEnd(w.pts, ARROW_TRIM) : w.pts}
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
            fontSize={f(11)}
            fill={on ? color : P.muted}
          >
            {w.bits}
          </text>
        </g>
      )}
      {w.dots?.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3.5} fill={color} />)}
      {w.label && (
        <text x={w.labelAt[0]} y={w.labelAt[1]} textAnchor={w.anchor ?? "middle"} fontSize={f(12)} fill={on ? color : P.muted}>
          <SvgText text={w.label} />
        </text>
      )}
    </g>
  );
}

function Pin({ p, d, f }) {
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
      <text x={lx} y={ly} textAnchor={anchor} fontSize={f(13)} fontWeight={on ? 700 : 400} fill={color}>
        <SvgText text={`{${p.sig}}`} />
      </text>
    </g>
  );
}

function Group({ g, sim, d, path, f }) {
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
      <text x={g.x + 10} y={g.y + 19} fontSize={f(11)} letterSpacing={0.6} fill={P.muted}>
        {g.label.toUpperCase()}
      </text>
      {value && (
        <text x={g.x + g.w - 10} y={g.y + 19} textAnchor="end" fontSize={f(12.5)} fontFamily={P.font.mono} fill={active ? hot : P.ink}>
          {value}
        </text>
      )}
    </g>
  );
}

// Eight LEDs across a block w wide: 22 apart, or closer in a narrow block.
function Leds({ cx, cy, value, w }) {
  const step = Math.min(22, (w - 20) / 8);
  return Array.from({ length: 8 }, (_, i) => {
    const lit = (value >> (7 - i)) & 1;
    return (
      <circle
        key={i}
        cx={cx + (i - 3.5) * step}
        cy={cy}
        r={Math.min(7, step * 0.4)}
        fill={lit ? P.type.output : P.typeOff.output}
        stroke={lit ? P.type.output : P.frame}
        strokeWidth={1.5}
      />
    );
  });
}

// The control word, in b.rows rows (one by default).
function ConRow({ b, d, f }) {
  const rows = b.rows ?? 1;
  const per = Math.ceil(CON_ORDER.length / rows);
  const [cw, ch] = [b.w / per, b.h / rows];
  const mid = b.y + b.h / 2 + 5;
  return (
    <g>
      {CON_ORDER.map((k, i) => {
        const on = d.sig.has(k);
        const [x, y] = [b.x + (i % per) * cw, b.y + Math.floor(i / per) * ch];
        return (
          <g key={k}>
            <rect
              x={x}
              y={y}
              width={cw}
              height={ch}
              fill={on ? P.type.control : P.block}
              stroke={P.ink}
              strokeWidth={1.2}
            />
            <text x={x + cw / 2} y={y + ch / 2 + 3} textAnchor="middle" fontSize={f(13)} fill={on ? P.onAccent : P.ink}>
              <SvgText text={`{${k}}`} />
            </text>
          </g>
        );
      })}
      <text x={b.x - 8} y={mid} textAnchor="end" fontSize={f(13)} fontWeight={700} fill={P.ink}>
        CON
      </text>
      <text x={b.x + b.w + 8} y={mid} fontSize={f(13)} fontFamily={P.font.mono} fill={P.ink}>
        {hex(d.con, 3)}H
      </text>
    </g>
  );
}

function Block({ b, sim, d, path, drill, focused, onEnter, onLeave, onActivate, f }) {
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
        <ConRow b={b} d={d} f={f} />
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
        <text x={cx} y={b.y - 8} textAnchor="middle" fontSize={f(13)} fontWeight={700} fill={P.ink}>
          {b.title}
        </text>
        <text
          x={cx}
          y={cy + 4.5}
          transform={`rotate(-90 ${cx} ${cy})`}
          textAnchor="middle"
          fontSize={f(13)}
          fontFamily={P.font.mono}
          fill={active ? hot : P.muted}
        >
          {d.bus === null ? "not driven" : bin(d.bus, d.busBits)}
        </text>
      </g>
    );
  }

  // The title (or its label, split over lines), sub, and value (a string, or one line per entry).
  const value = b.value?.(sim, d);
  const lines = [].concat(b.label ?? b.title).map((text) => ({ text, size: f(15), weight: 700, fill: P.ink }));
  if (b.sub) lines.push({ text: b.sub, size: f(12), fill: P.muted });
  for (const text of [].concat(value ?? [])) lines.push({ text, size: f(13), mono: true, fill: active ? hot : P.ink });
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
        <text x={b.x + 8} y={b.y + 15} fontSize={f(11)} fill={P.muted}>
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
        if (l.leds) return <Leds key={i} cx={cx} cy={top + l.size / 2} value={sim.out} w={b.w} />;
        return (
          <text
            key={i}
            x={cx}
            y={top + l.size * 0.82}
            textAnchor="middle"
            fontSize={l.size}
            fontWeight={l.weight ?? 400}
            fontFamily={l.mono ? P.font.mono : undefined}
            fill={l.fill}
          >
            {l.text}
          </text>
        );
      })}
    </g>
  );
}

// Draws diagram dg of level `node` (node.diagram, or the upright overview on a phone).
function Diagram({ node, dg = node.diagram, path, sim, d, focusId, onEnter, onLeave, onActivate, stepMs }) {
  // Font sizes, raised to the diagram's minimum where it sets one.
  const f = (size) => Math.max(size, dg.minFont ?? 0);
  return (
    <>
      {dg.groups?.map((g, i) => <Group key={`g${i}`} g={g} sim={sim} d={d} path={path} f={f} />)}
      {dg.wires?.map((w, i) => <Wire key={`w${i}`} w={w} d={d} stepMs={stepMs} f={f} />)}
      {dg.pins?.map((p, i) => <Pin key={`p${i}`} p={p} d={d} f={f} />)}
      {dg.notes?.map((n, i) => (
        <text key={`n${i}`} x={n.at[0]} y={n.at[1]} textAnchor={n.anchor ?? "middle"} fontSize={f(11.5)} fill={P.muted}>
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
          f={f}
        />
      ))}
    </>
  );
}

// --- side panel -----------------------------------------------------------------------------

// HTML colors come from the --sap-* variables (see cssVars in theme.js).
const BTN =
  "border border-[color:var(--sap-ink)] px-3 py-1 text-sm hover:bg-[color:var(--sap-ink)] hover:text-[color:var(--sap-bg)]";
// The small uppercase heading over a section of the side panel.
const KICKER = "font-sap-label text-xs font-bold uppercase tracking-wide text-[color:var(--sap-muted)]";
const BTN_DISABLED =
  "disabled:border-[color:var(--sap-disabled)] disabled:text-[color:var(--sap-disabled)] disabled:hover:bg-transparent";
// A BTN made smaller on phones (below sm).
const BTN_PHONE = "max-sm:whitespace-nowrap max-sm:px-1.5 max-sm:py-0.5 max-sm:text-[12px]";

// Phones only (it is sm:hidden): a "More" disclosure button and the panel it opens under itself.
// It closes on a tap or click outside, when focus moves out of it, and on Esc, which it takes
// (preventing the default) before the page's Esc handler, which goes up a zoom level, sees it.
// children(close): the panel's contents; close() also hands focus back to the button.
function MoreMenu({ id, children }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const close = useCallback(() => {
    setOpen(false);
    const wrap = wrapRef.current;
    if (wrap?.contains(document.activeElement) && wrap.getClientRects().length) btnRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      // Hidden (the window grew past sm): just close, and leave Esc to the page.
      if (wrapRef.current?.getClientRects().length) e.preventDefault();
      close();
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, close]);
  return (
    <div
      ref={wrapRef}
      className="relative ml-auto sm:hidden"
      onBlur={(e) => {
        if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={btnRef}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={`${BTN} ${BTN_PHONE} ${open ? "bg-[color:var(--sap-hover)]" : ""}`}
      >
        More <span aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      <div
        id={id}
        hidden={!open}
        className="absolute right-0 top-full z-20 mt-1 border border-[color:var(--sap-frame)] bg-[color:var(--sap-bg)] p-2 shadow-lg"
      >
        {children(close)}
      </div>
    </div>
  );
}

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
      <h3 className={KICKER}>Memory</h3>
      <p className="mt-1 text-sm text-[color:var(--sap-soft)]">
        {isExample ? "Example 10-1 from the book: 1 + 2 + 3 − 4." : "Your program. Load example puts Example 10-1 back."}
      </p>
      <table className="mt-2 w-full font-sap-mono text-[13px]">
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

// One bit switch: shows 0 or 1, lit when 1.
function BitButton({ caption, label, type, on, onClick, className = "" }) {
  return (
    <span className={`flex flex-col items-center gap-0.5 ${className}`}>
      <span aria-hidden="true" className="font-sap-mono text-[10px] text-[color:var(--sap-muted)] max-sm:text-[9px]">
        {caption}
      </span>
      <button
        type="button"
        aria-label={label}
        aria-pressed={on}
        onClick={onClick}
        className={`h-7 w-7 border font-sap-mono text-sm max-sm:h-6 max-sm:w-6 max-sm:text-xs ${
          on ? BIT_ON[type] : "border-[color:var(--sap-ink)] hover:bg-[color:var(--sap-hover)]"
        }`}
      >
        {on ? 1 : 0}
      </button>
    </span>
  );
}

// PROG mode: the address switches (S1), data switches (S3) and Write (S4), above the diagram.
function ProgSwitches({ sim, onAddrBit, onDataBit, onWrite }) {
  const addr = sim.addrSw & 15;
  const word = decodeWord(sim.dataSw);
  return (
    <div
      className="border border-b-0 border-[color:var(--sap-frame)] px-3 py-2 max-sm:px-2 max-sm:py-1.5"
    >
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2 max-sm:gap-x-2 max-sm:gap-y-1.5">
        <div role="group" aria-label="Address switches" className="flex gap-1 max-sm:gap-0.5">
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
        <div role="group" aria-label="Data switches" className="flex gap-1 max-sm:gap-0.5">
          {[7, 6, 5, 4, 3, 2, 1, 0].map((i) => (
            <BitButton
              key={i}
              caption={`D${i}`}
              label={`Data bit ${i}`}
              type="data"
              on={Boolean((sim.dataSw >> i) & 1)}
              onClick={() => onDataBit(i)}
              className={i === 3 ? "ml-2 max-sm:ml-1" : ""}
            />
          ))}
        </div>
        <button type="button" className={`${BTN} ${BTN_PHONE}`} onClick={onWrite}>
          Write
        </button>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 font-sap-mono text-[13px] max-sm:mt-1 max-sm:gap-x-3 max-sm:text-[11px]">
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
      <p className="mt-1 text-xs text-[color:var(--sap-muted)] max-sm:text-[11px]" aria-live="polite">
        Set an address and a byte, then Write. Word {hex(addr, 1)}H holds {bin(sim.ram[addr])} now.
      </p>
    </div>
  );
}

function Panel({ node, path, focus, drill, sim, d, onOpen }) {
  return (
    <aside className="text-[15px] leading-relaxed">
      <p className={KICKER}>{node.part}</p>
      <h2 className="font-sap-label text-2xl font-bold">{node.title}</h2>
      {node.about.map((p, i) => (
        <p key={i} className="mt-2">
          <HtmlText text={p} />
        </p>
      ))}

      <section className="mt-6 min-h-[150px] border-t border-[color:var(--sap-rule)] pt-4">
        {focus ? (
          <>
            <p className={KICKER}>{focus.tag ?? "Part"}</p>
            <h3 className="font-sap-label text-lg font-bold">
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
  const [path, setPath] = useState([]);
  const [sim, setSim] = useState(initialState);
  const [running, setRunning] = useState(false);
  const [rate, setRate] = useState("med"); // "slow" | "med" | "fast"
  const stepMs = STEP_MS[rate];
  const [hoverId, setHoverId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  // A diagram frame narrower than TALL_BELOW (a phone) draws the textbook overview upright.
  const [narrow, setNarrow] = useState(false);

  const svgRef = useRef(null);
  const sceneRef = useRef(null);
  const frameRef = useRef(null);
  const pathRef = useRef([]);
  // Where the zoom in flight is heading (pathRef changes over at its midpoint).
  const targetRef = useRef([]);
  const animToken = useRef(0);
  const busy = useRef(false);
  const narrowRef = useRef(narrow);
  narrowRef.current = narrow;

  // Measured before the first paint, and again whenever the frame changes width.
  useLayoutEffect(() => {
    const el = frameRef.current;
    const measure = () => setNarrow(el.clientWidth < TALL_BELOW);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const node = nodeAt(path) ?? ROOT;
  const d = useMemo(() => derive(sim), [sim]);

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
    if (push) window.history.pushState(null, "", urlFor(next));
  };

  // Zoom into a block (or back out of one), swapping the diagram at the midpoint.
  const navigate = useCallback(async (next, { push = true, force = false } = {}) => {
    const cur = pathRef.current;
    if (busy.current && !force) return;
    // A zoom still in flight stops at its next frame.
    const token = ++animToken.current;
    targetRef.current = next;
    const alive = () => animToken.current === token;
    // Each level is drawn on its own canvas (the upright overview's is tall).
    const canvas = (p) => canvasAt(p, narrowRef.current);
    const box = (p, id) => partBox(p, id, narrowRef.current);
    const done = () => {
      setView(fullBox(canvas(pathRef.current)), 1);
      busy.current = false;
    };
    if (next.join("/") === cur.join("/")) {
      // A zoom in cancelled before its midpoint: settle back on this level (and, if the zoom
      // came from the back or forward button, which already moved the URL, put the URL back).
      if (!busy.current) return;
      done();
      if (pathFromHash().join("/") !== cur.join("/")) window.history.replaceState(null, "", urlFor(cur));
      return;
    }

    const into = next.length === cur.length + 1 && cur.every((id, i) => next[i] === id);
    const outOf = next.length < cur.length && next.every((id, i) => cur[i] === id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || (!into && !outOf)) {
      commit(next, push);
      return done();
    }

    busy.current = true;
    const [c, n] = [canvas(cur), canvas(next)];
    if (into) {
      const blk = box(cur, next[next.length - 1]);
      const target = blk ? fitBox(blk, c) : growBox(c, 0.6);
      if (!(await tween(380, alive, (t) => setView(lerpBox(fullBox(c), target, ease(t)), 1 - smooth(0.55, 1, t))))) return;
      commit(next, push);
      setView(growBox(n, 1.35), 0);
      if (!(await tween(280, alive, (t) => setView(lerpBox(growBox(n, 1.35), fullBox(n), easeOut(t)), t)))) return;
    } else {
      if (!(await tween(200, alive, (t) => setView(lerpBox(fullBox(c), growBox(c, 1.35), ease(t)), 1 - t)))) return;
      commit(next, push);
      const blk = box(next, cur[next.length]);
      const from = blk ? fitBox(blk, n) : growBox(n, 0.8);
      setView(from, 0);
      if (!(await tween(380, alive, (t) => setView(lerpBox(from, fullBox(n), ease(t)), smooth(0, 0.45, t))))) return;
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
      // An open menu takes Esc first (it prevents the default).
      if (e.key !== "Escape" || e.defaultPrevented) return;
      // Mid-zoom, go up from where the zoom is heading: that cancels a zoom in, and a second Esc
      // while zooming out goes up one more level.
      const at = busy.current ? targetRef.current : pathRef.current;
      if (at.length) navigate(at.slice(0, -1), { force: true });
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  // The free-running clock: the toolbar's Run / Pause drives `running`, its speed buttons `rate`.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSim((s) => step(s)), stepMs);
    return () => clearInterval(id);
  }, [running, stepMs]);
  useEffect(() => {
    if (sim.halted || sim.prog) setRunning(false);
  }, [sim.halted, sim.prog]);

  const onEnter = useCallback((id) => setHoverId(id), []);
  const onLeave = useCallback((id) => setHoverId((h) => (h === id ? null : h)), []);
  const onActivate = useCallback(
    (b, drill) => {
      if (drill) navigate([...pathRef.current, b.id]);
      else setSelectedId(b.id);
    },
    [navigate]
  );


  // The diagram on view: the upright overview on a phone, else node.diagram.
  const tall = isTall(path, narrow);
  const dg = diagramAt(path, narrow) ?? node.diagram;
  const full = fullBox(canvasAt(path, narrow));

  const focusId = hoverId ?? selectedId;
  const focus = dg.blocks.find((b) => b.id === focusId);

  const crumbs = [{ title: "SAP-1", path: [] }].concat(
    path.map((_, i) => ({ title: nodeAt(path.slice(0, i + 1)).title, path: path.slice(0, i + 1) }))
  );

  const btn = `${BTN} ${BTN_DISABLED}`;
  const clockStopped = sim.halted || sim.prog;

  const setProgSwitch = (on) => {
    if (on) setRunning(false);
    setSim((s) => setProg(s, on));
  };
  const loadEx = () => {
    setRunning(false);
    setSim((s) => clear(loadExample(s)));
  };
  // The RUN / PROG switch, in the toolbar or (on a phone) its More menu. then(): after a choice.
  const progToggle = (className, then) => (
    <div role="group" aria-label="RUN / PROG switch" className={`flex ${className}`}>
      {[
        ["RUN", false],
        ["PROG", true],
      ].map(([label, on], i) => (
        <button
          key={label}
          type="button"
          aria-pressed={sim.prog === on}
          onClick={() => {
            setProgSwitch(on);
            then?.();
          }}
          className={`border border-[color:var(--sap-ink)] px-2.5 py-1 font-sap-mono text-[13px] ${i ? "-ml-px" : ""} ${
            sim.prog === on ? "bg-[color:var(--sap-ink)] text-[color:var(--sap-bg)]" : "hover:bg-[color:var(--sap-hover)]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className="min-h-screen bg-[color:var(--sap-bg)] font-sap-body text-[color:var(--sap-ink)]"
      // No faux bold: a weight that isn't loaded (main.jsx) stays as the nearest loaded one.
      style={{ ...cssVars(P), colorScheme: P.scheme, fontSynthesisWeight: "none" }}
    >
      <main className="mx-auto max-w-6xl px-4 py-10">
        <h1 className="font-sap-label text-4xl font-bold">sap-1</h1>
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
            {/* On phones (below sm) it packs into one row of buttons, with RUN/PROG and Load
                example in a More menu, and one status line. */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border border-b-0 border-[color:var(--sap-frame)] px-3 py-2 max-sm:gap-y-1.5 max-sm:px-2 max-sm:py-1.5">
              {progToggle("max-sm:hidden")}
              <div className="flex flex-wrap gap-1.5 max-sm:w-full max-sm:flex-nowrap max-sm:gap-1">
                <button
                  type="button"
                  className={`${btn} ${BTN_PHONE}`}
                  onClick={() => {
                    setRunning(false);
                    setSim((s) => clear(s));
                  }}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className={`${btn} ${BTN_PHONE}`}
                  disabled={clockStopped || running}
                  onClick={() => setSim((s) => step(s))}
                >
                  Step
                </button>
                <button
                  type="button"
                  className={`${btn} w-[4.5rem] ${BTN_PHONE} max-sm:w-[3.25rem]`}
                  disabled={clockStopped}
                  onClick={() => setRunning((r) => !r)}
                >
                  {running ? "Pause" : "Run"}
                </button>
                <div role="group" aria-label="Clock rate" className="flex">
                  {RATE_LABELS.map(([r, label, short], i) => (
                    <button
                      key={r}
                      type="button"
                      aria-label={label}
                      aria-pressed={rate === r}
                      onClick={() => setRate(r)}
                      className={`border border-[color:var(--sap-ink)] px-2 py-1 font-sap-mono text-[12px] max-sm:min-w-6 max-sm:px-1.5 max-sm:py-0.5 ${
                        i ? "-ml-px" : ""
                      } ${
                        rate === r
                          ? "bg-[color:var(--sap-ink)] text-[color:var(--sap-bg)]"
                          : "hover:bg-[color:var(--sap-hover)]"
                      }`}
                    >
                      <span className="max-sm:hidden">{label}</span>
                      <span aria-hidden="true" className="sm:hidden">
                        {short}
                      </span>
                    </button>
                  ))}
                </div>
                <button type="button" className={`${btn} max-sm:hidden`} onClick={loadEx}>
                  Load example
                </button>
                <MoreMenu id="sap1-more">
                  {(close) => (
                    <div className="flex flex-col items-start gap-2">
                      {progToggle("", close)}
                      <button
                        type="button"
                        className={`${btn} ${BTN_PHONE}`}
                        onClick={() => {
                          loadEx();
                          close();
                        }}
                      >
                        Load example
                      </button>
                    </div>
                  )}
                </MoreMenu>
              </div>
              {/* The status readouts; on a phone, one small line. */}
              <div className="contents max-sm:flex max-sm:w-full max-sm:flex-wrap max-sm:items-center max-sm:justify-between max-sm:gap-x-2">
                <div className="flex gap-1 font-sap-mono text-[13px] max-sm:gap-0.5 max-sm:text-[11px]" aria-label="T state">
                  {[1, 2, 3, 4, 5, 6].map((t) => (
                    <span
                      key={t}
                      className={`px-1.5 py-0.5 max-sm:px-[3px] max-sm:py-0 ${
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
                <div className="font-sap-mono text-[13px] max-sm:text-[11px]">
                  CON <span className="font-bold">{hex(d.con, 3)}H</span>
                </div>
                <div className="font-sap-mono text-[13px] max-sm:text-[11px]">
                  OUT <span className="font-bold">{bin(sim.out)}</span> = {sim.out}
                </div>
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

            {/* Below 680px wide the frame scrolls sideways, except for the upright overview,
                which fits a phone. */}
            <div ref={frameRef} className="overflow-x-auto border border-[color:var(--sap-frame)]">
              <svg
                ref={svgRef}
                viewBox={full.join(" ")}
                className={`block h-auto w-full ${
                  tall ? "" : "min-w-[680px]"
                } touch-manipulation select-none outline-none`}
                tabIndex={-1}
                role="group"
                aria-label={`${node.title} diagram`}
              >
                <defs>
                  <style>{PULSE_CSS}</style>
                  {[["off", P.ink], ...Object.entries(P.type)].map(([id, color]) => (
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
                  <Diagram
                    node={node}
                    dg={dg}
                    path={path}
                    sim={sim}
                    d={d}
                    focusId={focusId}
                    onEnter={onEnter}
                    onLeave={onLeave}
                    onActivate={onActivate}
                    stepMs={stepMs}
                  />
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
              Red marks what is active in this T state. Esc or the breadcrumbs go back up a level.
            </p>
          </div>

          <div className="min-w-0">
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
  );
}
