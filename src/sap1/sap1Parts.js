// The SAP-1 as a tree of diagrams. Each node has a diagram; a block whose id appears in
// node.children can be clicked to open that child. To add more detail, add a child node.
//
// Every diagram is drawn on the same 820 × 600 canvas, except ROOT_TALL (the overview on a phone).
// Text can include signal tokens like {Lm} or {CLK_}; see SIG in sap1Sim.js.
//
// Block:  { id, x, y, w, h, kind?, tag?, title, sub?, value?(s, d), act?: [signals], about }
//         kind: 'chip' (default) | 'switch' | 'bus' | 'display' | 'con'
// Group:  { x, y, w, h, label, value?(s, d), act? }        dashed frame around chips
// Wire:   { pts: [[x, y], ...], bits?, bitsAt?: [x, y], on?: signal, arrow?: false, label?, labelAt?, anchor?, dots?, type? }
// Pin:    { sig, at: [x, y], dir: 'left' | 'right' | 'up' | 'down', len?, type? }   short control-signal stub
//
// type ('address' | 'data' | 'control' | 'status' | 'output') is only given where signalType() in
// signalTypes.js can't work it out from the bit width or the signal (see there).

import { OPS, bin, hex, ramAddr } from './sap1Sim';

export const CANVAS = { w: 820, h: 600 };

const P = {
  ls107: 'Dual JK master-slave flip-flop.',
  ls173: '4-bit D-type buffer register with three-state outputs. It loads its inputs on a rising clock edge when both load pins (9 and 10) are low.',
  ls126: 'Quad three-state buffer, which the book calls a "normally open switch". Each output follows its input while enabled and floats (Hi-Z) otherwise.',
  ls86: 'Quad 2-input exclusive-OR gate.',
  ls83: '4-bit binary full adder with carry in and carry out.',
  t189: '64-bit (16 × 4) static RAM with three-state outputs.',
  ls157: 'Quad 2-to-1 multiplexer: passes one of two 4-bit words.',
};

// --- reusable layout for an 8-bit register built from two 74LS173s -------------------------

function registerPair({ y, chips, value, act, load }) {
  const g = { x: 200, y, w: 420, h: 150, label: '8-bit register', value, act };
  const blocks = chips.map(([tag, role], i) => ({
    id: tag.toLowerCase(),
    x: 220 + i * 195, y: y + 32, w: 185, h: 100,
    tag, title: '74LS173', sub: '4-bit register', act,
    about: `${role} ${P.ls173}`,
  }));
  const pins = [
    { sig: load, at: [300, y], dir: 'up' },
    { sig: 'CLK', at: [520, y], dir: 'up' },
  ];
  return { group: g, blocks, pins };
}

// --- level 3: clock, clear and power (Fig. 10-14) -------------------------------------------

const clock = {
  title: 'Clock, clear and power',
  part: 'C24–C30',
  about: [
    'A 555 timer (C28) runs at 2 kHz with a 75% duty cycle. The start-the-clock flip-flop (C29) halves that to 1 kHz with a 50% duty cycle.',
    'S7 picks AUTO (the 555) or MANUAL, where each press of S6 gives one clock pulse so you can walk through the T states. When the op code is HLT, {HLT_} goes low and stops both paths. C27 buffers the result into CLK and {CLK_}.',
  ],
  diagram: {
    blocks: [
      { id: 's5', kind: 'switch', x: 30, y: 30, w: 140, h: 64, tag: 'S5', title: 'Clear / start', sub: 'push button',
        about: 'Press before a run. It sends CLR to the instruction register and {CLR_} to the program counter, ring counter and C29.' },
      { id: 'c24a', x: 220, y: 30, w: 170, h: 64, tag: 'C24', title: '7400', sub: 'clear-start debouncer',
        about: 'Two cross-coupled NAND gates (half of a 7400 quad 2-input NAND) turn the bouncing switch contacts into clean CLR and {CLR_} signals.' },
      { id: 's6', kind: 'switch', x: 30, y: 140, w: 140, h: 64, tag: 'S6', title: 'Single step', sub: 'push button',
        about: 'In MANUAL mode, each press and release of S6 gives one clock pulse, which moves the computer on by one T state. Handy for debugging.' },
      { id: 'c24b', x: 220, y: 140, w: 170, h: 64, tag: 'C24', title: '7400', sub: 'single-step debouncer',
        about: 'The other half of C24, debouncing the single-step button.' },
      { id: 'c25', x: 450, y: 140, w: 150, h: 64, tag: 'C25', title: '74LS10', sub: '3-input NAND',
        about: 'Triple 3-input NAND. One gate passes single-step pulses only in MANUAL mode and only while {HLT_} is high.' },
      { id: 's7', kind: 'switch', x: 30, y: 250, w: 140, h: 64, tag: 'S7', title: 'Manual / auto', sub: 'SPDT switch',
        about: 'Chooses between the single-step clock (MANUAL) and the free-running clock (AUTO).' },
      { id: 'c26a', x: 220, y: 250, w: 170, h: 64, tag: 'C26', title: '74LS00', sub: 'manual-auto debouncer',
        about: 'Two NAND gates of C26 debounce the manual/auto switch.' },
      { id: 'c28', x: 30, y: 370, w: 140, h: 64, tag: 'C28', title: 'NE555', sub: 'timer, 2 kHz',
        about: '555 timer wired as an oscillator. Its 36 kΩ and 18 kΩ resistors and 0.01 µF capacitor give a 2 kHz rectangular wave with a 75% duty cycle.' },
      { id: 'c29', x: 220, y: 370, w: 170, h: 64, tag: 'C29', title: '74LS107', sub: 'start-the-clock flip-flop',
        about: 'A JK flip-flop that divides the 555 output by two, giving 1 kHz at a 50% duty cycle. J and K come from {HLT_}, so it stops toggling on HLT; {CLR_} resets it.' },
      { id: 'c26b', x: 450, y: 370, w: 150, h: 64, tag: 'C26', title: '74LS00', sub: 'clock select',
        about: 'The other two gates of C26 form a NAND-NAND network that steers either the single-step clock or the automatic clock to the output.' },
      { id: 'c27', x: 650, y: 370, w: 140, h: 64, tag: 'C27', title: '7404', sub: 'clock buffers',
        about: 'Hex inverter used as clock buffers. It is standard TTL rather than low-power Schottky, so it can drive the 19 LS loads on CLK. Two inverters give CLK, one gives {CLK_}.' },
      { id: 'psu', x: 30, y: 500, w: 360, h: 70, tag: 'C30', title: 'Power supply', sub: 'bridge rectifier + LM340T-5',
        about: 'A transformer and full-wave bridge rectifier (D1–D4) charge a 1000 µF filter capacitor to about 20 V dc. The LM340T-5 regulator (C30) turns this into a steady +5 V for every chip.' },
    ],
    wires: [
      { pts: [[170, 62], [220, 62]] },
      { pts: [[390, 62], [790, 62]], label: 'CLR → IR  ·  {CLR_} → PC, ring counter, C29', labelAt: [590, 52] },
      { pts: [[170, 172], [220, 172]], type: 'status' },
      { pts: [[390, 172], [450, 172]], type: 'status' },
      { pts: [[170, 282], [220, 282]] },
      { pts: [[390, 270], [420, 270], [420, 195], [450, 195]], label: 'manual', labelAt: [426, 238], anchor: 'start' },
      { pts: [[390, 294], [420, 294], [420, 390], [450, 390]], label: 'auto', labelAt: [426, 348], anchor: 'start' },
      { pts: [[170, 402], [220, 402]], type: 'status', label: '2 kHz', labelAt: [195, 394] },
      { pts: [[390, 418], [450, 418]], type: 'status', label: '1 kHz', labelAt: [420, 410] },
      { pts: [[525, 204], [525, 370]], type: 'status', label: 'single step', labelAt: [533, 290], anchor: 'start' },
      { pts: [[600, 402], [650, 402]], type: 'status' },
      { pts: [[720, 434], [720, 478]], type: 'status', label: 'CLK, {CLK_} to the computer', labelAt: [720, 496] },
      { pts: [[390, 535], [790, 535]], label: '+5 V to every chip', labelAt: [590, 525] },
    ],
    pins: [
      { sig: 'HLT_', at: [525, 140], dir: 'up', len: 24 },
      { sig: 'HLT_', at: [305, 370], dir: 'up', len: 24 },
      { sig: 'CLR_', at: [305, 434], dir: 'down', len: 24 },
    ],
  },
};

// --- level 2 -------------------------------------------------------------------------------

const pc = {
  title: 'Program counter',
  part: 'C1–C3',
  about: [
    'A 4-bit ripple counter made from two 74LS107 dual JK flip-flops. J and K are tied to {Cp}, so the flip-flops only toggle while counting is enabled. {CLK_} clocks the first flip-flop and each Q output clocks the next.',
    'A 74LS126 three-state buffer connects the count to the lower four lines of the W bus only when {Ep} is high. {CLR_} resets the count to 0000 before a run.',
  ],
  diagram: {
    blocks: [
      { id: 'c2', x: 200, y: 100, w: 200, h: 100, tag: 'C2', title: '74LS107', sub: 'flip-flops for bits 1, 0',
        value: (s) => `Q1 Q0 = ${bin(s.pc & 3, 2)}`, act: ['Cp'],
        about: `Produces the lower two address bits. ${P.ls107}` },
      { id: 'c1', x: 480, y: 100, w: 200, h: 100, tag: 'C1', title: '74LS107', sub: 'flip-flops for bits 3, 2',
        value: (s) => `Q3 Q2 = ${bin(s.pc >> 2, 2)}`, act: ['Cp'],
        about: `Produces the upper two address bits. Its first flip-flop is clocked by bit 1 from C2. ${P.ls107}` },
      { id: 'c3', x: 200, y: 330, w: 480, h: 100, tag: 'C3', title: '74LS126', sub: 'quad three-state buffer',
        value: (s, d) => (d.sig.has('Ep') ? `driving the bus: ${bin(s.pc, 4)}` : 'outputs floating (Hi-Z)'), act: ['Ep'],
        about: `Gives the program counter a three-state output, so it only drives the bus when {Ep} is high. ${P.ls126}` },
    ],
    wires: [
      { pts: [[90, 60], [580, 60], [580, 100]], on: 'Cp', label: '{Cp}', labelAt: [84, 64], anchor: 'end', dots: [[300, 60]] },
      { pts: [[300, 60], [300, 100]], on: 'Cp' },
      { pts: [[90, 150], [200, 150]], type: 'status', label: '{CLK_}', labelAt: [84, 154], anchor: 'end' },
      { pts: [[400, 150], [480, 150]], label: 'ripple', labelAt: [440, 142] },
      { pts: [[350, 200], [350, 330]], bits: 2 },
      { pts: [[630, 200], [630, 330]], bits: 2 },
      { pts: [[90, 380], [200, 380]], on: 'Ep', label: '{Ep}', labelAt: [84, 384], anchor: 'end' },
      { pts: [[680, 380], [790, 380]], bits: 4, on: 'Ep', label: 'to W bus', labelAt: [735, 370] },
    ],
    pins: [
      { sig: 'CLR_', at: [240, 200], dir: 'down', len: 30 },
      { sig: 'CLR_', at: [520, 200], dir: 'down', len: 30 },
    ],
    notes: [{ text: 'J = K = Cp: count enable', at: [440, 50] }],
  },
};

const mar = {
  title: 'Input and MAR',
  part: 'C4, C5, S1, S2',
  about: [
    'The memory address register is a 74LS173 4-bit register (C4). Its output-control pins are grounded, giving a two-state output, because it only feeds the RAM and never drives the bus.',
    'A 74LS157 multiplexer (C5) chooses where the RAM address comes from: the address switches S1 while you program the memory, or the MAR during a run. The RUN/PROG switch S2 makes the choice.',
  ],
  diagram: {
    blocks: [
      { id: 'c4', x: 200, y: 110, w: 200, h: 100, tag: 'C4', title: '74LS173', sub: 'MAR, 4-bit register',
        value: (s) => bin(s.mar, 4), act: ['Lm'],
        about: `The memory address register. Loads the lower four bits of the W bus when {Lm} is low. ${P.ls173}` },
      { id: 's1', kind: 'switch', x: 200, y: 330, w: 200, h: 90, tag: 'S1', title: 'Address switches', sub: '4-bit DIP switch',
        value: (s) => bin(s.addrSw, 4),
        about: 'Sets the RAM address by hand while you load a program.' },
      { id: 'c5', x: 500, y: 110, w: 180, h: 310, tag: 'C5', title: '74LS157', sub: '2-to-1 multiplexer',
        value: (s) => (s.prog ? 'passing the switches' : 'passing the MAR'), act: ['CE'],
        about: `Picks the address switches (PROG) or the MAR (RUN) as the RAM address. ${P.ls157}` },
      { id: 's2', kind: 'switch', x: 500, y: 480, w: 180, h: 80, tag: 'S2', title: 'RUN / PROG', sub: 'switch',
        value: (s) => (s.prog ? 'set to PROG' : 'set to RUN'),
        about: 'In PROG the switches address the RAM and {CE} is held low so you can write. In RUN the MAR addresses the RAM.' },
    ],
    wires: [
      { pts: [[40, 160], [200, 160]], bits: 4, on: 'Lm', label: 'from W bus', labelAt: [110, 150] },
      { pts: [[400, 160], [500, 160]], bits: 4, label: 'run', labelAt: [450, 150] },
      { pts: [[400, 375], [500, 375]], bits: 4, label: 'program', labelAt: [450, 365] },
      { pts: [[590, 480], [590, 420]], label: 'select', labelAt: [598, 455], anchor: 'start' },
      { pts: [[680, 265], [790, 265]], bits: 4, on: 'CE', label: 'to RAM', labelAt: [735, 255] },
    ],
    pins: [
      { sig: 'Lm', at: [260, 110], dir: 'up' },
      { sig: 'CLK', at: [340, 110], dir: 'up' },
    ],
  },
};

const ram = {
  title: '16 × 8 RAM',
  part: 'C6, C7',
  about: [
    'Two 74189 chips, each a 16 × 4 static RAM. Each one stores four bits of every word, so together they hold sixteen 8-bit words.',
    'To program it, set S2 to PROG, set the address (S1) and data (S3) switches, then press S4 to write. During a run, a low {CE} puts the addressed word on the W bus.',
  ],
  diagram: {
    blocks: [
      { id: 'c7', x: 200, y: 190, w: 200, h: 130, tag: 'C7', title: '74189', sub: '16 × 4 static RAM', act: ['CE'],
        about: `Stores four bits of each word. ${P.t189}` },
      { id: 'c6', x: 460, y: 190, w: 200, h: 130, tag: 'C6', title: '74189', sub: '16 × 4 static RAM', act: ['CE'],
        about: `Stores the other four bits of each word. ${P.t189}` },
      { id: 's3', kind: 'switch', x: 200, y: 470, w: 460, h: 70, tag: 'S3', title: 'Data switches', sub: '8-bit DIP switch',
        value: (s) => bin(s.dataSw),
        about: 'Sets the 8-bit word to store while programming.' },
      { id: 's4', kind: 'switch', x: 30, y: 470, w: 140, h: 70, tag: 'S4', title: 'Write', sub: 'push button',
        about: 'A momentary press takes {WE} low and writes the switch data into the addressed word.' },
    ],
    wires: [
      { pts: [[40, 120], [560, 120], [560, 190]], bits: 4, bitsAt: [140, 120], on: 'CE', label: 'address from C5', labelAt: [140, 110], dots: [[300, 120]] },
      { pts: [[300, 120], [300, 190]], on: 'CE', type: 'address' },
      { pts: [[260, 470], [260, 320]], bits: 4, type: 'data', bitsAt: [260, 355], label: 'data in', labelAt: [268, 448], anchor: 'start' },
      { pts: [[520, 470], [520, 320]], bits: 4, type: 'data', bitsAt: [520, 355] },
      { pts: [[360, 320], [360, 400], [790, 400]], arrow: true, bits: 8, bitsAt: [740, 400], on: 'CE', label: 'to W bus', labelAt: [740, 390], dots: [[620, 400]] },
      { pts: [[620, 320], [620, 400]], arrow: false, on: 'CE', type: 'data' },
    ],
    pins: [
      { sig: 'CE', at: [250, 190], dir: 'up', len: 30 },
      { sig: 'WE', at: [360, 190], dir: 'up', len: 30 },
      { sig: 'CE', at: [510, 190], dir: 'up', len: 30 },
      { sig: 'WE', at: [620, 190], dir: 'up', len: 30 },
    ],
  },
};

const ir = {
  title: 'Instruction register',
  part: 'C8, C9',
  about: [
    'Two 74LS173 4-bit registers. Both load from the W bus during T3, when {Li} is low.',
    'C8 holds the op code. Its output-control pins are grounded, so it always feeds the instruction decoder. C9 holds the address field and has a three-state output that drives the W bus when {Ei} is low.',
  ],
  diagram: {
    blocks: [
      { id: 'c8', x: 260, y: 90, w: 240, h: 120, tag: 'C8', title: '74LS173', sub: 'op code (upper nibble)',
        value: (s, d) => `${bin(s.ir >> 4, 4)} = ${d.op}`, act: ['Li'],
        about: `Holds I7–I4, the op code. ${P.ls173}` },
      { id: 'c9', x: 260, y: 310, w: 240, h: 120, tag: 'C9', title: '74LS173', sub: 'address field (lower nibble)',
        value: (s) => bin(s.ir & 15, 4), act: ['Li', 'Ei'],
        about: `Holds I3–I0, the address the instruction refers to. ${P.ls173}` },
    ],
    wires: [
      { pts: [[30, 260], [140, 260]], bits: 8, on: 'Li', label: 'from W bus', labelAt: [80, 250] },
      { pts: [[140, 260], [140, 150], [260, 150]], bits: 4, on: 'Li', type: 'data', label: 'bits 7–4', labelAt: [200, 140], dots: [[140, 260]] },
      { pts: [[140, 260], [140, 370], [260, 370]], bits: 4, on: 'Li', type: 'data', label: 'bits 3–0', labelAt: [200, 360] },
      { pts: [[500, 150], [790, 150]], bits: 4, type: 'data', label: 'to instruction decoder', labelAt: [645, 140] },
      { pts: [[500, 370], [790, 370]], bits: 4, on: 'Ei', label: 'to W bus', labelAt: [645, 360] },
    ],
    pins: [
      { sig: 'Li', at: [320, 90], dir: 'up' },
      { sig: 'CLK', at: [380, 90], dir: 'up' },
      { sig: 'CLR', at: [440, 90], dir: 'up' },
      { sig: 'Li', at: [320, 310], dir: 'up', len: 30 },
      { sig: 'CLK', at: [380, 310], dir: 'up', len: 30 },
      { sig: 'CLR', at: [440, 310], dir: 'up', len: 30 },
      { sig: 'Ei', at: [380, 430], dir: 'down', len: 30 },
    ],
  },
};

const ctrl = {
  title: 'Controller-sequencer',
  part: 'C24–C48',
  about: [
    'The ring counter produces T1 to T6 in turn. The instruction decoder turns the op code into one of LDA, ADD, SUB, OUT or {HLT_}.',
    'The control matrix combines the two into CON, the 12-bit control word. T1–T3 always give the fetch words 5E3H, BE3H and 263H. T4–T6 depend on the instruction.',
  ],
  diagram: {
    blocks: [
      { id: 'decoder', x: 170, y: 70, w: 220, h: 120, tag: 'C31–C34', title: 'Instruction decoder', sub: '74LS04 + 3 × 74LS20',
        value: (s, d) => (s.halted ? 'HLT' : d.op),
        about: 'C31, a 74LS04 hex inverter, makes the complements of the op-code bits. C32–C34, 74LS20 dual 4-input NANDs, decode them into LDA, ADD, SUB, OUT and {HLT_}. Only one is active at a time.' },
      { id: 'ring', x: 170, y: 270, w: 220, h: 120, tag: 'C36–C38', title: 'Ring counter', sub: '3 × 74LS107',
        value: (s) => (s.halted ? 'stopped' : `T${s.t}`),
        about: 'Also called a state counter. Six JK flip-flops pass a single 1 along: T1, T2 … T6, then back to T1. The negative {CLK} edge starts each T state, and registers load on the positive edge half a cycle later.' },
      { id: 'matrix', x: 480, y: 70, w: 200, h: 320, tag: 'C39–C48', title: 'Control matrix', sub: 'NAND gates',
        value: (s, d) => `CON = ${hex(d.con, 3)}H`,
        about: 'Hard-wired logic (74LS00, 74LS10 and 74LS20 NAND gates plus 74LS04 inverters) that combines T1–T6 with the decoded instruction to produce the 12-bit control word.' },
      { id: 'clock', x: 170, y: 470, w: 220, h: 100, tag: 'C24–C30', title: 'Clock and clear', sub: '555 timer, debouncers',
        about: 'Makes CLK, {CLK_}, CLR and {CLR_} and powers the board. Open it to see the parts.' },
    ],
    wires: [
      { pts: [[30, 130], [170, 130]], bits: 4, type: 'data', label: 'op code from IR', labelAt: [100, 120] },
      { pts: [[390, 130], [480, 130]], bits: 4, type: 'control', label: 'LDA…OUT', labelAt: [435, 120] },
      { pts: [[390, 330], [480, 330]], bits: 6, label: 'T1–T6', labelAt: [435, 320] },
      { pts: [[680, 230], [790, 230]], bits: 12, label: 'CON', labelAt: [735, 220] },
      { pts: [[280, 470], [280, 390]], type: 'status', label: 'CLK', labelAt: [290, 435], anchor: 'start' },
      { pts: [[390, 520], [790, 520]], type: 'status', label: 'CLK, {CLK_}, CLR, {CLR_} to the registers', labelAt: [590, 510] },
      { pts: [[170, 165], [110, 165], [110, 530], [170, 530]], type: 'status', label: '{HLT_}', labelAt: [102, 352], anchor: 'end' },
    ],
  },
  children: { clock },
};

const a = (() => {
  const reg = registerPair({
    y: 70, load: 'La', act: ['La'],
    chips: [['C11', 'Holds four of the accumulator\'s bits.'], ['C10', 'Holds the other four bits.']],
    value: (s) => `A = ${bin(s.a)}`,
  });
  return {
    title: 'Accumulator',
    part: 'C10–C13',
    about: [
      'Two 74LS173 4-bit registers (C10, C11) hold the 8-bit accumulator. Their output-control pins are grounded, so they feed the adder-subtracter all the time.',
      'Two 74LS126 three-state buffers (C12, C13) put the accumulator on the W bus only when {Ea} is high.',
    ],
    diagram: {
      groups: [
        reg.group,
        { x: 200, y: 340, w: 420, h: 150, label: 'three-state buffers', act: ['Ea'],
          value: (s, d) => (d.sig.has('Ea') ? 'driving the bus' : 'Hi-Z') },
      ],
      blocks: [
        ...reg.blocks,
        { id: 'c13', x: 220, y: 372, w: 185, h: 100, tag: 'C13', title: '74LS126', sub: 'three-state buffer', act: ['Ea'], about: P.ls126 },
        { id: 'c12', x: 415, y: 372, w: 185, h: 100, tag: 'C12', title: '74LS126', sub: 'three-state buffer', act: ['Ea'], about: P.ls126 },
      ],
      wires: [
        { pts: [[30, 145], [200, 145]], bits: 8, on: 'La', label: 'from W bus', labelAt: [115, 135] },
        { pts: [[620, 145], [790, 145]], bits: 8, label: 'to adder-subtracter', labelAt: [705, 135] },
        { pts: [[410, 220], [410, 340]], bits: 8 },
        { pts: [[620, 415], [790, 415]], bits: 8, on: 'Ea', label: 'to W bus', labelAt: [705, 405] },
      ],
      pins: [...reg.pins, { sig: 'Ea', at: [200, 415], dir: 'left', len: 40 }],
    },
  };
})();

const alu = {
  title: 'Adder-subtracter',
  part: 'C14–C19',
  about: [
    'Two 74LS86 XOR chips (C14, C15) act as a controlled inverter on B. With {Su} low, B passes straight through. With {Su} high, B is inverted (1\'s complement) and a 1 is added at the carry-in, giving the 2\'s complement, so the adders subtract.',
    'Two 74LS83 4-bit full adders (C16, C17) make the 8-bit sum or difference. The circuit is unclocked: the result changes as soon as A or B does. Two 74LS126 buffers (C18, C19) put it on the W bus when {Eu} is high.',
  ],
  diagram: {
    groups: [
      { x: 200, y: 40, w: 420, h: 140, label: 'controlled inverter', act: ['Su'],
        value: (s, d) => `${d.su ? 'not B' : 'B'} = ${bin(d.bIn)}` },
      { x: 200, y: 240, w: 420, h: 140, label: '8-bit adder',
        value: (s, d) => `${d.su ? 'A − B' : 'A + B'} = ${bin(d.alu)}` },
      { x: 200, y: 440, w: 420, h: 130, label: 'three-state buffers', act: ['Eu'],
        value: (s, d) => (d.sig.has('Eu') ? 'driving the bus' : 'Hi-Z') },
    ],
    blocks: [
      { id: 'c15', x: 220, y: 70, w: 185, h: 92, tag: 'C15', title: '74LS86', sub: 'quad XOR', act: ['Su'], about: `Four XOR gates. Each one passes a bit of B, or inverts it when {Su} is high. ${P.ls86}` },
      { id: 'c14', x: 415, y: 70, w: 185, h: 92, tag: 'C14', title: '74LS86', sub: 'quad XOR', act: ['Su'], about: `Four XOR gates. Each one passes a bit of B, or inverts it when {Su} is high. ${P.ls86}` },
      { id: 'c17', x: 220, y: 270, w: 185, h: 92, tag: 'C17', title: '74LS83', sub: '4-bit full adder', about: `Adds four bits of A to four bits from the XOR gates. ${P.ls83}` },
      { id: 'c16', x: 415, y: 270, w: 185, h: 92, tag: 'C16', title: '74LS83', sub: '4-bit full adder', about: `Adds the other four bits; the two adders are chained through their carries. ${P.ls83}` },
      { id: 'c19', x: 220, y: 468, w: 185, h: 85, tag: 'C19', title: '74LS126', sub: 'three-state buffer', act: ['Eu'], about: P.ls126 },
      { id: 'c18', x: 415, y: 468, w: 185, h: 85, tag: 'C18', title: '74LS126', sub: 'three-state buffer', act: ['Eu'], about: P.ls126 },
    ],
    wires: [
      { pts: [[30, 125], [200, 125]], bits: 8, label: 'from B register', labelAt: [115, 115] },
      { pts: [[410, 180], [410, 240]], bits: 8 },
      { pts: [[30, 325], [200, 325]], bits: 8, label: 'from accumulator', labelAt: [115, 315] },
      { pts: [[410, 380], [410, 440]], bits: 8 },
      { pts: [[620, 510], [790, 510]], bits: 8, on: 'Eu', label: 'to W bus', labelAt: [705, 500] },
    ],
    pins: [
      { sig: 'Su', at: [200, 75], dir: 'left', len: 40 },
      { sig: 'Su', at: [620, 285], dir: 'right', len: 36 },
      { sig: 'Eu', at: [200, 510], dir: 'left', len: 40 },
    ],
    notes: [{ text: 'carry in', at: [668, 302], anchor: 'start' }],
  },
};

const b = (() => {
  const reg = registerPair({
    y: 160, load: 'Lb', act: ['Lb'],
    chips: [['C21', 'Holds four of B\'s bits.'], ['C20', 'Holds the other four bits.']],
    value: (s) => `B = ${bin(s.b)}`,
  });
  return {
    title: 'B register',
    part: 'C20, C21',
    about: [
      'Two 74LS173 4-bit registers. A low {Lb} and a rising clock edge load the W bus into B.',
      'Their output-control pins are grounded, so B always feeds the adder-subtracter and never drives the bus.',
    ],
    diagram: {
      groups: [reg.group],
      blocks: reg.blocks,
      wires: [
        { pts: [[30, 235], [200, 235]], bits: 8, on: 'Lb', label: 'from W bus', labelAt: [115, 225] },
        { pts: [[620, 235], [790, 235]], bits: 8, label: 'to adder-subtracter', labelAt: [705, 225] },
      ],
      pins: reg.pins,
    },
  };
})();

const out = (() => {
  const reg = registerPair({
    y: 110, load: 'Lo', act: ['Lo'],
    chips: [['C23', 'Holds four of the output bits.'], ['C22', 'Holds the other four bits.']],
    value: (s) => `OUT = ${bin(s.out)}`,
  });
  return {
    title: 'Output register',
    part: 'C22, C23',
    about: [
      'The output port: two 74LS173 4-bit registers. During OUT, {Ea} puts the accumulator on the bus and a low {Lo} loads it here on the next rising clock edge.',
      'Its outputs drive the binary display, so the answer stays visible after the computer halts.',
    ],
    diagram: {
      groups: [reg.group],
      blocks: [
        ...reg.blocks,
        { id: 'leds', kind: 'display', x: 250, y: 400, w: 320, h: 90, title: 'Binary display',
          about: 'Eight LEDs, each driven through a 1 kΩ resistor by one flip-flop of the output register.' },
      ],
      wires: [
        { pts: [[30, 185], [200, 185]], bits: 8, on: 'Lo', label: 'from W bus', labelAt: [115, 175] },
        { pts: [[410, 260], [410, 400]], bits: 8, type: 'output' },
      ],
      pins: reg.pins,
    },
  };
})();

// --- level 1: Fig. 10-1 --------------------------------------------------------------------

export const ROOT = {
  title: 'SAP-1',
  part: 'Overview',
  about: [
    'The first Simple-As-Possible computer from Malvino & Brown\'s Digital Computer Electronics (chapter 10). It is an 8-bit machine with 16 bytes of RAM and five instructions, and every register talks over one shared W bus.',
    'Every instruction takes six T states. T1–T3 fetch it from memory and T4–T6 execute it. On each T state the controller sends out a 12-bit control word (CON) that says which register drives the bus and which one loads from it.',
  ],
  diagram: {
    blocks: [
      { id: 'pc', x: 110, y: 40, w: 210, h: 66, title: 'Program counter', value: (s) => bin(s.pc, 4), act: ['Ep', 'Cp'],
        about: 'Counts from 0000 to 1111 and holds the address of the next instruction. In T1 ({Ep}) it puts that address on the bus; in T2 ({Cp}) it counts up by one.' },
      { id: 'mar', x: 110, y: 136, w: 210, h: 66, title: 'Input and MAR', value: (s) => bin(s.mar, 4), act: ['Lm'],
        about: 'The memory address register latches an address from the bus when {Lm} is low and passes it to the RAM. The input switches let you program the memory by hand.' },
      { id: 'ram', x: 110, y: 232, w: 210, h: 66, title: '16 × 8 RAM', value: (s) => `[${hex(ramAddr(s), 1)}H] ${bin(s.ram[ramAddr(s)])}`, act: ['CE'],
        about: 'Sixteen 8-bit words of static RAM. During a run, a low {CE} puts the word at the MAR\'s address on the bus.' },
      { id: 'ir', x: 110, y: 328, w: 210, h: 66, title: 'Instruction register', value: (s) => `${bin(s.ir)}  ${decodeWord(s.ir) ?? 'NOP'}`, act: ['Li', 'Ei'],
        about: 'Holds the current instruction. The upper nibble (op code) goes to the controller; the lower nibble (address) goes back on the bus when {Ei} is low.' },
      { id: 'ctrl', x: 110, y: 440, w: 210, h: 80, title: 'Controller-sequencer',
        value: (s, d) => (s.prog ? 'PROG · clock stopped' : s.halted ? 'halted' : `T${s.t} · ${s.t <= 3 ? 'fetch' : d.op}`),
        about: 'The control unit. A ring counter steps through T1–T6, the op code is decoded, and a control matrix combines the two into the 12-bit control word.' },
      { id: 'a', x: 500, y: 40, w: 210, h: 66, title: 'Accumulator', value: (s) => bin(s.a), act: ['La', 'Ea'],
        about: 'Holds intermediate answers. Loads from the bus when {La} is low, feeds the adder-subtracter all the time, and drives the bus when {Ea} is high.' },
      { id: 'alu', x: 500, y: 136, w: 210, h: 66, title: 'Adder-subtracter',
        value: (s, d) => `${d.su ? 'A−B' : 'A+B'} ${bin(d.alu)}`, act: ['Su', 'Eu'],
        about: 'Adds B to A, or subtracts it using 2\'s complement when {Su} is high. It is unclocked, so the output follows A and B. {Eu} puts the result on the bus.' },
      { id: 'b', x: 500, y: 232, w: 210, h: 66, title: 'B register', value: (s) => bin(s.b), act: ['Lb'],
        about: 'Holds the number to add to or subtract from the accumulator. Loads from the bus when {Lb} is low.' },
      { id: 'out', x: 500, y: 328, w: 210, h: 66, title: 'Output register', value: (s) => bin(s.out), act: ['Lo'],
        about: 'The output port. During OUT the accumulator goes on the bus and a low {Lo} loads it here.' },
      { id: 'display', kind: 'display', x: 500, y: 440, w: 210, h: 80, title: 'Binary display',
        about: 'Eight LEDs, one for each bit of the output register: the answer, in binary.' },
      { id: 'bus', kind: 'bus', x: 396, y: 24, w: 28, h: 386, title: 'W bus',
        about: 'The 8-bit W bus. Every register output that touches it is three-state, so only one register drives it at a time.' },
      { id: 'con', kind: 'con', x: 110, y: 548, w: 600, h: 34, title: 'Control word',
        about: 'CON, the 12 control bits. A highlighted bit is active this T state. Bits with a bar are active low, so the idle word is 3E3H, not 000H.' },
    ],
    wires: [
      { pts: [[320, 73], [396, 73]], bits: 4, on: 'Ep' },
      { pts: [[396, 169], [320, 169]], bits: 4, on: 'Lm' },
      { pts: [[215, 202], [215, 232]], bits: 4, on: 'CE' },
      { pts: [[320, 265], [396, 265]], bits: 8, on: 'CE' },
      { pts: [[396, 348], [320, 348]], bits: 8, on: 'Li' },
      { pts: [[320, 376], [396, 376]], bits: 4, on: 'Ei' },
      { pts: [[215, 394], [215, 440]], bits: 4, type: 'data' },
      { pts: [[424, 60], [500, 60]], bits: 8, on: 'La' },
      { pts: [[500, 88], [424, 88]], bits: 8, on: 'Ea' },
      { pts: [[605, 106], [605, 136]], bits: 8 },
      { pts: [[500, 169], [424, 169]], bits: 8, on: 'Eu' },
      { pts: [[605, 232], [605, 202]], bits: 8 },
      { pts: [[424, 265], [500, 265]], bits: 8, on: 'Lb' },
      { pts: [[424, 361], [500, 361]], bits: 8, on: 'Lo' },
      { pts: [[605, 394], [605, 440]], bits: 8, type: 'output' },
      { pts: [[215, 520], [215, 548]], bits: 12 },
    ],
    pins: [
      { sig: 'Cp', at: [110, 58], dir: 'left' },
      { sig: 'Ep', at: [110, 88], dir: 'left' },
      { sig: 'Lm', at: [110, 169], dir: 'left' },
      { sig: 'CE', at: [110, 265], dir: 'left' },
      { sig: 'Li', at: [110, 348], dir: 'left' },
      { sig: 'Ei', at: [110, 376], dir: 'left' },
      { sig: 'La', at: [710, 60], dir: 'right' },
      { sig: 'Ea', at: [710, 88], dir: 'right' },
      { sig: 'Su', at: [710, 158], dir: 'right' },
      { sig: 'Eu', at: [710, 182], dir: 'right' },
      { sig: 'Lb', at: [710, 265], dir: 'right' },
      { sig: 'Lo', at: [710, 361], dir: 'right' },
    ],
  },
  children: { pc, mar, ram, ir, ctrl, a, alu, b, out },
};

// --- level 1 on a phone: the same diagram stood upright --------------------------------------
// A narrow frame draws the textbook overview from this instead (see Sap1Visualizer.jsx): the same
// two columns either side of the W bus, but with narrower blocks on a tall canvas, the control
// pins on top of the blocks and CON in two rows. The blocks keep their ids, titles, notes and
// signals from ROOT. Extra fields:
//   canvas            this diagram's own size (others use CANVAS)
//   minFont           no text is drawn smaller than this, so it stays readable at phone width
//   block.label       the title as drawn, one line per entry (the info panel still shows title)
//   block.value(...)  may return an array: one line per entry
//   con block.rows    the control word in this many rows

const ROOT_BLOCKS = Object.fromEntries(ROOT.diagram.blocks.map((b) => [b.id, b]));
const TALL_AT = {
  pc: { x: 8, y: 76, w: 150, h: 88 },
  mar: { x: 8, y: 212, w: 150, h: 88 },
  ram: { x: 8, y: 348, w: 150, h: 96, value: (s) => [`[${hex(ramAddr(s), 1)}H]`, bin(s.ram[ramAddr(s)])] },
  ir: { x: 8, y: 492, w: 150, h: 104, label: ['Instruction', 'register'], value: (s) => [bin(s.ir), decodeWord(s.ir) ?? 'NOP'] },
  ctrl: { x: 8, y: 644, w: 150, h: 104, label: ['Controller-', 'sequencer'],
    value: (s, d) => (s.prog ? ['PROG', 'clock stopped'] : ROOT_BLOCKS.ctrl.value(s, d)) },
  a: { x: 242, y: 76, w: 150, h: 88 },
  alu: { x: 242, y: 212, w: 150, h: 88 },
  b: { x: 242, y: 348, w: 150, h: 96 },
  out: { x: 242, y: 492, w: 150, h: 104 },
  display: { x: 242, y: 644, w: 150, h: 104 },
  bus: { x: 188, y: 36, w: 24, h: 560 },
  con: { x: 48, y: 800, w: 304, h: 76, rows: 2 },
};

export const ROOT_TALL = {
  canvas: { w: 400, h: 900 },
  minFont: 13.5,
  blocks: ROOT.diagram.blocks.map((b) => ({ ...b, ...TALL_AT[b.id] })),
  wires: [
    { pts: [[158, 120], [188, 120]], bits: 4, on: 'Ep' },
    { pts: [[188, 256], [158, 256]], bits: 4, on: 'Lm' },
    { pts: [[98, 300], [98, 348]], bits: 4, on: 'CE' },
    { pts: [[158, 396], [188, 396]], bits: 8, on: 'CE' },
    { pts: [[188, 520], [158, 520]], bits: 8, on: 'Li' },
    { pts: [[158, 568], [188, 568]], bits: 4, on: 'Ei' },
    { pts: [[98, 596], [98, 644]], bits: 4, type: 'data' },
    { pts: [[212, 104], [242, 104]], bits: 8, on: 'La' },
    { pts: [[242, 136], [212, 136]], bits: 8, on: 'Ea' },
    { pts: [[302, 164], [302, 212]], bits: 8 },
    { pts: [[242, 256], [212, 256]], bits: 8, on: 'Eu' },
    { pts: [[302, 348], [302, 300]], bits: 8 },
    { pts: [[212, 396], [242, 396]], bits: 8, on: 'Lb' },
    { pts: [[212, 544], [242, 544]], bits: 8, on: 'Lo' },
    { pts: [[302, 596], [302, 644]], bits: 8, type: 'output' },
    { pts: [[98, 748], [98, 800]], bits: 12 },
  ],
  pins: [
    { sig: 'Cp', at: [28, 76], dir: 'up', len: 14 },
    { sig: 'Ep', at: [58, 76], dir: 'up', len: 14 },
    { sig: 'Lm', at: [28, 212], dir: 'up', len: 14 },
    { sig: 'CE', at: [28, 348], dir: 'up', len: 14 },
    { sig: 'Li', at: [28, 492], dir: 'up', len: 14 },
    { sig: 'Ei', at: [58, 492], dir: 'up', len: 14 },
    { sig: 'La', at: [342, 76], dir: 'up', len: 14 },
    { sig: 'Ea', at: [372, 76], dir: 'up', len: 14 },
    { sig: 'Su', at: [342, 212], dir: 'up', len: 14 },
    { sig: 'Eu', at: [372, 212], dir: 'up', len: 14 },
    { sig: 'Lb', at: [372, 348], dir: 'up', len: 14 },
    { sig: 'Lo', at: [372, 492], dir: 'up', len: 14 },
  ],
};

// The instruction an 8-bit word stands for ('LDA 9H', 'OUT', ...), or null if its op code isn't
// one of the five SAP-1 instructions.
export function decodeWord(w) {
  const op = OPS[(w >> 4) & 15];
  if (!op) return null;
  return op === 'OUT' || op === 'HLT' ? op : `${op} ${hex(w & 15, 1)}H`;
}

export function nodeAt(path) {
  let node = ROOT;
  for (const id of path) node = node?.children?.[id];
  return node;
}

export function cleanPath(ids) {
  const out = [];
  let node = ROOT;
  for (const id of ids) {
    if (!node.children?.[id]) break;
    node = node.children[id];
    out.push(id);
  }
  return out;
}
