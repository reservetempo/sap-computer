// The guided tour of the Game-mode front panel: from power-on to CLEAR, writing a program in PROG,
// the fetch and execute T states, and the answer in the output register.
//
// Each step:
//   id, title     the mission's key and its name in the mission list
//   body          what happens in the machine (string, or (sim, d) => string). {Ep}-style names
//                 are drawn as signal names (see sigText.jsx)
//   task          what to do now
//   doneBody      shown instead of body once the step is complete (manual steps only)
//   highlight     ids GamePanel outlines while the step is current; doneHighlight replaces them
//                 once it is complete
//   check         (sim, d, snap) => true when the step is complete. snap is the simulator state
//                 when the step started, so presses that change nothing else show up in the
//                 clears / writes counters
//   manual        stays on screen when complete until Next is pressed (nextLabel names the button)
//   readOnly      nothing to do but read: the task line stays up instead of "Mission complete"
//   hint          (sim, d, snap) => a nudge when the machine isn't where the step expects, or null
//   checklist     (sim, d, snap) => [{ label, ok }]: live sub-goals
//   watch         (sim, d) => a one-line readout of the value the step is about
//   at            for the single-step missions: T states since CLEAR the step expects to start at

import { bin, opName } from "./sap1Sim";

export const TOUR_KEY = "sap1-tour"; // localStorage: { seen, open, step, finished }

// The clock only runs in RUN and before HLT.
const clockHint = (s) => {
  if (s.prog) return "The RUN/PROG switch is on PROG, so the clock is stopped. Flip it back to RUN.";
  if (s.halted)
    return "The machine has halted. Press LOAD EXAMPLE (or CLEAR) to start the program again from address 0000.";
  return null;
};

// For the single-step missions: behind where the step expects (after a CLEAR, say).
const stepHint = (s, step) =>
  clockHint(s) ??
  (s.cycles < step.at ? `The ring counter is at T${s.t}. Press SINGLE STEP to catch up.` : null);

export const STEPS = [
  {
    id: "power",
    title: "Power on",
    body:
      "This is SAP-1's front panel, the way a 1970s minicomputer looked. The lamp rows across the top show what each register holds: the program counter (PC), the memory address register (MAR), the RAM, the instruction register (IR), the accumulator (A), B and the output. The switch strip along the bottom is how you talk to the machine. Each lamp's color says what kind of signal it carries.",
    task: "Read the color key, then press Next.",
    legend: true,
    highlight: ["pc", "ir", "con", "ring"],
    check: () => true,
    manual: true,
    readOnly: true,
  },
  {
    id: "clear",
    title: "Press CLEAR",
    body:
      "Before anything runs, the machine has to be put in a known state. CLEAR/START sends {CLR} and {CLR_}: the program counter goes to 0000, the instruction register is emptied, and the ring counter goes back to T1, the first T state. The RAM keeps its contents.",
    task: "Press CLEAR/START (S5) on the panel, or Clear in the toolbar.",
    highlight: ["btn-clear", "pc", "ring"],
    check: (s, d, snap) => s.clears > snap.clears,
  },
  {
    id: "prog",
    title: "Switch to PROG",
    body:
      "To put a program in memory, the RAM has to listen to you instead of the MAR. RUN/PROG (S2) drives a multiplexer that picks the RAM address: in PROG it comes from the address switches, and the clock stops.",
    task: "Flip RUN/PROG to PROG.",
    highlight: ["sw-prog"],
    check: (s) => s.prog,
  },
  {
    id: "write",
    title: "Write an instruction",
    body:
      "A RAM word is 8 bits: the upper four are the op code, the lower four an address. 0000 1001 is LDA 9H, load the accumulator with the word at address 9H. Programs start at address 0000. Set the address switches to 0000 and the data switches to 0000 1001, then press WRITE: {WE} goes low for a moment and the word is stored.",
    task: "Address 0000, data 0000 1001, then WRITE (S4).",
    doneBody:
      "Stored: RAM word 0H is 0000 1001, LDA 9H. The rest of the program is five more instructions (ADD AH, ADD BH, SUB CH, OUT, HLT) and the data 1, 2, 3, 4 at 9H–CH. You can toggle those in yourself, or let me do it.",
    highlight: ["sw-addr", "sw-data", "btn-write", "ram"],
    doneHighlight: ["ram"],
    check: (s, d, snap) => s.writes > snap.writes && s.ram[0] === 0x09 && (s.addrSw & 0xf) === 0 && s.dataSw === 0x09,
    checklist: (s, d, snap) => [
      { label: "PROG", ok: s.prog },
      { label: "Address 0000", ok: (s.addrSw & 0xf) === 0 },
      { label: "Data 0000 1001", ok: s.dataSw === 0x09 },
      { label: "WRITE", ok: s.writes > snap.writes && s.ram[0] === 0x09 },
    ],
    hint: (s, d, snap) => {
      if (!s.prog) return "WRITE only works in PROG. Flip RUN/PROG back to PROG.";
      if (s.writes > snap.writes && s.ram[0] !== 0x09)
        return `RAM word 0H now holds ${bin(s.ram[0])}. Set the data switches to 0000 1001 and press WRITE again.`;
      return null;
    },
    manual: true,
    offer: "Load the rest of the example for me",
  },
  {
    id: "run",
    title: "Back to RUN",
    body:
      "The program is in. Flip RUN/PROG back to RUN: the RAM address comes from the MAR again, and the clock can tick.",
    task: "Flip RUN/PROG to RUN.",
    highlight: ["sw-prog"],
    check: (s) => !s.prog,
  },
  {
    id: "t1",
    title: "T1: address state",
    body:
      "Press CLEAR so the program starts at address 0000, and look before you step. The ring counter is at T1 and the controller raises {Ep} and {Lm}: the program counter drives its address onto the W bus, and the MAR is set to load it. SINGLE STEP gives one clock pulse: on its rising edge the MAR takes the address and the ring counter moves on to T2.",
    task: "Press CLEAR, then SINGLE STEP once.",
    highlight: ["btn-clear", "btn-step", "pc", "bus", "mar", "ring"],
    check: (s, d, snap) => !s.prog && s.cycles >= 1 && (s.clears > snap.clears || snap.cycles === 0),
    hint: (s, d, snap) =>
      clockHint(s) ??
      (snap.cycles > 0 && s.clears === snap.clears ? "Press CLEAR first, so the program starts at address 0000." : null),
    watch: (s) => `PC ${bin(s.pc, 4)} · MAR ${bin(s.mar, 4)}`,
  },
  {
    id: "t2",
    title: "T2: PC counts up",
    body:
      "T2, the increment state. Only {Cp} is high and nothing drives the bus. On the next edge the program counter counts up, from 0000 to 0001, so it already points at the next instruction.",
    task: "Press SINGLE STEP.",
    highlight: ["btn-step", "pc", "ring"],
    at: 1,
    check: (s) => !s.prog && s.cycles >= 2,
    hint(s) {
      return stepHint(s, this);
    },
    watch: (s) => `PC ${bin(s.pc, 4)}`,
  },
  {
    id: "t3",
    title: "T3: fetch into IR",
    body:
      "T3, the memory state. {CE} goes low, so the RAM puts the word the MAR points at on the bus, and {Li} tells the instruction register to load it. After this edge the IR holds LDA 9H: the op code 0000 for the controller, the address 1001 for later. That ends the fetch cycle, the same three states for every instruction.",
    task: "Press SINGLE STEP.",
    highlight: ["btn-step", "ram", "bus", "ir", "ring"],
    at: 2,
    check: (s) => !s.prog && s.cycles >= 3,
    hint(s) {
      return stepHint(s, this);
    },
    watch: (s) => `IR ${bin(s.ir)} (${opName(s.ir)})`,
  },
  {
    id: "exec",
    title: "T4–T6: LDA runs",
    body:
      "Now the controller decodes the op code and runs LDA. T4: {Ei} puts the IR's address field (1001) on the bus and {Lm} loads it into the MAR. T5: {CE} puts RAM word 9H on the bus and {La} loads it into the accumulator. T6: nothing, LDA only needs two states. Watch A light up with 0000 0001.",
    task: "Press SINGLE STEP three times: T4, T5, T6.",
    highlight: ["btn-step", "ir", "ctrl", "mar", "ram", "a", "ring"],
    at: 3,
    check: (s) => !s.prog && s.cycles >= 6,
    hint(s) {
      return stepHint(s, this);
    },
    watch: (s) => `T${s.t} · MAR ${bin(s.mar, 4)} · A ${bin(s.a)} = ${s.a}`,
  },
  {
    id: "auto",
    title: "ADD and SUB",
    body:
      "The ring counter is back at T1 and the next fetch begins. Flip MANUAL/AUTO to AUTO and the clock runs on its own: ADD AH and ADD BH load 2 and 3 into B, and the adder-subtracter puts A + B back in A. SUB CH also raises {Su}, so it subtracts 4. The clock rate switch slows it down.",
    task: "Flip MANUAL/AUTO to AUTO (or press Run) and watch A.",
    highlight: ["sw-auto", "sw-rate", "a", "alu", "b"],
    at: 6,
    check: (s) => !s.prog && s.instructions >= 4,
    hint(s) {
      return stepHint(s, this);
    },
    watch: (s) => `A ${bin(s.a)} = ${s.a} · B ${bin(s.b)} = ${s.b}`,
  },
  {
    id: "out",
    title: "OUT: the answer",
    body:
      "OUT (1110) does its work in T4: {Ea} puts the accumulator on the bus and {Lo} loads it into the output register. The red display shows it: 1 + 2 + 3 − 4 = 2.",
    task: "Let it run (or keep stepping) through OUT.",
    highlight: ["a", "bus", "out"],
    at: 24,
    check: (s) => !s.prog && s.instructions >= 5,
    hint(s) {
      return stepHint(s, this);
    },
    watch: (s) => `OUT ${bin(s.out)} = ${s.out}`,
  },
  {
    id: "hlt",
    title: "HLT: clock stops",
    body: (s) =>
      `The last instruction, HLT (1111), reaches the IR in T3. The controller pulls {HLT_} low and the clock stops: no more T states until CLEAR. The output register keeps showing ${s.out}.`,
    task: "Keep the clock running (AUTO) until HLT.",
    doneBody:
      "That's the whole trip: CLEAR to a known state, the program written in with PROG, then fetch and execute until HLT, with the answer in the output register. Now write your own: flip to PROG, set the address and data switches and WRITE each word, then RUN, CLEAR and AUTO. Op codes: LDA 0000, ADD 0001, SUB 0010, OUT 1110, HLT 1111.",
    highlight: ["ir", "ring", "out"],
    doneHighlight: ["sw-prog", "sw-addr", "sw-data", "btn-write"],
    check: (s) => s.halted,
    hint: (s) => (s.prog ? clockHint(s) : null),
    watch: (s) => `Clock ${s.halted ? "stopped" : "running"} · OUT ${bin(s.out)} = ${s.out}`,
    manual: true,
    nextLabel: "Finish",
  },
];

export const LAST = STEPS.length - 1;

// The tour's progress. max: the step the user has reached (the frontier). view: the step shown
// (lower when looking back). latched: the frontier is a manual step that is already complete.
// snap: the simulator state when the frontier step started.
export const TOUR_START = { open: false, max: 0, view: 0, latched: false, snap: null };

// Move the frontier on while its check passes. A complete manual step waits for Next, unless the
// user has already done the next (automatic) step too.
export function advance(cur, sim, d) {
  let { max, latched } = cur;
  let snap = cur.snap ?? sim;
  let moved = false;
  for (;;) {
    const st = STEPS[max];
    if (!st || !(latched || st.check(sim, d, snap))) break;
    if (st.manual) {
      latched = true;
      const nx = STEPS[max + 1];
      if (!nx || nx.manual || !nx.check(sim, d, snap)) break;
      max += 1;
      latched = false;
      moved = true;
      continue;
    }
    max += 1;
    snap = sim;
    latched = false;
    moved = true;
  }
  if (!moved && latched === cur.latched && snap === cur.snap) return cur;
  return { ...cur, max, latched, snap, view: moved ? max : cur.view };
}
