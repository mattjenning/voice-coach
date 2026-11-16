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

export type StartChoice = 'bass' | 'low' | 'medium' | 'high' | 'soprano' | 'whistle';

/**
 * Where each choice starts. Any octave counts when singing, so these only
 * set which octave the reference tones play in.
 *
 * Matthew chose these six, a fifth or a fourth apart, after singing the
 * earlier ones (2026-11-16). The names are his labels for the app, not
 * voice types: "whistle" here is G4 to G5.
 */
export const STARTS: Record<StartChoice, number> = {
  bass: 36, // C2 to C3
  low: 43, // G2 to G3
  medium: 48, // C3 to C4
  high: 55, // G3 to G4
  soprano: 60, // C4 to C5
  whistle: 67, // G4 to G5
};

/** The eight steps of the scale that starts on `start`. */
export function scaleSteps(start: number): Step[] {
  return MAJOR_SCALE.map((above) => noteStep(start + above));
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
