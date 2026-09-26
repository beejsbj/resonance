// One shared harmony keeps a dense orchestra consonant: every voice reads the same bar's chord.

const ROOT = 50; // D3
const AEOLIAN = [0, 2, 3, 5, 7, 8, 10];
// i – VI – III – VII in D minor, as scale degrees of each chord's triad (+ seventh for colour).
const PROGRESSION = [
  [0, 2, 4, 6],
  [5, 7, 9, 11],
  [2, 4, 6, 8],
  [6, 8, 10, 12],
];

// Registers are part of identity: an octave development doubles within the same voice, never borrows another's.
const REGISTER = { thread: 12, pulse: -12, bell: 24, drone: -12, spark: 24, well: 24, conductor: 12, hush: -24 };

export function degreeToMidi(degree) {
  const octave = Math.floor(degree / 7);
  const index = ((degree % 7) + 7) % 7;
  return ROOT + AEOLIAN[index] + octave * 12;
}

export function chordAt(bar) {
  return PROGRESSION[((bar % PROGRESSION.length) + PROGRESSION.length) % PROGRESSION.length];
}

const mod = (n, m) => ((n % m) + m) % m;

// Each identity has its own way of reading the chord: its figure. `step` is the being's attack count,
// or any integer a sound borrows as one (a kill uses the threat's x, which is negative off the left edge).
export function pitchFor(voice, bar, step, seed = 0) {
  const chord = chordAt(bar);
  const base = REGISTER[voice] ?? 0;
  let degree;
  if (voice === 'pulse' || voice === 'drone') degree = chord[mod(step, 2) === 0 ? 0 : 2];
  else if (voice === 'bell') degree = chord[[2, 3, 1, 2][mod(step + seed, 4)]];
  else if (voice === 'spark') degree = chord[mod(step + seed, 4)] + (mod(step, 8) >= 4 ? 7 : 0);
  else if (voice === 'thread') degree = chord[[0, 1, 2, 1, 3, 2, 1, 2][mod(step + seed, 8)]];
  else degree = chord[mod(step + seed, 3)];
  return degreeToMidi(degree) + base;
}

// A being cut off from the pulse loses the chord: it plays any scale tone, so it still belongs to the key but not the moment.
export function strayPitch(voice, random) {
  return degreeToMidi(Math.floor(random * 7)) + (REGISTER[voice] ?? 0);
}

export function chordMidis(bar, register = 0) {
  return chordAt(bar).slice(0, 3).map(d => degreeToMidi(d) + register);
}

export function tapPitch(bar, x, width) {
  const chord = chordAt(bar);
  const slot = Math.max(0, Math.min(5, Math.floor((x / width) * 6)));
  return degreeToMidi(chord[slot % 3] + (slot >= 3 ? 7 : 0)) + REGISTER.conductor;
}

export const midiToHz = midi => 440 * Math.pow(2, (midi - 69) / 12);

// Pitch-class colours from EmotiTone's chromatic wheel: what you see is the note you hear.
const HUES = [18, 48, 78, 108, 138, 178, 202, 228, 252, 282, 312, 342];
export function pitchColor(midi, alpha = 1) {
  const hue = HUES[((midi % 12) + 12) % 12];
  return `hsla(${hue}, 78%, 62%, ${alpha})`;
}
