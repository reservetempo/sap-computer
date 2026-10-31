// Color palettes for the SAP-1 page. Every color the visualizer draws comes from a palette, and
// both palettes have the same keys, so the visualizer can be handed either one.
//
// Besides the plain colors, each palette has:
//   led[color]      { on, off }: a lit and an unlit lamp (red, amber, green, white)
//   type[t]         the lit color of a signal type (see signalTypes.js): address, data, control,
//                   status, output
//   typeOff[t]      an unlit LED of that type
//   tint[t]         the fill behind an active block of that type
//   font.label      font stack for titles, section labels and silkscreen lettering
//   font.body       font stack for running text
//   font.mono       font stack for numbers, binary and readouts
// In the HTML parts the same values are CSS variables: --sap-type-address, --sap-led-amber-on,
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

// The textbook look has a single accent: every lamp and every signal type is the same red.
const tbLed = { on: TB.accent, off: TB.ledOff };
export const TEXTBOOK = {
  ...TB,
  led: { red: tbLed, amber: tbLed, green: tbLed, white: tbLed },
  type: byType(() => TB.accent),
  typeOff: byType(() => TB.ledOff),
  tint: byType(() => TB.accentTint),
  font: TB_FONT,
};

// 1970s front-panel lamps. Period colors only: red, amber, yellow-green and warm incandescent white.
const LED = {
  red: { on: "#ff3b2f", off: "#3a0e0b" },
  amber: { on: "#ffb000", off: "#3a2a00" },
  green: { on: "#8cff3f", off: "#16300c" },
  white: { on: "#ffe8b0", off: "#2e2a20" },
};

// Instrument-panel lettering: Michroma (after Microgramma / Eurostile, the 1970s panel face) for
// labels, IBM Plex Mono for readouts and running text.
const PLEX = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const GAME_FONT = {
  label: "Michroma, Eurostile, Microgramma, 'Helvetica Neue', Arial, sans-serif",
  body: PLEX,
  mono: PLEX,
};

// Which lamp color each signal type uses in the game look.
export const TYPE_LED = { address: "amber", data: "green", control: "red", status: "white", output: "red" };

// Dark charcoal blue-grey panel with off-white silkscreen lettering.
export const GAME = {
  scheme: "dark",
  bg: "#12161f",
  block: "#1a1f2b",
  blockAlt: "#202634",
  hover: "#262d3b",
  hoverStrong: "#303848",
  ledOff: LED.red.off,
  ink: "#e8e2d0",
  soft: "#c9c2ae",
  muted: "#9a937f",
  faint: "#6e6858",
  frame: "#3a4150",
  rule: "#2a3040",
  disabled: "#4a5162",
  accent: LED.red.on,
  accentTint: LED.red.off,
  onAccent: "#12161f",
  led: LED,
  type: byType((t) => LED[TYPE_LED[t]].on),
  typeOff: byType((t) => LED[TYPE_LED[t]].off),
  tint: byType((t) => LED[TYPE_LED[t]].off),
  font: GAME_FONT,
};

// The two looks, by the name the mode toggle stores.
export const PALETTES = { game: GAME, textbook: TEXTBOOK };

// The palette as CSS custom properties for the HTML parts of the page. Nested keys are joined:
// accentTint → --sap-accent-tint, type.address → --sap-type-address, led.amber.on → --sap-led-amber-on.
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
