// Game mode's overview: a 1970s front panel (think Altair 8800), drawn in SVG in the same 820 × 600
// coordinates as the block diagrams, so opening a part zooms from its section just as it zooms
// from a block. Each register is a row of lamps with its value printed underneath. Lamp colors
// follow the signal type (theme.js TYPE_LED): amber for addresses, green for data, red for control
// and the output, warm white for the clock, T states and status.
//
// Each section stands for one block of the overview diagram (sap1Parts.js ROOT, same ids), so
// hovering or clicking it drives the info panel and the drill-down exactly like the block does.

import { useRef, useState } from "react";
import { CANVAS, ROOT, decodeWord } from "./sap1Parts";
import {
  CON_ORDER,
  bin,
  clear,
  hex,
  loadExample,
  setProg,
  step,
  toggleAddrBit,
  toggleDataBit,
  write,
} from "./sap1Sim";
import { GAME as P } from "./theme";
import { signalType } from "./signalTypes";
import { SvgText } from "./sigText";

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const SILK = P.ink; // off-white silkscreen lettering

export const PANEL = { w: CANVAS.w, h: CANVAS.h };

// Where each section sits on the panel, by the id of the overview block it stands for.
export const PANEL_BOXES = {
  pc: { x: 34, y: 50, w: 120, h: 98 },
  mar: { x: 162, y: 50, w: 120, h: 98 },
  ram: { x: 290, y: 50, w: 182, h: 98 },
  ir: { x: 480, y: 50, w: 306, h: 98 },
  a: { x: 34, y: 156, w: 182, h: 98 },
  alu: { x: 224, y: 156, w: 182, h: 98 },
  b: { x: 414, y: 156, w: 182, h: 98 },
  bus: { x: 604, y: 156, w: 182, h: 98 },
  out: { x: 34, y: 262, w: 400, h: 100 },
  ctrl: { x: 442, y: 262, w: 344, h: 100 },
  con: { x: 34, y: 370, w: 752, h: 70 },
};

// The bottom strip, left empty for the switches.
export const CONTROLS_BOX = { x: 34, y: 450, w: 752, h: 138 };

const BLOCKS = Object.fromEntries(ROOT.diagram.blocks.map((b) => [b.id, b]));

// Who drives the W bus and who loads from it, by the signal that does it.
const DRIVERS = [["Ep", "PC"], ["CE", "RAM"], ["Ei", "IR"], ["Ea", "A"], ["Eu", "ALU"]];
const LOADERS = [["Lm", "MAR"], ["Li", "IR"], ["La", "A"], ["Lb", "B"], ["Lo", "OUT"]];
const whoBy = (list, sig) => list.find(([k]) => sig.has(k))?.[1];

// Is the part behind a section doing something this T state?
function isActive(id, d) {
  if (id === "bus") return d.bus !== null;
  if (id === "con") return d.sig.size > 0;
  return Boolean(BLOCKS[id].act?.some((k) => d.sig.has(k)));
}

// Blend two #rrggbb colors (t = 0 → a, 1 → b).
function mix(a, b, t) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

// --- lamps ----------------------------------------------------------------------------------

// x positions of n lamps centred on cx, `step` apart, with an extra `gap` after every four.
function lampXs(n, cx, step, gap = 0) {
  const width = (n - 1) * step + (Math.ceil(n / 4) - 1) * gap;
  return Array.from({ length: n }, (_, i) => cx - width / 2 + i * step + Math.floor(i / 4) * gap);
}

// One lamp per bit of value (MSB first). value null: all dark. color: a lamp color or i => color.
const bitLamps = (value, xs, color) =>
  xs.map((x, i) => ({
    x,
    on: value != null && Boolean((value >> (xs.length - 1 - i)) & 1),
    color: typeof color === "function" ? color(i) : color,
  }));

// The CSS classes of a lamp's fading layers: LEDs snap on and off in ~80 ms, the warm-white
// (incandescent) lamps warm up and cool down a little slower. See PANEL_CSS.
const ledClass = (l) => `gp-led${l.color === "white" ? " gp-warm" : ""}${l.on ? " gp-on" : ""}`;

// A row of lamps ({ x, on, color, pulse?, breathe? }), drawn in three layers so a lit lamp's glow
// spills over the panel and its neighbours while its lens stays crisp. The lit layers are always
// there and fade in and out (an unlit glow is also hidden, so its blur costs nothing). pulse: a
// count; each new value flares the lamp once if it is lit. breathe: a lit lamp pulses slowly.
function Lamps({ lamps, cy, r = 6.5 }) {
  return (
    <g>
      {lamps.map((l, i) => (
        <g key={`b${i}`}>
          <circle cx={l.x} cy={cy} r={r + 2.2} fill="#090b0f" stroke="#000" strokeOpacity={0.6} strokeWidth={0.8} />
          <path
            d={`M${l.x - r - 1.6} ${cy + 1}a${r + 1.6} ${r + 1.6} 0 0 0 ${2 * r + 3.2} 0`}
            fill="none"
            stroke="#fff"
            strokeOpacity={0.1}
            strokeWidth={0.8}
          />
          <circle cx={l.x} cy={cy} r={r} fill={`url(#gp-off-${l.color})`} />
        </g>
      ))}
      {lamps.map((l, i) => (
        <g
          key={`h${i}`}
          className={`${ledClass(l)}${l.on && l.breathe ? " gp-breathe" : ""}`}
          style={{ opacity: l.on ? 1 : 0, visibility: l.on ? "visible" : "hidden" }}
        >
          <circle cx={l.x} cy={cy} r={r * 2} fill={P.led[l.color].on} opacity={0.42} filter="url(#gp-glow)" />
        </g>
      ))}
      {lamps.map((l, i) => (
        <g key={`l${i}`}>
          <circle
            className={`${ledClass(l)}${l.on && l.breathe ? " gp-breathe" : ""}`}
            cx={l.x}
            cy={cy}
            r={r}
            fill={`url(#gp-on-${l.color})`}
            style={{ opacity: l.on ? 1 : 0 }}
          />
          {l.on && l.pulse > 0 && (
            <circle key={l.pulse} className="gp-pulse" cx={l.x} cy={cy} r={r * 1.9} fill={P.led[l.color].on} filter="url(#gp-glow)" />
          )}
          <ellipse
            className={ledClass(l)}
            cx={l.x - r * 0.32}
            cy={cy - r * 0.4}
            rx={r * 0.42}
            ry={r * 0.24}
            fill="#fff"
            style={{ opacity: l.on ? 0.55 : 0.16 }}
          />
        </g>
      ))}
    </g>
  );
}

// The CLOCK lamp by the ring counter: dark between ticks, it blinks once on each clock pulse
// (`tick` counts them; a new key restarts the blink). With reduced motion it shows the clock's
// level instead (`level`), switching instantly.
function ClockLamp({ x, cy, tick, level }) {
  const r = 4.5;
  const lit = (
    <>
      <circle cx={x} cy={cy} r={r * 2.2} fill={P.led.white.on} opacity={0.5} filter="url(#gp-glow)" />
      <circle cx={x} cy={cy} r={r} fill="url(#gp-on-white)" />
      <ellipse cx={x - r * 0.32} cy={cy - r * 0.4} rx={r * 0.42} ry={r * 0.24} fill="#fff" opacity={0.55} />
    </>
  );
  return (
    <g pointerEvents="none">
      <Lamps cy={cy} r={r} lamps={[{ x, on: false, color: "white" }]} />
      {tick > 0 && (
        <g key={tick} className="gp-blink">
          {lit}
        </g>
      )}
      <g className="gp-rm" opacity={level ? 1 : 0}>
        {lit}
      </g>
    </g>
  );
}

// --- lettering ------------------------------------------------------------------------------

function Silk({ x, y, size = 9, spacing = 1.5, anchor = "middle", weight = 400, fill = SILK, children }) {
  return (
    <text x={x} y={y} fontSize={size} fontFamily={FONT} fontWeight={weight} letterSpacing={spacing} textAnchor={anchor} fill={fill}>
      {children}
    </text>
  );
}

function Readout({ x, y, size = 11.5, anchor = "middle", fill = SILK, children }) {
  return (
    <text x={x} y={y} fontSize={size} fontFamily={MONO} textAnchor={anchor} fill={fill} opacity={0.92}>
      {children}
    </text>
  );
}

// A recessed display window with glowing digits; `ghost` is drawn unlit behind them (all
// segments, like an unlit seven-segment display).
function Window({ x, y, w, h, text, ghost, color, size, spacing = 0 }) {
  const tx = x + w / 2;
  const ty = y + h / 2 + size * 0.36;
  const font = { fontSize: size, fontFamily: MONO, fontWeight: 700, letterSpacing: spacing, textAnchor: "middle" };
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={3} fill="#06080b" stroke="#000" strokeWidth={1} />
      <rect x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} rx={2.5} fill="none" stroke="#fff" strokeOpacity={0.07} />
      {ghost && (
        <text x={tx} y={ty} {...font} fill={P.led[color].off} aria-hidden="true">
          {ghost}
        </text>
      )}
      <text x={tx} y={ty} {...font} fill={P.led[color].on} filter="url(#gp-text-glow)">
        {text}
      </text>
    </g>
  );
}

function PlusMark({ x, y, focused }) {
  return (
    <g>
      <circle cx={x} cy={y} r={6} fill={focused ? SILK : "none"} stroke={SILK} strokeOpacity={focused ? 1 : 0.55} strokeWidth={1} />
      <path
        d={`M${x - 3} ${y}h6M${x} ${y - 3}v6`}
        stroke={focused ? "#1b2029" : SILK}
        strokeOpacity={focused ? 1 : 0.75}
        strokeWidth={1.3}
      />
    </g>
  );
}

// --- case -----------------------------------------------------------------------------------

const TRIM = 20; // walnut side trims

function Defs() {
  return (
    <defs>
      <linearGradient id="gp-metal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#2c333f" />
        <stop offset="0.45" stopColor="#232934" />
        <stop offset="1" stopColor="#1b2029" />
      </linearGradient>
      <linearGradient id="gp-sheen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.05" />
        <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        <stop offset="1" stopColor="#fff" stopOpacity="0.025" />
      </linearGradient>
      <pattern id="gp-brush" width="64" height="7" patternUnits="userSpaceOnUse">
        <rect y="0" width="64" height="0.6" fill="#fff" opacity="0.045" />
        <rect y="2.2" width="64" height="0.5" fill="#000" opacity="0.14" />
        <rect y="3.6" width="64" height="0.7" fill="#fff" opacity="0.025" />
        <rect y="5.3" width="64" height="0.4" fill="#000" opacity="0.09" />
      </pattern>
      <linearGradient id="gp-wood" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#3a2013" />
        <stop offset="0.3" stopColor="#6a3e22" />
        <stop offset="0.62" stopColor="#7b4927" />
        <stop offset="1" stopColor="#4a2916" />
      </linearGradient>
      <filter id="gp-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="3.2" />
      </filter>
      <filter id="gp-text-glow" x="-20%" y="-50%" width="140%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="1.6" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      {Object.entries(P.led).flatMap(([c, { on, off }]) => [
        <radialGradient key={`on-${c}`} id={`gp-on-${c}`} cx="0.42" cy="0.38" r="0.62">
          <stop offset="0" stopColor={mix(on, "#ffffff", 0.7)} />
          <stop offset="0.45" stopColor={on} />
          <stop offset="1" stopColor={mix(on, "#000000", 0.3)} />
        </radialGradient>,
        <radialGradient key={`off-${c}`} id={`gp-off-${c}`} cx="0.42" cy="0.38" r="0.65">
          <stop offset="0" stopColor={mix(off, "#ffffff", 0.12)} />
          <stop offset="0.7" stopColor={off} />
          <stop offset="1" stopColor={mix(off, "#000000", 0.45)} />
        </radialGradient>,
        <radialGradient key={`sweep-${c}`} id={`gp-sweep-${c}`}>
          <stop offset="0" stopColor={mix(on, "#ffffff", 0.35)} stopOpacity="0.8" />
          <stop offset="0.4" stopColor={on} stopOpacity="0.38" />
          <stop offset="1" stopColor={on} stopOpacity="0" />
        </radialGradient>,
      ])}
    </defs>
  );
}

function Trim({ x }) {
  return (
    <g>
      <rect x={x} y={0} width={TRIM} height={PANEL.h} rx={4} fill="url(#gp-wood)" />
      {[3, 6.5, 9, 12.5, 15, 17.5].map((g, i) => (
        <path
          key={i}
          d={`M${x + g} 0C${x + g + 1.6} 120 ${x + g - 1.4} 260 ${x + g + 0.8} 380S${x + g - 1} 540 ${x + g + 0.4} ${PANEL.h}`}
          fill="none"
          stroke="#26130a"
          strokeOpacity={0.22 + (i % 3) * 0.1}
          strokeWidth={0.6 + (i % 2) * 0.5}
        />
      ))}
    </g>
  );
}

function Case() {
  const [x, w, h] = [TRIM, PANEL.w - 2 * TRIM, PANEL.h];
  return (
    <g>
      <Trim x={0} />
      <Trim x={PANEL.w - TRIM} />
      <rect x={x} y={0} width={w} height={h} fill="url(#gp-metal)" />
      <rect x={x} y={0} width={w} height={h} fill="url(#gp-brush)" />
      <rect x={x} y={0} width={w} height={h} fill="url(#gp-sheen)" />
      <path d={`M${x} 0.5H${x + w}`} stroke="#fff" strokeOpacity={0.14} />
      <path d={`M${x} ${h - 0.5}H${x + w}`} stroke="#000" strokeOpacity={0.6} />
      <path d={`M${x + 0.5} 0V${h}M${x + w - 0.5} 0V${h}`} stroke="#000" strokeOpacity={0.55} />
      <Silk x={36} y={30} anchor="start" size={20} spacing={6} weight={700}>
        SAP-1
      </Silk>
      <Silk x={142} y={29} anchor="start" size={9.5} spacing={3} fill={P.soft}>
        SIMPLE-AS-POSSIBLE COMPUTER
      </Silk>
      <Silk x={784} y={29} anchor="end" size={9} spacing={2} fill={P.muted}>
        8-BIT · 16 × 8 RAM · 5 INSTRUCTIONS
      </Silk>
      <path d="M34 40.5H786" stroke={SILK} strokeOpacity={0.3} />
    </g>
  );
}

// --- sections -------------------------------------------------------------------------------

// A silkscreened box around one part. It acts like the part's block in the diagram: hover or
// focus shows it in the info panel, click / Enter / Space opens it (or selects it when it has no
// inside). It is outlined in its signal type's color while the part is active. flash: a count of
// the changes to the part's value; each new count flashes the outline and title once.
function Section({ id, ctx, title, sub, tx, ty, flash = 0, children }) {
  const { d, focusId, onEnter, onLeave, onActivate, onOpen } = ctx;
  const b = PANEL_BOXES[id];
  const block = BLOCKS[id];
  const drill = Boolean(ROOT.children?.[id]);
  const type = signalType(block, { d, path: [] });
  const hot = P.type[type];
  const active = isActive(id, d);
  const focused = focusId === id;
  const activate = () => (drill ? onOpen(id) : onActivate(block, false));
  const x = tx ?? b.x + b.w / 2;
  const y = ty ?? b.y + 18;
  return (
    <g
      data-tour-id={id}
      role="button"
      tabIndex={0}
      aria-label={drill ? `Open ${block.title}` : block.title}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
      onMouseEnter={() => onEnter(id)}
      onMouseLeave={() => onLeave(id)}
      onFocus={() => onEnter(id)}
      onBlur={() => onLeave(id)}
      style={{ cursor: "pointer", outline: "none" }}
    >
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill={focused ? "rgba(232,226,208,0.07)" : "rgba(0,0,0,0.2)"} />
      {active && <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill={P.tint[type]} opacity={0.4} />}
      <rect
        x={b.x + 0.5}
        y={b.y + 0.5}
        width={b.w - 1}
        height={b.h - 1}
        rx={3.5}
        fill="none"
        stroke={active ? hot : SILK}
        strokeOpacity={active ? 0.85 : focused ? 0.9 : 0.32}
        strokeWidth={active || focused ? 1.6 : 0.9}
      />
      <Silk x={x} y={y} size={12.5} spacing={3} weight={700} fill={active ? hot : SILK}>
        {title}
      </Silk>
      {sub && (
        <Silk x={x} y={y + 12} size={8.5} spacing={1.2} fill={P.muted}>
          {sub}
        </Silk>
      )}
      {drill && <PlusMark x={b.x + b.w - 12} y={b.y + 12} focused={focused} />}
      {flash > 0 && (
        <g key={flash} className="gp-flash">
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} fill={hot} opacity={0.1} />
          <rect x={b.x + 1} y={b.y + 1} width={b.w - 2} height={b.h - 2} rx={3} fill="none" stroke={mix(hot, "#ffffff", 0.3)} strokeWidth={2.2} />
          <g filter="url(#gp-text-glow)">
            <Silk x={x} y={y} size={12.5} spacing={3} weight={700} fill={mix(hot, "#ffffff", 0.3)}>
              {title}
            </Silk>
          </g>
        </g>
      )}
      {children}
    </g>
  );
}

const B = PANEL_BOXES;
const mid = (id) => B[id].x + B[id].w / 2;
const LAMP_Y = 54; // lamp row, from the top of a section
const READ_Y = 84; // the binary / hex readout under it
const byte = (v) => `${bin(v)} · ${hex(v)}H`;
const nibble = (v) => `${bin(v, 4)} · ${hex(v, 1)}H`;

// A plain register: n lamps of one color and its value underneath.
function Register({ id, ctx, title, sub, value, bits, color, flash }) {
  const b = B[id];
  const xs = bits === 4 ? lampXs(4, mid(id), 20) : lampXs(8, mid(id), 18, 6);
  return (
    <Section id={id} ctx={ctx} title={title} sub={sub} flash={flash}>
      <Lamps cy={b.y + LAMP_Y} lamps={bitLamps(value, xs, color)} />
      <Readout x={mid(id)} y={b.y + READ_Y}>
        {bits === 4 ? nibble(value) : byte(value)}
      </Readout>
    </Section>
  );
}

function InstructionRegister({ ctx, ir, flash }) {
  const b = B.ir;
  const lx = b.x + 108; // centre of the lamps
  const win = { x: b.x + 196, y: b.y + 38, w: 96, h: 34 };
  return (
    <Section id="ir" ctx={ctx} title="IR" sub="INSTRUCTION REGISTER" tx={lx} flash={flash}>
      <Lamps
        cy={b.y + LAMP_Y}
        lamps={[...bitLamps(ir >> 4, lampXs(4, lx - 38, 18), "green"), ...bitLamps(ir & 15, lampXs(4, lx + 38, 18), "amber")]}
      />
      <Silk x={lx - 38} y={b.y + 73} size={8} spacing={1} fill={P.muted}>
        OP CODE
      </Silk>
      <Silk x={lx + 38} y={b.y + 73} size={8} spacing={1} fill={P.muted}>
        ADDRESS
      </Silk>
      <Readout x={lx} y={b.y + 89} size={11}>
        {byte(ir)}
      </Readout>
      <Silk x={win.x + win.w / 2} y={b.y + 30} size={8.5} spacing={1.2} fill={P.muted}>
        DECODED
      </Silk>
      <Window {...win} text={decodeWord(ir) ?? "NOP"} color="green" size={15} />
    </Section>
  );
}

// "A+B" / "A−B" in the corner of the ALU section; red while Su is high.
function AluBadge({ d }) {
  const b = B.alu;
  const red = P.led.red;
  return (
    <g pointerEvents="none">
      <rect
        x={b.x + 8}
        y={b.y + 7}
        width={34}
        height={15}
        rx={2}
        fill={d.su ? red.off : "rgba(0,0,0,0.25)"}
        stroke={d.su ? red.on : SILK}
        strokeOpacity={d.su ? 0.9 : 0.4}
      />
      <text
        x={b.x + 25}
        y={b.y + 18}
        fontSize={9.5}
        fontFamily={MONO}
        fontWeight={700}
        textAnchor="middle"
        fill={d.su ? red.on : SILK}
      >
        {d.su ? "A−B" : "A+B"}
      </text>
    </g>
  );
}

// tick: a count of clock pulses. While the bus is driven, each one sends a glow along the lines
// in use, in their color.
function Bus({ ctx, d, tick }) {
  const b = B.bus;
  const addr = d.busBits === 4;
  const xs = lampXs(8, mid("bus"), 18, 6);
  // An address uses the low four lines (amber); the high four stay dark.
  const color = (i) => (addr && i >= 4 ? "amber" : "green");
  const driver = whoBy(DRIVERS, d.sig);
  const loader = whoBy(LOADERS, d.sig);
  const sub = d.bus === null ? "NOT DRIVEN" : `${driver} → ${loader ?? "—"}`;
  const [x0, x1] = [xs[addr ? 4 : 0] - 14, xs[7] + 14];
  return (
    <Section id="bus" ctx={ctx} title="W BUS" sub={sub}>
      <Lamps cy={b.y + LAMP_Y} lamps={bitLamps(d.bus, xs, color)} />
      {d.bus !== null && tick > 0 && (
        <ellipse
          key={tick}
          className="gp-sweep"
          cx={x0}
          cy={b.y + LAMP_Y}
          rx={20}
          ry={12}
          fill={`url(#gp-sweep-${addr ? "amber" : "green"})`}
          style={{ "--gp-dx": `${x1 - x0}px` }}
        />
      )}
      <Readout x={mid("bus")} y={b.y + READ_Y}>
        {d.bus === null ? "---- ---- · --" : addr ? nibble(d.bus) : byte(d.bus)}
      </Readout>
    </Section>
  );
}

function Output({ ctx, out, flash }) {
  const b = B.out;
  const lx = b.x + 138;
  const win = { x: b.x + 266, y: b.y + 36, w: 116, h: 46 };
  return (
    <Section id="out" ctx={ctx} title="OUT" sub="OUTPUT REGISTER" tx={lx} flash={flash}>
      <Lamps cy={b.y + 56} r={9.5} lamps={bitLamps(out, lampXs(8, lx, 28, 8), "red")} />
      <Readout x={lx} y={b.y + 90}>
        {byte(out)}
      </Readout>
      <Silk x={win.x + win.w / 2} y={b.y + 30} size={8.5} spacing={1.2} fill={P.muted}>
        DECIMAL
      </Silk>
      <Window {...win} text={String(out).padStart(3, "0")} ghost="888" color="red" size={30} spacing={3} />
    </Section>
  );
}

// The ring counter's layout in the CONTROLLER section, from its top left: the CLK lamp's centre,
// the T1 lamp's x and the step to T2 … T6, the lamp row and the label baseline under it.
const RING = { clk: 18, t1: 26, step: 30, lampY: 56, labelY: 77 };

// tick: a count of clock pulses, which blink the CLK lamp. HALT breathes while halted.
function Controller({ ctx, sim, d, tick }) {
  const b = B.ctrl;
  const cy = b.y + RING.lampY;
  const ts = [1, 2, 3, 4, 5, 6].map((t, i) => ({
    x: b.x + RING.t1 + i * RING.step,
    on: !sim.halted && sim.t === t,
    color: "white",
    label: `T${t}`,
  }));
  const status = [
    { label: "RUN", on: !sim.prog && !sim.halted },
    { label: "HALT", on: sim.halted, breathe: true },
    { label: "PROG", on: sim.prog },
  ].map((s, i) => ({ ...s, x: b.x + 228 + i * 44, color: "white" }));
  const label = (l) => (
    <Silk key={l.label} x={l.x} y={b.y + RING.labelY} size={8.5} spacing={1} fill={l.on ? P.led.white.on : P.soft}>
      {l.label}
    </Silk>
  );
  const clockLevel = !sim.prog && !sim.halted && sim.cycles % 2 === 1;
  const state = sim.prog
    ? "PROG · CLOCK STOPPED"
    : sim.halted
      ? "HALTED"
      : `T${sim.t} · ${sim.t <= 3 ? "FETCH" : `EXECUTE ${d.op}`}`;
  return (
    <Section id="ctrl" ctx={ctx} title="CONTROLLER" sub="RING COUNTER · STATUS">
      <g data-tour-id="ring">
        <ClockLamp x={b.x + RING.clk} cy={b.y + RING.clk} tick={tick} level={clockLevel} />
        <Silk x={b.x + RING.clk + 11} y={b.y + RING.clk + 3} size={8.5} spacing={1} anchor="start" fill={P.soft}>
          CLK
        </Silk>
        <Lamps cy={cy} lamps={ts} />
        {ts.map(label)}
      </g>
      <Lamps cy={cy} lamps={status} />
      {status.map(label)}
      <path d={`M${b.x + 200.5} ${b.y + 44}V${b.y + 80}`} stroke={SILK} strokeOpacity={0.3} />
      <Readout x={mid("ctrl")} y={b.y + 93} size={11}>
        {state}
      </Readout>
    </Section>
  );
}

// tick: a count of clock pulses; the lamps lit for the new T state flare once on each.
function ControlWord({ ctx, d, tick }) {
  const b = B.con;
  const cy = b.y + 42;
  const xs = CON_ORDER.map((_, i) => b.x + 124 + i * 46);
  const red = P.led.red;
  return (
    <Section id="con" ctx={ctx} title="CON" sub="CONTROL WORD" tx={b.x + 52} ty={b.y + 34}>
      <Lamps cy={cy} lamps={CON_ORDER.map((k, i) => ({ x: xs[i], on: d.sig.has(k), color: "red", pulse: tick }))} />
      {CON_ORDER.map((k, i) => (
        <g key={k}>
          <text x={xs[i]} y={b.y + 24} fontSize={11.5} fontFamily={FONT} textAnchor="middle" fill={d.sig.has(k) ? red.on : SILK}>
            <SvgText text={`{${k}}`} />
          </text>
          <text x={xs[i]} y={b.y + 63} fontSize={8.5} fontFamily={MONO} textAnchor="middle" fill={P.muted}>
            {(d.con >> (CON_ORDER.length - 1 - i)) & 1}
          </text>
        </g>
      ))}
      <Readout x={b.x + b.w - 16} y={b.y + 39} size={17} anchor="end">
        {`${hex(d.con, 3)}H`}
      </Readout>
      <Readout x={b.x + b.w - 16} y={b.y + 55} size={9} anchor="end" fill={P.muted}>
        {bin(d.con, 12)}
      </Readout>
    </Section>
  );
}

// --- controls -------------------------------------------------------------------------------
//
// The bottom strip is the book's switch panel (S1–S7), laid out like an Altair: a row of chrome
// bat-handle toggles with lamps above them, plus lit push buttons. Up means 1 / the upper label.

// The CLOCK switch's notches, bottom to top. Each sets the visualizer's `rate` (its one clock's
// period, STEP_MS[rate]).
const RATES = [
  { key: "slow", label: "SLOW" },
  { key: "med", label: "MED" },
  { key: "fast", label: "FAST" },
];
const MED = 1;

const CB = CONTROLS_BOX;
const HEAD_Y = CB.y + 34; // switch numbers and group names
const SW_LAMP_Y = CB.y + 48; // lamps above the switches
const UP_Y = CB.y + 62; // what a lever means when up
const PIVOT_Y = CB.y + 86; // lever pivots and button caps
const DOWN_Y = CB.y + 116; // what a lever means when down
const SW_READ_Y = CB.y + 127; // readouts under the switch rows
const HIT_TOP = HEAD_Y + 6;
const HIT_BOTTOM = CB.y + CB.h - 6;

const ADDR_XS = lampXs(4, 151, 26); // A3 … A0
const DATA_XS = lampXs(8, 318, 26, 8); // D7 … D0
const X = { prog: 68, write: 452, clear: 518, step: 568, auto: 616, rate: 664, load: 747 };
const DIVIDERS = [94, 488, 708];

const isKey = (e) => e.key === "Enter" || e.key === " ";
const NUT = Array.from({ length: 6 }, (_, i) => {
  const a = Math.PI / 6 + (i * Math.PI) / 3;
  return `${(7.4 * Math.cos(a)).toFixed(2)},${(7.4 * Math.sin(a)).toFixed(2)}`;
}).join(" ");

const CONTROL_CSS = `
.gp-ctl { cursor: pointer; outline: none; touch-action: manipulation; }
.gp-ctl[aria-disabled="true"] { cursor: default; }
.gp-ctl .gp-focus { opacity: 0; }
.gp-ctl:focus-visible .gp-focus { opacity: 1; }
.gp-lever { transform-origin: 0 0; transition: transform 170ms cubic-bezier(0.34, 1.3, 0.5, 1); }
.gp-fade { transition: opacity 120ms ease-out; }
@media (prefers-reduced-motion: reduce) { .gp-lever, .gp-fade { transition: none; } }
`;

function ControlDefs() {
  return (
    <defs>
      <linearGradient id="gp-chrome" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#4a5058" />
        <stop offset="0.3" stopColor="#f3f5f7" />
        <stop offset="0.52" stopColor="#c3c8ce" />
        <stop offset="0.8" stopColor="#7d838b" />
        <stop offset="1" stopColor="#363b42" />
      </linearGradient>
      <radialGradient id="gp-chrome-tip" cx="0.36" cy="0.3" r="0.72">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="0.35" stopColor="#d4d8dd" />
        <stop offset="1" stopColor="#474c54" />
      </radialGradient>
      <linearGradient id="gp-nut" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#b8bdc4" />
        <stop offset="0.5" stopColor="#7a8089" />
        <stop offset="1" stopColor="#3b4048" />
      </linearGradient>
      {["white", "red"].flatMap((c) => {
        const { on, off } = P.led[c];
        return [
          <linearGradient key={`on-${c}`} id={`gp-cap-on-${c}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={mix(on, "#ffffff", 0.6)} />
            <stop offset="0.5" stopColor={on} />
            <stop offset="1" stopColor={mix(on, "#000000", 0.25)} />
          </linearGradient>,
          <linearGradient key={`off-${c}`} id={`gp-cap-off-${c}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={mix(off, "#ffffff", 0.16)} />
            <stop offset="1" stopColor={mix(off, "#000000", 0.35)} />
          </linearGradient>,
        ];
      })}
    </defs>
  );
}

// A chrome bat-handle toggle seen from the front: a hex nut and a lever pointing up (pos 1), down
// (pos -1) or straight out at you (pos 0, the middle of a three-way switch). It flips by squashing
// through the pivot, which reads as the lever swinging over.
function Lever({ x, pos }) {
  return (
    <g transform={`translate(${x} ${PIVOT_Y})`} pointerEvents="none">
      <circle cy={1.2} r={9} fill="#000" opacity={0.35} />
      <polygon points={NUT} fill="url(#gp-nut)" stroke="#111419" strokeWidth={0.7} />
      <circle r={4.3} fill="#15181d" />
      <g className="gp-lever" style={{ transform: `scaleY(${pos === 0 ? 0.06 : pos})` }}>
        <path d="M-1.7 0L-2.3 -11.5H2.3L1.7 0Z" fill="#000" opacity={0.3} transform="translate(1.6 0.8)" />
        <path d="M-1.7 0L-2.3 -11.5H2.3L1.7 0Z" fill="url(#gp-chrome)" />
        <ellipse cy={-14} rx={3.2} ry={4.1} fill="url(#gp-chrome-tip)" stroke="#2a2e34" strokeWidth={0.4} />
      </g>
      <circle className="gp-fade" r={3.5} fill="url(#gp-chrome-tip)" style={{ opacity: pos === 0 ? 1 : 0 }} />
    </g>
  );
}

// The focus ring and the transparent hit area of a control `w` wide.
function HitArea({ x, w }) {
  const y = HIT_TOP;
  const h = HIT_BOTTOM - HIT_TOP;
  return (
    <>
      <rect x={x - w / 2} y={y} width={w} height={h} fill="transparent" />
      <rect
        className="gp-focus"
        x={x - w / 2 + 0.5}
        y={y + 0.5}
        width={w - 1}
        height={h - 1}
        rx={3}
        fill="rgba(232,226,208,0.06)"
        stroke={SILK}
        strokeOpacity={0.7}
        strokeDasharray="2 2"
        pointerEvents="none"
      />
    </>
  );
}

// A two-way toggle (role="switch"). Click, Enter or Space flips it.
function Toggle({ x, w = 24, on, label, disabled, onFlip, tourId, children }) {
  return (
    <g
      data-tour-id={tourId}
      role="switch"
      tabIndex={0}
      aria-checked={on}
      aria-label={label}
      aria-disabled={disabled ? "true" : undefined}
      className="gp-ctl"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onFlip();
      }}
      onKeyDown={(e) => {
        if (!isKey(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (!disabled && !e.repeat) onFlip();
      }}
    >
      <HitArea x={x} w={w} />
      <g opacity={disabled ? 0.4 : 1}>
        <Lever x={x} pos={on ? 1 : -1} />
        {children}
      </g>
    </g>
  );
}

// Labels above and below a lever; the one for its current position is brighter.
function LeverLabels({ x, up, down, isUp }) {
  return (
    <g pointerEvents="none">
      <Silk x={x} y={UP_Y} size={7.5} spacing={1} weight={isUp ? 700 : 400} fill={isUp ? SILK : P.muted}>
        {up}
      </Silk>
      <Silk x={x} y={DOWN_Y} size={7.5} spacing={1} weight={isUp ? 400 : 700} fill={isUp ? P.muted : SILK}>
        {down}
      </Silk>
    </g>
  );
}

// A momentary lit push button. It lights while held (pointer or Enter / Space) and acts on
// release; disabled, it is dim and does nothing.
function PushButton({ x, legend, above, below, color = "white", disabled, label, onPress, tourId }) {
  const [down, setDown] = useState(false);
  const downRef = useRef(false);
  const press = (v) => {
    downRef.current = v;
    setDown(v);
  };
  const lit = down && !disabled;
  const led = P.led[color];
  const [w, h] = [40, 22];
  const [x0, y0] = [x - w / 2, PIVOT_Y - h / 2];
  return (
    <g
      data-tour-id={tourId}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-disabled={disabled ? "true" : undefined}
      className="gp-ctl"
      onPointerDown={(e) => {
        e.stopPropagation();
        if (!disabled && e.button === 0) press(true);
      }}
      onPointerUp={() => press(false)}
      onPointerLeave={() => press(false)}
      onPointerCancel={() => press(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onPress();
      }}
      onKeyDown={(e) => {
        if (!isKey(e)) return;
        e.preventDefault();
        e.stopPropagation();
        if (!disabled && !e.repeat) press(true);
      }}
      onKeyUp={(e) => {
        if (!isKey(e)) return;
        e.preventDefault();
        if (!downRef.current) return;
        press(false);
        if (!disabled) onPress();
      }}
      onBlur={() => press(false)}
    >
      <HitArea x={x} w={w + 12} />
      <g opacity={disabled ? 0.4 : 1} pointerEvents="none">
        {above && (
          <Silk x={x} y={UP_Y} size={7.5} spacing={1}>
            {above}
          </Silk>
        )}
        {below && (
          <Silk x={x} y={DOWN_Y} size={7.5} spacing={1}>
            {below}
          </Silk>
        )}
        <rect x={x0 - 3.5} y={y0 - 3.5} width={w + 7} height={h + 7} rx={4} fill="#0a0c10" stroke="#000" strokeWidth={0.8} />
        <path d={`M${x0 - 3} ${y0 + h + 3.6}H${x0 + w + 3}`} stroke="#fff" strokeOpacity={0.12} strokeWidth={0.8} />
        {lit && <rect x={x0 - 2} y={y0 - 2} width={w + 4} height={h + 4} rx={4} fill={led.on} opacity={0.5} filter="url(#gp-glow)" />}
        <g transform={lit ? "translate(0 0.8)" : undefined}>
          <rect x={x0} y={y0} width={w} height={h} rx={2.5} fill={`url(#gp-cap-${lit ? "on" : "off"}-${color})`} />
          <rect x={x0 + 1.5} y={y0 + 1} width={w - 3} height={h * 0.38} rx={2} fill="#fff" opacity={lit ? 0.32 : 0.07} />
          <text
            x={x}
            y={PIVOT_Y + 3}
            fontSize={8}
            fontFamily={FONT}
            fontWeight={700}
            letterSpacing={1}
            textAnchor="middle"
            fill={lit ? "#2a1a08" : mix(led.on, P.ink, 0.55)}
            opacity={lit ? 1 : 0.8}
          >
            {legend}
          </text>
        </g>
      </g>
    </g>
  );
}

// The CLOCK rate switch: a three-way lever (FAST up, MED in the middle, SLOW down). Clicking its
// upper or lower half pushes it up or down a notch; arrows, Home / End, or Enter / Space (which
// cycles) work from the keyboard.
function RateSwitch({ x, rate, onRate, lamp }) {
  const set = (r) => onRate(Math.max(0, Math.min(RATES.length - 1, r)));
  return (
    <g
      data-tour-id="sw-rate"
      role="slider"
      tabIndex={0}
      aria-label="Clock rate"
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={RATES.length - 1}
      aria-valuenow={rate}
      aria-valuetext={RATES[rate].label}
      className="gp-ctl"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        set(e.clientY < r.top + r.height / 2 ? rate + 1 : rate - 1);
      }}
      onKeyDown={(e) => {
        const next = {
          ArrowUp: rate + 1,
          ArrowRight: rate + 1,
          ArrowDown: rate - 1,
          ArrowLeft: rate - 1,
          Home: 0,
          End: RATES.length - 1,
          Enter: (rate + 1) % RATES.length,
          " ": (rate + 1) % RATES.length,
        }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat || e.key.startsWith("Arrow")) set(next);
      }}
    >
      <HitArea x={x} w={34} />
      <Lamps cy={SW_LAMP_Y} r={4.5} lamps={[{ x, on: lamp, color: "white" }]} />
      <LeverLabels x={x} up="FAST" down="SLOW" isUp={rate === 2} />
      <Silk x={x + 11} y={PIVOT_Y + 2.5} size={6.5} spacing={0.5} anchor="start" weight={rate === MED ? 700 : 400} fill={rate === MED ? SILK : P.muted}>
        MED
      </Silk>
      <Lever x={x} pos={rate - 1} />
    </g>
  );
}

// A silkscreened group name with an Altair-style bracket under it.
function GroupHead({ x0, x1, children }) {
  const y = HEAD_Y + 4;
  return (
    <g pointerEvents="none">
      <Silk x={(x0 + x1) / 2} y={HEAD_Y} size={7.5} spacing={1.5} fill={P.soft}>
        {children}
      </Silk>
      <path d={`M${x0} ${y + 3}V${y}H${x1}V${y + 3}`} fill="none" stroke={SILK} strokeOpacity={0.4} strokeWidth={0.8} />
    </g>
  );
}

// The bottom strip: the switch panel. sim / setSim: the simulator. running / setRunning: the
// visualizer's one free-running clock, which the MANUAL / AUTO lever drives (it reads AUTO exactly
// while the clock runs, whoever started it). rate / setRate: that clock's rate ("slow" | "med" |
// "fast"), which the CLOCK switch drives. The visualizer stops the clock on HLT and PROG.
function Controls({ sim, setSim, running, setRunning, rate, setRate }) {
  const b = CONTROLS_BOX;
  const auto = running;
  const stopped = sim.prog || sim.halted;
  const rateIndex = Math.max(0, RATES.findIndex((r) => r.key === rate));

  const stopClock = () => setRunning(false);
  const setAuto = (on) => {
    if (!on) stopClock();
    else if (!stopped) setRunning(true);
  };
  const chooseRate = (i) => setRate(RATES[i].key);

  const addrBits = bitLamps(sim.addrSw, ADDR_XS, "amber");
  const dataBits = bitLamps(sim.dataSw, DATA_XS, "green");

  return (
    <g>
      <style>{CONTROL_CSS}</style>
      <ControlDefs />
      <rect
        x={b.x + 0.5}
        y={b.y + 0.5}
        width={b.w - 1}
        height={b.h - 1}
        rx={3.5}
        fill="rgba(0,0,0,0.2)"
        stroke={SILK}
        strokeOpacity={0.32}
        strokeWidth={0.9}
      />
      <Silk x={b.x + 14} y={b.y + 19} anchor="start" size={11} spacing={3} weight={700}>
        CONTROLS
      </Silk>
      {DIVIDERS.map((x) => (
        <path key={x} d={`M${x + 0.5} ${HEAD_Y - 8}V${HIT_BOTTOM}`} stroke={SILK} strokeOpacity={0.2} />
      ))}

      {/* switch numbers, as on the schematic in the book */}
      <g pointerEvents="none">
        {[
          ["S2", X.prog],
          ["S4", X.write],
          ["S5", X.clear],
          ["S6", X.step],
          ["S7", X.auto],
          ["CLOCK", X.rate],
        ].map(([t, x]) => (
          <Silk key={t} x={x} y={HEAD_Y} size={7.5} spacing={1.5} fill={P.soft}>
            {t}
          </Silk>
        ))}
      </g>
      {/* S2: RUN / PROG */}
      <Toggle
        tourId="sw-prog"
        x={X.prog}
        w={34}
        on={sim.prog}
        label={`RUN/PROG switch S2, ${sim.prog ? "PROG" : "RUN"}`}
        onFlip={() => {
          if (!sim.prog) stopClock();
          setSim((s) => setProg(s, !s.prog));
        }}
      >
        <Lamps cy={SW_LAMP_Y} r={4.5} lamps={[{ x: X.prog, on: sim.prog, color: "white" }]} />
        <LeverLabels x={X.prog} up="PROG" down="RUN" isUp={sim.prog} />
      </Toggle>

      {/* S1 and S3: address and data switches, MSB on the left */}
      <g data-tour-id="sw-addr">
        <GroupHead x0={ADDR_XS[0] - 10} x1={ADDR_XS[3] + 10}>
          S1 · ADDRESS
        </GroupHead>
        <Lamps cy={SW_LAMP_Y} r={4.5} lamps={addrBits} />
        {ADDR_XS.map((x, k) => {
          const bit = 3 - k;
          const on = addrBits[k].on;
          return (
            <Toggle
              key={`a${bit}`}
              x={x}
              w={26}
              on={on}
              label={`Address switch A${bit}, ${on ? "on" : "off"}`}
              onFlip={() => setSim((s) => toggleAddrBit(s, bit))}
            >
              <Silk x={x} y={UP_Y} size={7.5} spacing={0.5} fill={on ? SILK : P.muted}>
                {`A${bit}`}
              </Silk>
            </Toggle>
          );
        })}
        <g pointerEvents="none">
          <Readout x={(ADDR_XS[0] + ADDR_XS[3]) / 2} y={SW_READ_Y} size={10}>
            {nibble(sim.addrSw)}
          </Readout>
        </g>
      </g>
      <g data-tour-id="sw-data">
        <GroupHead x0={DATA_XS[0] - 10} x1={DATA_XS[7] + 10}>
          S3 · DATA
        </GroupHead>
        <Lamps cy={SW_LAMP_Y} r={4.5} lamps={dataBits} />
        {DATA_XS.map((x, k) => {
          const bit = 7 - k;
          const on = dataBits[k].on;
          return (
            <Toggle
              key={`d${bit}`}
              x={x}
              w={26}
              on={on}
              label={`Data switch D${bit}, ${on ? "on" : "off"}`}
              onFlip={() => setSim((s) => toggleDataBit(s, bit))}
            >
              <Silk x={x} y={UP_Y} size={7.5} spacing={0.5} fill={on ? SILK : P.muted}>
                {`D${bit}`}
              </Silk>
            </Toggle>
          );
        })}
        <g pointerEvents="none">
          <Readout x={(DATA_XS[0] + DATA_XS[7]) / 2} y={SW_READ_Y} size={10}>
            {`${byte(sim.dataSw)} · ${decodeWord(sim.dataSw) ?? "NOP"}`}
          </Readout>
        </g>
      </g>

      {/* S4: WRITE, only in PROG */}
      <PushButton
        tourId="btn-write"
        x={X.write}
        legend="WRITE"
        disabled={!sim.prog}
        label={`WRITE (S4): store the data switches at address ${hex(sim.addrSw, 1)}H${sim.prog ? "" : ", PROG only"}`}
        onPress={() => setSim((s) => write(s))}
      />

      {/* S5 CLEAR / START, S6 SINGLE STEP */}
      <PushButton
        tourId="btn-clear"
        x={X.clear}
        legend="CLEAR"
        below="START"
        color="red"
        label="CLEAR/START (S5)"
        onPress={() => {
          stopClock();
          setSim((s) => clear(s));
        }}
      />
      <PushButton
        tourId="btn-step"
        x={X.step}
        legend="STEP"
        above="SINGLE"
        disabled={stopped || auto}
        label="SINGLE STEP (S6): one clock pulse"
        onPress={() => setSim((s) => step(s))}
      />

      {/* S7: MANUAL / AUTO, and the clock rate */}
      <Toggle
        tourId="sw-auto"
        x={X.auto}
        w={42}
        on={auto}
        disabled={stopped && !auto}
        label={`MANUAL/AUTO switch S7, ${auto ? "AUTO" : "MANUAL"}`}
        onFlip={() => setAuto(!auto)}
      >
        <Lamps cy={SW_LAMP_Y} r={4.5} lamps={[{ x: X.auto, on: auto, color: "white" }]} />
        <LeverLabels x={X.auto} up="AUTO" down="MANUAL" isUp={auto} />
      </Toggle>
      <RateSwitch x={X.rate} rate={rateIndex} onRate={chooseRate} lamp={auto && sim.cycles % 2 === 1} />

      <PushButton
        tourId="btn-example"
        x={X.load}
        legend="LOAD"
        below="EXAMPLE"
        label="Load example program 10-1 and clear"
        onPress={() => {
          stopClock();
          setSim((s) => clear(loadExample(s)));
        }}
      />
    </g>
  );
}

// --- tour spotlight -------------------------------------------------------------------------
//
// The guided tour points at parts of the panel by id (the same ids as the data-tour-id
// attributes). Each entry is a part's box in panel coordinates; `parts`, when present, lists the
// separate boxes to outline instead of the one bounding box.

const CTL_Y = HEAD_Y - 9; // a control's switch number or group name …
const ctl = (x0, x1) => ({ x: x0, y: CTL_Y, w: x1 - x0, h: HIT_BOTTOM - CTL_Y }); // … down to its hit area
const BUTTON_HALF = 24; // a push button's bezel, half its width
const button = (x) => ctl(x - BUTTON_HALF, x + BUTTON_HALF);

const RING_PARTS = [
  // the CLK lamp and its label
  { x: B.ctrl.x + RING.clk - 9, y: B.ctrl.y + RING.clk - 9, w: 44, h: 18 },
  // the T1 … T6 lamps and their labels
  {
    x: B.ctrl.x + RING.t1 - 11,
    y: B.ctrl.y + RING.lampY - 11,
    w: 5 * RING.step + 22,
    h: RING.labelY - RING.lampY + 15,
  },
];

const bounds = (boxes) => {
  const x = Math.min(...boxes.map((r) => r.x));
  const y = Math.min(...boxes.map((r) => r.y));
  const w = Math.max(...boxes.map((r) => r.x + r.w)) - x;
  const h = Math.max(...boxes.map((r) => r.y + r.h)) - y;
  return { x, y, w, h };
};

export const TOUR_BOXES = {
  ...PANEL_BOXES, // pc, mar, ram, ir, a, alu, b, bus, out, ctrl, con
  ring: { ...bounds(RING_PARTS), parts: RING_PARTS },
  "sw-addr": ctl(ADDR_XS[0] - 12, ADDR_XS[3] + 12),
  "sw-data": ctl(DATA_XS[0] - 9, DATA_XS[7] + 9),
  "sw-prog": ctl(X.prog - 17, X.prog + 17),
  "btn-write": button(X.write),
  "btn-clear": button(X.clear),
  "btn-step": button(X.step),
  "sw-auto": ctl(X.auto - 19.5, X.auto + 19.5),
  "sw-rate": ctl(X.rate - 19, X.rate + 29), // MED is printed to the right of the lever
  "btn-example": button(X.load),
};

const SPOT_PAD = 3; // how far the outline sits outside a part

// Pulsing warm-white outlines with an amber glow around the parts in `highlight`, above the
// panel, and a light shade over everything else. Neither takes pointer events.
function Spotlight({ highlight }) {
  const rects = highlight
    .flatMap((id) => {
      const box = TOUR_BOXES[id];
      return box ? (box.parts ?? [box]).map((r, i) => ({ ...r, key: `${id}-${i}` })) : [];
    })
    .map((r) => ({ ...r, x: r.x - SPOT_PAD, y: r.y - SPOT_PAD, w: r.w + 2 * SPOT_PAD, h: r.h + 2 * SPOT_PAD }));
  if (rects.length === 0) return null;
  return (
    <g pointerEvents="none" aria-hidden="true">
      <mask id="gp-spot-mask" maskUnits="userSpaceOnUse" x={0} y={0} width={PANEL.w} height={PANEL.h}>
        <rect width={PANEL.w} height={PANEL.h} fill="#fff" />
        {rects.map((r) => (
          <rect key={r.key} x={r.x} y={r.y} width={r.w} height={r.h} rx={6} fill="#000" />
        ))}
      </mask>
      <rect className="gp-dim" width={PANEL.w} height={PANEL.h} fill="#000" opacity={0.28} mask="url(#gp-spot-mask)" />
      {rects.map((r) => (
        <g key={r.key} className="gp-spot">
          <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={6} fill="none" stroke={P.led.amber.on} strokeWidth={4} opacity={0.55} filter="url(#gp-glow)" />
          <rect className="gp-spot-line" x={r.x} y={r.y} width={r.w} height={r.h} rx={6} fill="none" stroke={P.led.white.on} strokeWidth={1.8} />
        </g>
      ))}
    </g>
  );
}

// --- motion ---------------------------------------------------------------------------------
//
// CSS only. Lamps fade with transitions; one-shot effects (a register's flash, the bus sweep, the
// CLK blink, the CON flare) are elements keyed by a change count, so React remounts them on each
// change and their animation starts over. Durations are custom properties set from the clock
// period on the panel, so each effect ends before the next tick even at FAST. Reduced motion keeps
// the instant color changes and drops the rest.
const PANEL_CSS = `
.gp-led { transition: opacity var(--gp-led, 80ms) ease-out, visibility var(--gp-led, 80ms); }
.gp-led.gp-warm { transition-duration: var(--gp-warm-off, 150ms); }
.gp-led.gp-warm.gp-on { transition-duration: var(--gp-warm-on, 110ms); }
.gp-flash { pointer-events: none; animation: gp-fade-out var(--gp-flash, 300ms) ease-out forwards; }
.gp-blink { animation: gp-fade-out var(--gp-blink, 200ms) ease-in forwards; }
.gp-pulse { transform-box: fill-box; transform-origin: center; animation: gp-pulse var(--gp-pulse, 260ms) ease-out forwards; }
.gp-sweep { pointer-events: none; animation: gp-sweep var(--gp-sweep, 420ms) cubic-bezier(0.45, 0, 0.55, 1) forwards; }
.gp-breathe { animation: gp-breathe 2.8s ease-in-out infinite; }
.gp-rm { display: none; }
.gp-dim { animation: gp-fade-in 250ms ease-out both; }
.gp-spot { animation: gp-spot 1.4s ease-in-out infinite; }
.gp-spot-line { animation: gp-spot-line 1.4s ease-in-out infinite; }
@keyframes gp-fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes gp-fade-in { from { opacity: 0; } }
@keyframes gp-spot { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
@keyframes gp-spot-line { 0%, 100% { stroke-width: 2.2px; } 50% { stroke-width: 1.2px; } }
@keyframes gp-pulse { from { opacity: 0.85; transform: scale(1.35); } to { opacity: 0; transform: scale(1); } }
@keyframes gp-sweep {
  from { opacity: 0; transform: translateX(0); }
  20%, 75% { opacity: 1; }
  to { opacity: 0; transform: translateX(var(--gp-dx, 0px)); }
}
@keyframes gp-breathe { 0%, 100% { opacity: 1; } 50% { opacity: 0.38; } }
@media (prefers-reduced-motion: reduce) {
  .gp-led { transition: none; }
  .gp-flash, .gp-blink, .gp-pulse, .gp-sweep { display: none; }
  .gp-breathe, .gp-dim, .gp-spot, .gp-spot-line { animation: none; }
  .gp-rm { display: inline; }
}
`;

// What the panel shows that can change: a clock pulse (`tick`, counted only when the count of T
// states goes up, so CLEAR is not one) and each register's value as displayed.
const shown = (sim, d) => ({
  tick: sim.cycles,
  pc: sim.pc,
  mar: d.ramAddr,
  ram: `${d.ramAddr}:${sim.ram[d.ramAddr]}`,
  ir: sim.ir,
  a: sim.a,
  b: sim.b,
  out: sim.out,
});
const NO_CHANGES = { tick: 0, pc: 0, mar: 0, ram: 0, ir: 0, a: 0, b: 0, out: 0 };

// How many times each of those has changed since the panel mounted, from the last sim seen (kept
// in a ref). The counts key the one-shot effects. Comparing by sim identity keeps it idempotent
// when React renders twice, and it adds no state, so no extra renders.
function useChangeCounts(sim, d) {
  const seen = useRef(null);
  const s = seen.current;
  if (!s) {
    seen.current = { sim, vals: shown(sim, d), counts: NO_CHANGES };
  } else if (s.sim !== sim) {
    const vals = shown(sim, d);
    const counts = { ...s.counts };
    for (const k of Object.keys(vals)) {
      if (k === "tick" ? vals.tick > s.vals.tick : vals[k] !== s.vals[k]) counts[k] += 1;
    }
    seen.current = { sim, vals, counts };
  }
  return seen.current.counts;
}

// The effect durations for a clock period of `ms`, as custom properties.
function motionVars(ms) {
  const t = (f, max) => `${Math.round(Math.min(max, ms * f))}ms`;
  return {
    "--gp-led": t(0.5, 80),
    "--gp-warm-on": t(0.5, 110),
    "--gp-warm-off": t(0.6, 150),
    "--gp-flash": t(0.6, 300),
    "--gp-blink": t(0.55, 200),
    "--gp-pulse": t(0.6, 260),
    "--gp-sweep": t(0.7, 420),
  };
}

// --- panel ----------------------------------------------------------------------------------

// sim / setSim: the simulator state and its setter. d: derive(sim). running / setRunning: the
// free-running clock. rate / setRate: its rate ("slow" | "med" | "fast"); stepMs: its period in
// ms (STEP_MS[rate]). onOpen(id): open a part (zooms in from its section). focusId: the hovered or
// selected part; onEnter(id) / onLeave(id) / onActivate(block, drill): the same callbacks the
// overview blocks use. highlight: the ids (TOUR_BOXES keys) of the parts the tour is pointing at.
export default function GamePanel({
  sim,
  d,
  setSim,
  running,
  setRunning,
  rate,
  setRate,
  stepMs,
  onOpen,
  focusId,
  onEnter,
  onLeave,
  onActivate,
  highlight = [],
}) {
  const ctx = { d, focusId, onEnter, onLeave, onActivate, onOpen };
  const word = sim.ram[d.ramAddr];
  const n = useChangeCounts(sim, d);
  // Free-running, effects must end before the next tick; stepped by hand they can take longer.
  const period = running ? stepMs ?? 550 : Math.max(stepMs ?? 550, 550);
  return (
    <g fontFamily={FONT} style={motionVars(period)}>
      <style>{PANEL_CSS}</style>
      <Defs />
      <Case />

      <Register id="pc" ctx={ctx} title="PC" sub="PROGRAM COUNTER" value={sim.pc} bits={4} color="amber" flash={n.pc} />
      <Register
        id="mar"
        ctx={ctx}
        title="MAR"
        sub={sim.prog ? "ADDR SWITCHES" : "MEMORY ADDRESS"}
        value={d.ramAddr}
        bits={4}
        color="amber"
        flash={n.mar}
      />
      <Section id="ram" ctx={ctx} title="RAM" sub={`16 × 8 · WORD ${hex(d.ramAddr, 1)}H`} flash={n.ram}>
        <Lamps cy={B.ram.y + LAMP_Y} lamps={bitLamps(word, lampXs(8, mid("ram"), 18, 6), "green")} />
        <Readout x={mid("ram")} y={B.ram.y + READ_Y}>
          {`[${hex(d.ramAddr, 1)}H] ${byte(word)}`}
        </Readout>
      </Section>
      <InstructionRegister ctx={ctx} ir={sim.ir} flash={n.ir} />

      <Register id="a" ctx={ctx} title="A" sub="ACCUMULATOR" value={sim.a} bits={8} color="green" flash={n.a} />
      <Register id="alu" ctx={ctx} title="ALU" sub="ADDER-SUBTRACTER" value={d.alu} bits={8} color="green" />
      <AluBadge d={d} />
      <Register id="b" ctx={ctx} title="B" sub="B REGISTER" value={sim.b} bits={8} color="green" flash={n.b} />
      <Bus ctx={ctx} d={d} tick={n.tick} />

      <Output ctx={ctx} out={sim.out} flash={n.out} />
      <Controller ctx={ctx} sim={sim} d={d} tick={n.tick} />
      <ControlWord ctx={ctx} d={d} tick={n.tick} />

      <Controls sim={sim} setSim={setSim} running={running} setRunning={setRunning} rate={rate} setRate={setRate} />
      <Spotlight highlight={highlight} />
    </g>
  );
}
