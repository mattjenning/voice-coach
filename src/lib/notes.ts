/**
 * Notes and frequencies. Pure maths, no screen or microphone code.
 *
 * A pitch is a frequency in hertz (Hz): how many times a second the sound
 * repeats. Musical notes are named frequencies. A4 is 440 Hz, and every
 * octave up doubles the frequency.
 *
 * Notes are numbered the MIDI way: 60 is middle C (C4), 69 is A4, and each
 * step of 1 is one semitone (one piano key).
 *
 * A cent is one hundredth of a semitone. It measures how far off a note is.
 */

export const A4_HZ = 440;
export const A4_MIDI = 69;

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;

/** Frequency to a fractional note number. 440 Hz gives 69; 452 Hz gives about 69.47. */
export function hzToMidi(hz: number): number {
  return A4_MIDI + 12 * Math.log2(hz / A4_HZ);
}

/** Note number to frequency. 69 gives 440 Hz. */
export function midiToHz(midi: number): number {
  return A4_HZ * 2 ** ((midi - A4_MIDI) / 12);
}

/** 60 gives "C4", 57 gives "A3". */
export function noteName(midi: number): string {
  const rounded = Math.round(midi);
  const name = NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

/** How far `hz` is from `targetHz`, in cents. Positive means sharp (too high). */
export function centsBetween(hz: number, targetHz: number): number {
  return 1200 * Math.log2(hz / targetHz);
}

export type NearestNote = {
  /** Whole note number of the closest note. */
  midi: number;
  name: string;
  /** Distance from that note, from -50 (flat) to +50 (sharp). */
  cents: number;
};

/** The closest named note to a frequency, and how far off it is. */
export function nearestNote(hz: number): NearestNote {
  const exact = hzToMidi(hz);
  const midi = Math.round(exact);
  return { midi, name: noteName(midi), cents: (exact - midi) * 100 };
}

/** "131 Hz" */
export function formatHz(hz: number): string {
  return `${Math.round(hz)} Hz`;
}

/** "in tune", "12 cents sharp", "30 cents flat" */
export function formatCents(cents: number, inTuneWithin: number): string {
  const size = Math.round(Math.abs(cents));
  if (Math.abs(cents) <= inTuneWithin) return 'in tune';
  return `${size} cents ${cents > 0 ? 'sharp' : 'flat'}`;
}
