// Small drawing helpers for the diagram's wires: color blending, where a wire's bit-width mark
// goes, trimming a wire short of its arrowhead, and the pulse that runs along a lit wire.

// Blend two #rrggbb colors (t = 0 → a, 1 → b).
export function mix(a, b, t) {
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

// Where to draw a wire's bit-width mark: at bitsAt if given, else halfway along its longest
// segment.
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

const pointsAttr = (pts) => pts.map((p) => p.join(",")).join(" ");

// The path with its last point pulled back by `by` px.
export function trimEnd(pts, by) {
  const out = pts.map((p) => [...p]);
  const [x1, y1] = out[out.length - 2];
  const [x2, y2] = out[out.length - 1];
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len > by) out[out.length - 1] = [x2 - ((x2 - x1) / len) * by, y2 - ((y2 - y1) / len) * by];
  return out;
}

// The pulse animation (put it in the SVG's <defs>). A pulse is a dash on a polyline with
// pathLength 100: its dasharray is "<dash> 100" and its dashoffset starts at <dash> (just before
// the start), so moving the offset to -100 carries it from the first point to just past the last,
// then it loops. Reduced motion keeps the lit wires and drops the pulse.
export const PULSE_CSS = `
.sap1-pulse { animation-name: sap1-pulse; animation-timing-function: linear; animation-iteration-count: infinite; }
@keyframes sap1-pulse { to { stroke-dashoffset: -100; } }
@media (prefers-reduced-motion: reduce) { .sap1-pulse { display: none; } }`;

// A pulse runs the length of its wire once per clock period, but never faster than this, so it
// still reads at the fast rate.
const PULSE_MIN_MS = 300;

const pathLength = (pts) => pts.slice(1).reduce((n, [x, y], i) => n + Math.hypot(x - pts[i][0], y - pts[i][1]), 0);

// A bright dash travelling along pts, from the first point to the last, once per clock period
// stepMs, looping (see PULSE_CSS). The dash is about 26 px long, kept between 5% and 40% of the wire.
export function Pulse({ pts, stroke, width, stepMs }) {
  const dash = Math.min(40, Math.max(5, (26 / Math.max(1, pathLength(pts))) * 100));
  return (
    <polyline
      className="sap1-pulse"
      points={pointsAttr(pts)}
      pathLength={100}
      fill="none"
      stroke={stroke}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={`${dash.toFixed(2)} 100`}
      strokeDashoffset={dash.toFixed(2)}
      style={{ animationDuration: `${Math.max(stepMs, PULSE_MIN_MS)}ms` }}
    />
  );
}
