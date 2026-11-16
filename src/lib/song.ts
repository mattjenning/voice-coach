/**
 * Song mode: learn one song a line at a time, by call and response.
 *
 * The app plays a line of the melody. Then the singer sings it back and is
 * scored on how much of it they sang on the notes and in time. Sing a line
 * cleanly three times and it is mastered. Master every line and the song is.
 *
 * Pure logic and data. No screen, microphone or storage code.
 */
import { SLIDE_PASS_SCORE, phraseStep, type PhraseNote, type Step, type StepResult } from './exercise.ts';

export type SongLine = { words: string; notes: PhraseNote[] };
export type Song = { id: string; title: string; credit: string; lines: SongLine[] };

/** Clean passes needed to master a line. */
export const PASSES_TO_MASTER = 3;

/** One beat, in milliseconds. 700 is about 86 beats a minute, a slow walk. */
const BEAT_MS = 700;
const D4 = 62;
const E4 = 64;
const G4 = 67;
const A4 = 69;
const B4 = 71;
const D5 = 74;
/** Notes from pairs of [note, beats]. */
const line = (words: string, ...pairs: [number, number][]): SongLine => ({
  words,
  notes: pairs.map(([midi, beats]) => ({ midi, ms: beats * BEAT_MS })),
});

/**
 * Amazing Grace, first verse, in G. Words by John Newton, 1779. The tune is
 * "New Britain", first printed in 1829 and joined to these words in 1835.
 * Both are long out of copyright. The melody is the plain hymnal form, with
 * the short two-note turns kept and the ornaments left out.
 */
export const AMAZING_GRACE: Song = {
  id: 'amazing-grace',
  title: 'Amazing Grace',
  credit: 'Words by John Newton, 1779. Tune "New Britain", 1829.',
  lines: [
    line('Amazing grace, how sweet the sound,', [D4, 1], [G4, 2], [B4, 0.5], [G4, 0.5], [B4, 2], [A4, 1], [G4, 2], [E4, 1], [D4, 2]),
    line('That saved a wretch like me.', [D4, 1], [G4, 2], [B4, 0.5], [G4, 0.5], [B4, 2], [A4, 1], [D5, 3]),
    line('I once was lost, but now am found,', [B4, 1], [D5, 2], [B4, 1], [G4, 2], [D4, 1], [E4, 2], [G4, 0.5], [E4, 0.5], [D4, 2]),
    line('Was blind, but now I see.', [D4, 1], [G4, 2], [B4, 0.5], [G4, 0.5], [B4, 2], [A4, 1], [G4, 3]),
  ],
};

/** One line of a song as a step. Its name on screen is "Line 2" and so on. */
export function lineStep(song: Song, index: number): Step {
  return phraseStep(`Line ${index + 1}`, song.lines[index].notes);
}

/** The whole song, a line at a time. */
export function songSteps(song: Song): Step[] {
  return song.lines.map((_, index) => lineStep(song, index));
}

/** A line is sung cleanly when most of it was on the notes and in time. */
export function isClean(result: StepResult): boolean {
  return (result.score ?? 0) >= SLIDE_PASS_SCORE;
}

/** Clean passes so far for each line of a song. */
export type Passes = number[];

export function noPasses(song: Song): Passes {
  return song.lines.map(() => 0);
}

/** Add the results of singing some lines, starting at line `first`. */
export function addPasses(passes: Passes, first: number, results: StepResult[]): Passes {
  return passes.map((count, index) => {
    const result = results[index - first];
    return result !== undefined && isClean(result) ? Math.min(PASSES_TO_MASTER, count + 1) : count;
  });
}

export const lineMastered = (passes: Passes, index: number) => passes[index] >= PASSES_TO_MASTER;
export const songMastered = (passes: Passes) => passes.every((count) => count >= PASSES_TO_MASTER);

/** The first line not yet mastered, or null when the song is. */
export function nextLine(passes: Passes): number | null {
  const at = passes.findIndex((count) => count < PASSES_TO_MASTER);
  return at === -1 ? null : at;
}

/** Read saved passes back, tolerating anything missing or malformed. */
export function parsePasses(song: Song, text: string | null): Passes {
  try {
    const saved: unknown = text === null ? null : JSON.parse(text);
    if (!Array.isArray(saved)) return noPasses(song);
    return song.lines.map((_, index) => {
      const count = saved[index];
      return typeof count === 'number' && count >= 0 ? Math.min(PASSES_TO_MASTER, Math.floor(count)) : 0;
    });
  } catch {
    return noPasses(song);
  }
}
