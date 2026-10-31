// Signal names with bars (active low) and subscripts, as the book prints them: text like
// "puts it on the bus when {Ea} is high" is split into plain text and signal names from SIG.

import { SIG } from "./sap1Sim";

export function splitSignals(text) {
  return text
    .split(/(\{\w+\})/)
    .filter(Boolean)
    .map((part) => {
      const m = /^\{(\w+)\}$/.exec(part);
      return m && SIG[m[1]] ? { sig: m[1] } : part;
    });
}

// Inside an SVG <text>.
export function SvgText({ text }) {
  const out = [];
  let dy = 0; // undo a subscript's baseline shift on the next piece
  splitSignals(text).forEach((p, i) => {
    if (typeof p === "string") {
      out.push(<tspan key={i} dy={dy || undefined}>{p}</tspan>);
      dy = 0;
      return;
    }
    const s = SIG[p.sig];
    out.push(
      <tspan key={i} dy={dy || undefined} style={s.bar ? { textDecoration: "overline" } : undefined}>
        {s.base}
      </tspan>
    );
    dy = 0;
    if (s.sub) {
      out.push(<tspan key={`${i}s`} dy={3} fontSize="0.75em">{s.sub}</tspan>);
      dy = -3;
    }
  });
  return out;
}

// One signal name in HTML.
export function Sig({ k }) {
  const s = SIG[k];
  return (
    <span className="whitespace-nowrap">
      <span style={s.bar ? { textDecoration: "overline" } : undefined}>{s.base}</span>
      {s.sub && <sub>{s.sub}</sub>}
    </span>
  );
}

// A sentence in HTML.
export function HtmlText({ text }) {
  return splitSignals(text).map((p, i) => (typeof p === "string" ? <span key={i}>{p}</span> : <Sig key={i} k={p.sig} />));
}
