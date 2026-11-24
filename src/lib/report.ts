/**
 * Report cards: what a list of step results adds up to.
 *
 * Pure logic. Feed it the results of one set, or of every set in a session
 * joined together, and it gives the same kind of summary.
 */
import type { StepResult } from './exercise.ts';

/**
 * A score for one note, from 0 to 100.
 *
 * A matched note scores 100. A missed note earns partial credit in two
 * halves: up to 50 for how close the best attempt came, and up to 50 for how
 * much of the hold was done in tune. The closeness half is full marks dead
 * on the note and falls to nothing a semitone (100 cents) away. A note that
 * was never heard scores 0.
 */
export function noteScore(result: StepResult): number {
  // A slide brings its own score: the share of it sung on the line.
  if (result.score !== undefined) return result.score;
  if (result.matched) return 100;
  if (result.closestCents === null) return 0;
  const closeness = Math.max(0, 1 - Math.abs(result.closestCents) / 100);
  const held = result.step.holdMs <= 0 ? 0 : Math.min(1, result.heldMs / result.step.holdMs);
  // A miss can come close to full marks but never reach them.
  return Math.min(99, Math.round(50 * closeness + 50 * held));
}

export type Summary = {
  /** Notes tried. */
  attempted: number;
  /** Notes held in tune for long enough. */
  matched: number;
  /** The average note score, 0 to 100. Null when no notes were tried. */
  score: number | null;
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
  let scoreSum = 0;
  for (const result of results) {
    scoreSum += noteScore(result);
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
    score: results.length === 0 ? null : Math.round(scoreSum / results.length),
    averageOffCents: heard === 0 ? null : offSum / heard,
    lowestSung,
    highestSung,
    longestHoldMs,
  };
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

/** The usual school scale: A from 90, B from 80, C from 70, D from 60, F below. */
export function grade(summary: Summary): Grade | null {
  return summary.score === null ? null : scoreGrade(summary.score);
}

/** The letter for one score, 0 to 100: a single note's, or a whole set's. */
export function scoreGrade(score: number): Grade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/** A C or better passes (Matthew, 2026-11-23). */
export function isPassing(letter: Grade | null): boolean {
  return letter === 'A' || letter === 'B' || letter === 'C';
}

/** How many notes wide the matched range is. A2 to A3 is 13. */
export function rangeSize(summary: Summary): number {
  if (summary.lowestSung === null || summary.highestSung === null) return 0;
  return summary.highestSung - summary.lowestSung + 1;
}
