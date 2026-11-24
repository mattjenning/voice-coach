/**
 * Quick practice: one octave of a major scale, going up, from one of six
 * starting notes. After each set the start can move up or down by one note
 * or by half an octave.
 *
 * Pure logic.
 */
import { HIGHEST_TONE, LOWEST_TONE, noteStep, type Step } from './exercise.ts';

/** Semitones above the first note for do re mi fa sol la ti do. */
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11, 12];

export type StartChoice = 'bass' | 'baritone' | 'tenor' | 'alto' | 'mezzo' | 'soprano';

/**
 * Where each choice starts. Any octave counts when singing, so these only
 * set which octave the reference tones play in.
 *
 * Matthew chose the six notes, a fifth or a fourth apart (2026-11-16). They
 * are named after the six standard voice types, lowest to highest, because
 * each scale sits inside that voice's usual range. The one stretch is bass:
 * most basses bottom out near E2, and this scale starts at C2.
 */
export const STARTS: Record<StartChoice, number> = {
  bass: 36, // C2 to C3
  baritone: 43, // G2 to G3
  tenor: 48, // C3 to C4
  alto: 55, // G3 to G4
  mezzo: 60, // C4 to C5
  soprano: 67, // G4 to G5
};

/** The eight steps of the scale that starts on `start`. */
export function scaleSteps(start: number): Step[] {
  return MAJOR_SCALE.map((above) => noteStep(start + above));
}

/**
 * Where a scale starts for a singer whose home note is known: five piano
 * keys below it. The octave then runs from a little under the home note to
 * a little over it, so the easy note sits in the middle and the set reaches
 * out both ways. Training across a full octave helped weak singers more
 * than training inside five notes (Pfordresher and Greenspon 2025).
 */
export function voiceStart(home: number): number {
  let start = home - 5;
  while (start < LOWEST_TONE) start += 12;
  while (start + 12 > HIGHEST_TONE) start -= 12;
  return start;
}

export type Shift = {
  /** Two short lines for a button: an amount over a unit. */
  label: string;
  /** The same thing in full, for a screen reader. */
  spoken: string;
  /** Semitones to move the start of the scale. */
  by: number;
};

/**
 * The choices after a set. Half an octave is six semitones. "One note" is
 * one semitone, the next piano key, which is how singers walk a warm-up
 * scale up and down.
 */
export const SHIFTS: Shift[] = [
  { label: '−½\noctave', spoken: 'Down half an octave', by: -6 },
  { label: '−1\nnote', spoken: 'Down one note', by: -1 },
  { label: 'Stay', spoken: 'Stay on the same notes', by: 0 },
  { label: '+1\nnote', spoken: 'Up one note', by: 1 },
  { label: '+½\noctave', spoken: 'Up half an octave', by: 6 },
];

/** A scale needs a tone for its top note, an octave above the start. */
export function canStartOn(start: number): boolean {
  return start >= LOWEST_TONE && start + 12 <= HIGHEST_TONE;
}

export function canShift(start: number, by: number): boolean {
  return canStartOn(start + by);
}
