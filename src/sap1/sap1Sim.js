// SAP-1 simulator, following Malvino & Brown, Digital Computer Electronics, ch. 10.
// The state shown is "during" a T state: the control word is active and the bus is driven.
// step() applies the positive clock edge (registers load) and moves to the next T state.

// Control word bit order, MSB first: CON = Cp Ep L̄m C̄E  L̄i Ēi L̄a Ea  Su Eu L̄b L̄o
export const CON_ORDER = ['Cp', 'Ep', 'Lm', 'CE', 'Li', 'Ei', 'La', 'Ea', 'Su', 'Eu', 'Lb', 'Lo'];
const ACTIVE_LOW = new Set(['Lm', 'CE', 'Li', 'Ei', 'La', 'Lb', 'Lo']);

// How each signal name is drawn: base letters, subscript, and whether it has a bar (active low).
export const SIG = {
  Cp: { base: 'C', sub: 'P' },
  Ep: { base: 'E', sub: 'P' },
  Lm: { base: 'L', sub: 'M', bar: true },
  CE: { base: 'CE', bar: true },
  Li: { base: 'L', sub: 'I', bar: true },
  Ei: { base: 'E', sub: 'I', bar: true },
  La: { base: 'L', sub: 'A', bar: true },
  Ea: { base: 'E', sub: 'A' },
  Su: { base: 'S', sub: 'U' },
  Eu: { base: 'E', sub: 'U' },
  Lb: { base: 'L', sub: 'B', bar: true },
  Lo: { base: 'L', sub: 'O', bar: true },
  CLK: { base: 'CLK' },
  CLK_: { base: 'CLK', bar: true },
  CLR: { base: 'CLR' },
  CLR_: { base: 'CLR', bar: true },
  HLT_: { base: 'HLT', bar: true },
  WE: { base: 'WE', bar: true },
};

export const OPS = { 0x0: 'LDA', 0x1: 'ADD', 0x2: 'SUB', 0xe: 'OUT', 0xf: 'HLT' };

// Example 10-1: LDA 9H, ADD AH, ADD BH, SUB CH, OUT, HLT  →  1 + 2 + 3 − 4 = 2
export const PROGRAM = [
  0x09, 0x1a, 0x1b, 0x2c, 0xe0, 0xf0, 0xff, 0xff,
  0xff, 0x01, 0x02, 0x03, 0x04, 0xff, 0xff, 0xff,
];

// Microprogram (Table 10-5). Fetch is the same for every instruction.
const FETCH = [['Ep', 'Lm'], ['Cp'], ['CE', 'Li']];
const EXEC = {
  LDA: [['Lm', 'Ei'], ['CE', 'La'], []],
  ADD: [['Lm', 'Ei'], ['CE', 'Lb'], ['La', 'Eu']],
  SUB: [['Lm', 'Ei'], ['CE', 'Lb'], ['La', 'Su', 'Eu']],
  OUT: [['Ea', 'Lo'], [], []],
};

const FETCH_TEXT = [
  'Address state: the program counter puts its address on the bus and the MAR loads it.',
  'Increment state: the program counter counts up by one.',
  'Memory state: the addressed RAM word goes into the instruction register.',
];
const EXEC_TEXT = {
  LDA: ['The address field of the instruction goes to the MAR.', 'The addressed RAM word is loaded into the accumulator.', 'No operation.'],
  ADD: ['The address field of the instruction goes to the MAR.', 'The addressed RAM word is loaded into B.', 'The adder-subtracter output, A + B, is loaded into the accumulator.'],
  SUB: ['The address field of the instruction goes to the MAR.', 'The addressed RAM word is loaded into B.', 'The adder-subtracter output, A − B, is loaded into the accumulator.'],
  OUT: ['The accumulator is copied into the output register.', 'No operation.', 'No operation.'],
};

export const bin = (v, n = 8) => {
  const s = (v >>> 0).toString(2).padStart(n, '0').slice(-n);
  return n > 4 ? s.replace(/(.{4})(?=.)/g, '$1 ') : s;
};
export const hex = (v, n = 2) => (v >>> 0).toString(16).toUpperCase().padStart(n, '0');

// prog: the RUN/PROG switch S2 (false = RUN, true = PROG). addrSw: address switches S1 (4 bits).
// dataSw: data switches S3 (8 bits). cycles: T states elapsed. instructions: instructions completed.
// clears / writes: how many times CLEAR and WRITE have been pressed (never reset), so the guided
// tour can tell a press happened even when it changed nothing else.
export function initialState() {
  return {
    pc: 0, mar: 0, ir: 0, a: 0, b: 0, out: 0, ram: [...PROGRAM], t: 1, halted: false,
    prog: false, addrSw: 0, dataSw: 0, cycles: 0, instructions: 0, clears: 0, writes: 0,
  };
}

// The front-panel switches (S1–S5 on the SAP-1 schematic in the book). Each helper returns a new
// state and never mutates the one passed in.

// S2, RUN/PROG: drives the select input of the 74LS157 (C5) that picks the RAM address.
export const setProg = (s, on) => ({ ...s, prog: !!on });

// The RAM address: the address switches S1 in PROG, the MAR in RUN (what C5 passes through).
export const ramAddr = (s) => (s.prog ? s.addrSw & 0xf : s.mar);

// S1, address switches. Bit i: 0 = LSB (A0) … 3 = MSB (A3).
export const toggleAddrBit = (s, i) => ({ ...s, addrSw: (s.addrSw ^ (1 << i)) & 0xf });

// S3, data switches. Bit i: 0 = LSB (D0) … 7 = MSB (D7).
export const toggleDataBit = (s, i) => ({ ...s, dataSw: (s.dataSw ^ (1 << i)) & 0xff });

// S4, WRITE: pressing it takes WE̅ low, storing the data switches at the switch address.
// Only has an effect in PROG.
export function write(s) {
  if (!s.prog) return s;
  const ram = [...s.ram];
  ram[s.addrSw & 0xf] = s.dataSw & 0xff;
  return { ...s, ram, writes: (s.writes ?? 0) + 1 };
}

// S5, CLEAR/START: CLR resets the instruction register, CLR̅ resets the program counter and the
// ring counter (back to T1) and restarts the clock. RAM, A, B, OUT, MAR and the switches keep
// their contents. The counters start again from zero (except `clears`, which counts the presses).
export const clear = (s) => ({
  ...s, pc: 0, ir: 0, t: 1, halted: false, cycles: 0, instructions: 0, clears: (s.clears ?? 0) + 1,
});

// Put Example 10-1 back into the RAM.
export const loadExample = (s) => ({ ...s, ram: [...PROGRAM] });

export const opName = (ir) => OPS[ir >> 4] ?? 'NOP';

export function signals(s) {
  // In PROG the clock isn't running, so the controller sends nothing.
  if (s.prog || s.halted) return new Set();
  if (s.t <= 3) return new Set(FETCH[s.t - 1]);
  return new Set(EXEC[opName(s.ir)]?.[s.t - 4] ?? []);
}

export function conWord(sig) {
  let v = 0;
  for (const k of CON_ORDER) {
    const on = sig.has(k);
    v = (v << 1) | ((ACTIVE_LOW.has(k) ? !on : on) ? 1 : 0);
  }
  return v;
}

// Everything that follows combinationally from the registers during this T state.
export function derive(s) {
  const sig = signals(s);
  const su = sig.has('Su');
  const bIn = su ? ~s.b & 0xff : s.b; // XOR gates: B or its 1's complement
  const alu = (s.a + bIn + (su ? 1 : 0)) & 0xff;
  const addr = ramAddr(s);
  let bus = null;
  let busBits = 8;
  if (sig.has('Ep')) { bus = s.pc; busBits = 4; }
  else if (sig.has('CE')) bus = s.ram[addr];
  else if (sig.has('Ei')) { bus = s.ir & 0xf; busBits = 4; }
  else if (sig.has('Ea')) bus = s.a;
  else if (sig.has('Eu')) bus = alu;
  return { sig, con: conWord(sig), su, bIn, alu, bus, busBits, op: opName(s.ir), ramAddr: addr };
}

export function describe(s) {
  if (s.prog) return `PROG: the address switches (S1) select RAM word ${hex(s.addrSw & 0xf, 1)}H. Set the data switches (S3) and press WRITE (S4) to store them there.`;
  if (s.halted) return 'HLT is in the instruction register, so the clock has stopped. Press Clear to run again.';
  if (s.t <= 3) return FETCH_TEXT[s.t - 1];
  return EXEC_TEXT[opName(s.ir)]?.[s.t - 4] ?? 'No operation.';
}

// One clock pulse. Does nothing in PROG (the clock isn't running) or after HLT.
export function step(s) {
  if (s.prog || s.halted) return s;
  const { sig, bus } = derive(s);
  const n = { ...s, cycles: s.cycles + 1 };
  if (sig.has('Lm')) n.mar = bus & 0xf;
  if (sig.has('Li')) n.ir = bus;
  if (sig.has('La')) n.a = bus;
  if (sig.has('Lb')) n.b = bus;
  if (sig.has('Lo')) n.out = bus;
  if (sig.has('Cp')) n.pc = (s.pc + 1) & 0xf;
  // HLT: once the op code 1111 reaches the instruction register, HLT̄ goes low and stops the clock.
  if (s.t === 3 && n.ir >> 4 === 0xf) return { ...n, t: 4, halted: true, instructions: s.instructions + 1 };
  if (s.t === 6) { n.t = 1; n.instructions = s.instructions + 1; }
  else n.t = s.t + 1;
  return n;
}
