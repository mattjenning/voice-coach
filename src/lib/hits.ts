/**
 * Hit the Notes: the app plays a short tune of solid notes, each held for a
 * set time, and the singer sings the same tune back, landing on each note.
 *
 * It is a phrase, like a line of a song, so it is played, drawn and scored
 * the same way: the share of the time the voice is on the right note. Like
 * Slide mode, the singer's turn starts on cue after a one-second countdown.
 *
 * Every tune is a complete phrase in the major key of the starting note
 * (Matthew, 2026-11-25: "every phrase should be a complete western musical
 * phrase so it doesn't sound like nonsense"). Until then the notes were drawn
 * at random, which could end anywhere and sounded unfinished. Now each tune
 * is picked from a hand-written list, and every one of them follows the
 * habits of Western tunes, which the checks test:
 *
 * - It ends on do, the home note of the key, low or high. That is what makes
 *   a tune sound finished.
 * - It arrives at that last do by a step or a small skip (re-do, ti-do,
 *   mi-do, la-do), the way a cadence does.
 * - Ti always goes on to do, or steps down to la in a falling line.
 * - A leap of a fourth or more joins two notes of one chord (do-sol, re-sol,
 *   do-fa, mi-la), and the next move is a step or turns back, filling the gap.
 * - The last note is the longest, so the tune comes to rest.
 *
 * Difficulty is still set by how many notes, how far they spread, how big the
 * jumps are, which way they go, and how long the notes last.
 *
 * Pure logic.
 */
import { COUNTDOWN_MS, phraseStep, type PhraseNote, type Step } from './exercise.ts';
import { noteName } from './notes.ts';
import { MAJOR_SCALE } from './quick.ts';
import type { Difficulty } from './slide.ts';

/**
 * What each difficulty asks for. A "step" is one note of the scale.
 * `span` is how many scale notes one tune may cover (8 is the octave).
 * `maxJump` is the biggest move between two notes, in scale notes.
 * `turns` is how many times a tune may change direction: 0 goes one way,
 * Infinity lets every note go either way.
 */
export const HIT_LEVELS: Record<
  Difficulty,
  { notes: number; shortestMs: number; longestMs: number; span: number; maxJump: number; turns: number }
> = {
  /**
   * Four notes, all one way, inside five notes. 0.5 to 1.1 seconds each (Matthew, 2026-11-23).
   * Matthew's first rule was one scale note apart. Four steps one way that end on do allow only
   * two tunes in an octave (fa mi re do, sol la ti do), so Easy may also skip one note (2026-11-25).
   */
  easy: { notes: 4, shortestMs: 500, longestMs: 1100, span: 5, maxJump: 2, turns: 0 },
  /** Six notes, up to two scale notes apart, turning round once, across the octave. 0.4 to 1.2 seconds each (Matthew). */
  medium: { notes: 6, shortestMs: 400, longestMs: 1200, span: 8, maxJump: 2, turns: 1 },
  /** Eight notes, jumps of up to four, any direction, across the octave. 0.3 to 1.3 seconds each (Matthew). */
  hard: { notes: 8, shortestMs: 300, longestMs: 1300, span: 8, maxJump: 4, turns: Infinity },
};

/** Where each sol-fa name sits on the scale. "do'" is the do an octave up. */
export const SOLFA: Record<string, number> = {
  do: 0,
  re: 1,
  mi: 2,
  fa: 3,
  sol: 4,
  la: 5,
  ti: 6,
  "do'": 7,
};

/** The tunes of each difficulty, in sol-fa. */
export const HIT_TUNES: Record<Difficulty, string[]> = {
  easy: [
    'fa mi re do',
    'sol mi re do',
    'sol fa re do',
    'sol fa mi do',
    "sol la ti do'",
    "fa la ti do'",
    "fa sol ti do'",
    "fa sol la do'",
  ],
  medium: [
    'do re mi fa mi do',
    'do mi sol fa re do',
    'mi sol la sol mi do',
    'do mi fa sol mi do',
    're mi fa sol mi do',
    'do re mi sol mi do',
    'sol la sol mi re do',
    'do re fa mi re do',
    're mi fa mi re do',
    'do mi fa mi re do',
    "sol mi fa sol ti do'",
    "do' la sol la ti do'",
    "sol fa mi sol ti do'",
    "la sol mi sol ti do'",
    "do' ti la sol ti do'",
    "do' la fa sol ti do'",
    "ti la sol la ti do'",
    "la sol fa sol ti do'",
  ],
  hard: [
    'do sol fa mi re mi re do',
    "do mi sol do' ti la ti do'",
    "sol do' ti la sol mi re do",
    'do sol la sol mi fa re do',
    "do' sol la fa sol mi re do",
    "mi do sol fa la sol ti do'",
    'do mi re sol fa mi re do',
    "do' ti do' sol la fa re do",
    "sol mi do mi sol do' ti do'",
    'do sol mi la sol fa re do',
    "mi sol do' la sol fa mi do",
    'do fa mi la sol mi re do',
    "do' la ti do' sol fa re do",
    "sol do re mi fa sol ti do'",
    'do re mi do sol fa re do',
  ],
};

/** A tune as places on the scale, 0 to 7. */
export const tunePlaces = (tune: string): number[] => tune.split(' ').map((name) => SOLFA[name]);

/** Note lengths are whole twentieths of a second. */
const LENGTH_STEP_MS = 50;

/** How many runs make a set. */
export const HIT_RUNS = 5;

/** The runs of one set, on the major scale that starts on `start`. No tune comes twice in a set. */
export function hitSteps(start: number, level: Difficulty, random: () => number): Step[] {
  const { shortestMs, longestMs } = HIT_LEVELS[level];
  const choices = (longestMs - shortestMs) / LENGTH_STEP_MS + 1;
  const length = () => shortestMs + LENGTH_STEP_MS * Math.floor(random() * choices);
  // Shuffle the level's tunes and deal them out in order.
  const tunes = [...HIT_TUNES[level]];
  for (let i = tunes.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [tunes[i], tunes[j]] = [tunes[j], tunes[i]];
  }
  return tunes.slice(0, HIT_RUNS).map((tune) => {
    const places = tunePlaces(tune);
    const notes: PhraseNote[] = places.map((place, i) => ({
      midi: start + MAJOR_SCALE[place],
      // The last note is held longest, so the tune comes to rest on it.
      ms: i === places.length - 1 ? longestMs : length(),
    }));
    const name = notes.map((note) => noteName(note.midi)).join(' ');
    return { ...phraseStep(name, notes), countdownMs: COUNTDOWN_MS, onCue: true };
  });
}
