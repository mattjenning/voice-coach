/**
 * Quick practice: one octave of a major scale, going up, starting low,
 * medium or high. After each set the start can move up or down by a half or
 * a whole octave.
 *
 * Pure logic.
 */
import { HIGHEST_TONE, LOWEST_TONE, noteStep, type Step } from './exercise.ts';

/** Semitones above the first note for do re mi fa sol la ti do. */
export const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11, 12];

export type StartChoice = 'low' | 'medium' | 'high';

/**
 * Where each choice starts. Any octave counts when singing, so these only
 * set which octave the reference tones play in.
 */
export const STARTS: Record<StartChoice, number> = {
  low: 45, // A2 to A3
  medium: 52, // E3 to E4
  high: 60, // C4 to C5
};

/** The eight steps of the scale that starts on `start`. */
export function scaleSteps(start: number): Step[] {
  return MAJOR_SCALE.map((above) => noteStep(start + above));
}

export type Shift = { label: string; by: number };

/** The choices after a set. Half an octave is six semitones. */
export const SHIFTS: Shift[] = [
  { label: 'Down 1', by: -12 },
  { label: 'Down ½', by: -6 },
  { label: 'Stay', by: 0 },
  { label: 'Up ½', by: 6 },
  { label: 'Up 1', by: 12 },
];

/** A scale needs a tone for its top note, an octave above the start. */
export function canStartOn(start: number): boolean {
  return start >= LOWEST_TONE && start + 12 <= HIGHEST_TONE;
}

export function canShift(start: number, by: number): boolean {
  return canStartOn(start + by);
}
