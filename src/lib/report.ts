/**
 * Report cards: what a list of step results adds up to.
 *
 * Pure logic. Feed it the results of one set, or of every set in a session
 * joined together, and it gives the same kind of summary.
 */
import type { StepResult } from './exercise.ts';

export type Summary = {
  /** Notes tried. */
  attempted: number;
  /** Notes held in tune for long enough. */
  matched: number;
  /** Average distance from the note on the best attempt, in cents. Null if nothing was heard. */
  averageOffCents: number | null;
  /** The lowest and highest notes matched, in the octave they were really sung. */
  lowestSung: number | null;
  highestSung: number | null;
  longestHoldMs: number;
};

export function summarize(results: StepResult[]): Summary {
  let matched = 0;
  let offSum = 0;
  let heard = 0;
  let lowestSung: number | null = null;
  let highestSung: number | null = null;
  let longestHoldMs = 0;
  for (const result of results) {
    if (result.closestCents !== null) {
      offSum += Math.abs(result.closestCents);
      heard++;
    }
    longestHoldMs = Math.max(longestHoldMs, result.heldMs);
    if (!result.matched) continue;
    matched++;
    if (result.sungMidi !== null) {
      lowestSung = lowestSung === null ? result.sungMidi : Math.min(lowestSung, result.sungMidi);
      highestSung = highestSung === null ? result.sungMidi : Math.max(highestSung, result.sungMidi);
    }
  }
  return {
    attempted: results.length,
    matched,
    averageOffCents: heard === 0 ? null : offSum / heard,
    lowestSung,
    highestSung,
    longestHoldMs,
  };
}

export type Grade = 'A' | 'B' | 'C' | 'D';

/**
 * A letter for the share of notes matched: A for seven in eight or better,
 * B for five in eight, C for three in eight, D below that.
 */
export function grade(summary: Summary): Grade | null {
  if (summary.attempted === 0) return null;
  const share = summary.matched / summary.attempted;
  if (share >= 0.875) return 'A';
  if (share >= 0.625) return 'B';
  if (share >= 0.375) return 'C';
  return 'D';
}

/** How many notes wide the matched range is. A2 to A3 is 13. */
export function rangeSize(summary: Summary): number {
  if (summary.lowestSung === null || summary.highestSung === null) return 0;
  return summary.highestSung - summary.lowestSung + 1;
}
