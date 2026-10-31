// The color palette for the SAP-1 page. Every color the visualizer draws comes from it.
//
// Besides the plain colors, it has:
//   type[t]         the lit color of a signal type (see signalTypes.js): address, data, control,
//                   status, output
//   typeOff[t]      an unlit LED of that type
//   tint[t]         the fill behind an active block of that type
//   font.label      font stack for titles and section labels
//   font.body       font stack for running text
//   font.mono       font stack for numbers, binary and readouts
// In the HTML parts the same values are CSS variables: --sap-type-address, --sap-accent-tint,
// --sap-font-mono, ... The fonts are self-hosted (@fontsource, imported in main.jsx).

import { SIGNAL_TYPES } from "./signalTypes";

// Dark "blackboard" take on the textbook diagrams: light chalk lines, red for what is active.
const TB = {
  scheme: "dark", // CSS color-scheme (scrollbars, form controls)
  bg: "#0d0f12", // page background
  block: "#14171c", // block fill
  blockAlt: "#191d23", // switch fill
  hover: "#222730", // hovered block fill, idle bus fill
  hoverStrong: "#2c323c", // hovered bus fill
  ledOff: "#1f2329", // unlit LED
  ink: "#e5e7eb", // lines and main text
  soft: "#c4c8cf", // secondary text
  muted: "#9ca3af", // labels and notes
  faint: "#6b7280", // de-emphasised text
  frame: "#4b5563", // dashed groups, outer borders
  rule: "#262b33", // dividers in the side panel
  disabled: "#3a404a", // disabled buttons
  accent: "#ff4d4d", // active signals and blocks
  accentTint: "#3a1214", // fill behind active blocks and rows
  onAccent: "#0d0f12", // text on an accent fill
};

// 1970s textbook type: a Century Schoolbook-style serif (Source Serif 4 stands in for TeX Gyre
// Schola, which Fontsource doesn't carry) and a typewriter mono for numbers.
const TB_SERIF = "'Source Serif 4', 'Century Schoolbook', 'New Century Schoolbook', 'TeX Gyre Schola', Georgia, serif";
const TB_FONT = {
  label: TB_SERIF,
  body: TB_SERIF,
  mono: "'Courier Prime', 'Courier New', Courier, monospace",
};

const byType = (f) => Object.fromEntries(SIGNAL_TYPES.map((t) => [t, f(t)]));

// A single accent: every signal type is the same red.
export const TEXTBOOK = {
  ...TB,
  type: byType(() => TB.accent),
  typeOff: byType(() => TB.ledOff),
  tint: byType(() => TB.accentTint),
  font: TB_FONT,
};

// The palette as CSS custom properties for the HTML parts of the page. Nested keys are joined:
// accentTint → --sap-accent-tint, type.address → --sap-type-address, font.mono → --sap-font-mono.
export function cssVars(pal) {
  const out = {};
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj)) {
      const name = `${prefix}-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
      if (v && typeof v === "object") walk(v, name);
      else out[name] = v;
    }
  };
  walk(pal, "--sap");
  return out;
}
