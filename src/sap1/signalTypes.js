// What kind of information a signal, wire, pin or block carries. The palette gives each kind a lit
// color (theme.js type[t]), the same red for all of them at present:
//   address  the program counter, MAR and every 4-bit address path
//   data     the RAM, IR, accumulator, B, adder-subtracter and every 8-bit path
//   control  the 12 CON bits, CLR / CLR̄ and WE̅: signals that tell a part to act
//   status   the clock (CLK, CLK̄), HLT̄ and the T states: timing and machine state
//   output   the output register's display
//
// signalType(x, { d, path }) takes
//   - a signal name: 'Ep', 'CLK_', 'T3', ...
//   - a wire or pin from sap1Parts.js: an explicit `type` wins; otherwise a pin goes by its signal,
//     and a wire by its width (2 or 4 bits: address, 6: status (T1–T6), 8: data, 12: control) or,
//     with no width, by the signal that lights it (none: control)
//   - a block or group: the W bus by what it carries now (needs d), the IR is address while it
//     drives its address field onto the bus (Ei), any other block by BLOCK_TYPES. Blocks inside an
//     opened part take that part's type (pass path, e.g. ['pc'])
// d is derive(sim); path is the diagram path ([] for the overview).

export const SIGNAL_TYPES = ['address', 'data', 'control', 'status', 'output'];

const STATUS = new Set(['CLK', 'CLK_', 'HLT', 'HLT_', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6']);

const BITS = { 2: 'address', 4: 'address', 6: 'status', 8: 'data', 12: 'control' };

// By block id: the overview's parts, plus a few inner blocks whose type differs from their part's.
export const BLOCK_TYPES = {
  pc: 'address', mar: 'address', ram: 'data', ir: 'data', ctrl: 'control',
  a: 'data', alu: 'data', b: 'data', out: 'output', display: 'output', con: 'control',
  ring: 'status', clock: 'status',
};

function blockType(b, d, path) {
  if (b.kind === 'bus') return d?.busBits === 4 ? 'address' : 'data';
  if (b.kind === 'con') return 'control';
  if (b.kind === 'display') return 'output';
  const part = BLOCK_TYPES[b.id] ? b.id : [...path].reverse().find((id) => BLOCK_TYPES[id]);
  if (part === 'ir' && d?.sig.has('Ei')) return 'address';
  return BLOCK_TYPES[part] ?? 'control';
}

export function signalType(x, { d, path = [] } = {}) {
  if (typeof x === 'string') return STATUS.has(x) ? 'status' : 'control';
  if (x.type) return x.type;
  if (x.sig) return signalType(x.sig);
  if (x.pts) return x.bits ? BITS[x.bits] ?? 'data' : x.on ? signalType(x.on) : 'control';
  return blockType(x, d, path);
}
