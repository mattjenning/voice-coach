/**
 * The coach's line: one thing to try next, worked out from a finished set.
 *
 * A report card is full of numbers. This picks the one that matters most
 * and says it as a plain instruction. It comes after the set, never during
 * it: feedback after a batch of tries is remembered better than feedback on
 * every try, and one tip is easier to act on than five.
 *
 * Pure logic.
 */
import type { Step, StepResult } from './exercise.ts';
import { HOLD } from './hold.ts';
import { noteScore, summarize } from './report.ts';

/** A lean of at least this many cents, on average, is worth mentioning. */
const LEAN_CENTS = 15;
/** High notes and low notes must differ by this many points before one is called the weak end. */
const END_GAP = 15;

/** Roughly how high a step sits: its note, or the middle of its slide or run. */
function height(step: Step): number | null {
  if (step.midi === null) return null;
  if (step.phrase !== undefined) {
    return step.phrase.reduce((sum, note) => sum + note.midi, 0) / step.phrase.length;
  }
  if (step.slide !== undefined) return (step.midi + step.slide.toMidi) / 2;
  return step.midi;
}

/** How far off a result was with its direction kept: positive is sharp. Null if unknown. */
function lean(result: StepResult): number | null {
  if (result.biasCents !== undefined) return result.biasCents;
  if (result.score !== undefined || result.closestCents === null) return null;
  return result.closestCents;
}

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** One thing to try next, or null when there is nothing useful to say (as for a loudness set). */
export function advice(results: StepResult[]): string | null {
  if (results.length === 0 || results.some((result) => result.step.volume !== undefined)) return null;
  // The note-finding step has no note to be off from.
  const scored = results.filter((result) => result.step.midi !== null);
  if (scored.length === 0) return null;

  if (scored.every((result) => result.closestCents === null)) {
    return 'The app did not hear you. Hold the phone a hand away and sing out on "ah".';
  }

  const score = summarize(scored).score ?? 0;
  if (score >= 90) return 'That was comfortable. Make the next one harder: that is where you improve.';

  // Is one end of the set weaker than the other?
  const placed = scored
    .map((result) => ({ at: height(result.step), score: noteScore(result) }))
    .filter((each): each is { at: number; score: number } => each.at !== null);
  if (placed.length >= 4) {
    const heights = placed.map((each) => each.at).sort((a, b) => a - b);
    const middle = (heights[0] + heights[heights.length - 1]) / 2;
    const high = placed.filter((each) => each.at > middle).map((each) => each.score);
    const low = placed.filter((each) => each.at < middle).map((each) => each.score);
    if (high.length > 0 && low.length > 0) {
      const gap = average(low) - average(high);
      if (gap >= END_GAP) {
        return 'The high notes cost you most. Start the next set a note or two lower, then creep back up.';
      }
      if (gap <= -END_GAP) {
        return 'The low notes cost you most. Start the next set a note or two higher, then creep back down.';
      }
    }
  }

  // Leaning sharp or flat overall.
  const leans = scored.map(lean).filter((value): value is number => value !== null);
  if (leans.length >= 2) {
    const mean = average(leans);
    const cents = Math.round(Math.abs(mean));
    if (mean <= -LEAN_CENTS) {
      return `You sang a little flat, about ${cents} cents under. Aim just above the note and it will land.`;
    }
    if (mean >= LEAN_CENTS) {
      return `You sang a little sharp, about ${cents} cents over. Ease off and aim just under the note.`;
    }
  }

  // Found the notes but let them go.
  const letGo = scored.filter(
    (result) =>
      !result.matched &&
      result.score === undefined &&
      result.closestCents !== null &&
      Math.abs(result.closestCents) <= HOLD.toleranceCents,
  ).length;
  if (letGo >= 2 || (letGo >= 1 && scored.length <= 2)) {
    return 'You found the notes but let them go early. Take a full breath and keep the air moving.';
  }

  return score >= 70
    ? 'Nearly there. Run the same set once more: the second pass is usually cleaner.'
    : 'Listen to the whole sound before you sing, and hear it in your head first. Then run it again.';
}
