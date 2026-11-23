/**
 * Hit the Notes: the app plays a short run of solid notes, each held for a
 * fixed time, and the singer sings the same run back, landing on each note.
 *
 * It is a phrase, like a line of a song, so it is played, drawn and scored
 * the same way: the share of the time the voice is on the right note. Like
 * Slide mode, the singer's turn starts on cue after a one-second countdown.
 *
 * Difficulty sets three things: how far the notes spread, which way they
 * go, and how long the notes may last. Within that, each note gets its own
 * random length, so a run has a rhythm and is not an even tick.
 *
 * Pure logic.
 */
import { COUNTDOWN_MS, phraseStep, type PhraseNote, type Step } from './exercise.ts';
import { noteName } from './notes.ts';
import { MAJOR_SCALE } from './quick.ts';
import type { Difficulty } from './slide.ts';

/**
 * What each difficulty asks for. A "step" is one note of the scale.
 * `span` is how many scale notes the whole run may cover (8 is the octave).
 * `turns` is how many times the run may change direction: 0 goes one way,
 * Infinity lets every note go either way.
 */
export const HIT_LEVELS: Record<
  Difficulty,
  { notes: number; shortestMs: number; longestMs: number; span: number; maxJump: number; turns: number }
> = {
  /** Four notes, a scale note apart, all one way, inside five notes. 0.5 to 1.1 seconds each (Matthew, 2026-11-23). */
  easy: { notes: 4, shortestMs: 500, longestMs: 1100, span: 5, maxJump: 1, turns: 0 },
  /** Six notes, up to two scale notes apart, turning round once, across the octave. 0.4 to 1.2 seconds each (Matthew). */
  medium: { notes: 6, shortestMs: 400, longestMs: 1200, span: 8, maxJump: 2, turns: 1 },
  /** Eight notes, jumps of up to four, any direction, across the octave. 0.3 to 1.3 seconds each (Matthew). */
  hard: { notes: 8, shortestMs: 300, longestMs: 1300, span: 8, maxJump: 4, turns: Infinity },
};

/** Note lengths are whole twentieths of a second. */
const LENGTH_STEP_MS = 50;

/** How many runs make a set. */
export const HIT_RUNS = 5;

/**
 * One run of notes, as places on the scale (0 is the bottom note).
 * Each note moves; none repeats the one before.
 */
function drawRun(level: Difficulty, random: () => number): number[] {
  const { notes, span, maxJump, turns } = HIT_LEVELS[level];
  const top = MAJOR_SCALE.length - 1;
  // The window of the scale this run lives in, placed anywhere it fits.
  const low = Math.floor(random() * (top - span + 2));
  const high = low + span - 1;
  let place = low + Math.floor(random() * span);
  // Start off in a direction there is room for.
  let up = place === low ? true : place === high ? false : random() < 0.5;
  let turnsLeft = turns;
  // Where a medium run turns: somewhere in its middle.
  const turnAt = 2 + Math.floor(random() * (notes - 3));
  const run = [place];
  for (let i = 1; i < notes; i++) {
    if (turns === Infinity) up = random() < 0.5;
    else if (turnsLeft > 0 && i === turnAt) {
      up = !up;
      turnsLeft--;
    }
    // No room to go this way: turn round if allowed. A one-way run that hits
    // the edge of its window starts again lower or higher, so it can fit.
    const room = up ? high - place : place - low;
    if (room === 0) {
      if (turnsLeft > 0) {
        up = !up;
        if (turns !== Infinity) turnsLeft--;
      } else return drawRun(level, random);
    }
    const reach = Math.min(maxJump, up ? high - place : place - low);
    const jump = 1 + Math.floor(random() * reach);
    place += up ? jump : -jump;
    run.push(place);
  }
  return run;
}

/** The runs of one set, on the major scale that starts on `start`. */
export function hitSteps(start: number, level: Difficulty, random: () => number): Step[] {
  const { shortestMs, longestMs } = HIT_LEVELS[level];
  const choices = (longestMs - shortestMs) / LENGTH_STEP_MS + 1;
  const length = () => shortestMs + LENGTH_STEP_MS * Math.floor(random() * choices);
  const steps: Step[] = [];
  let last = '';
  while (steps.length < HIT_RUNS) {
    let places = drawRun(level, random);
    for (let tries = 0; tries < 10 && places.join() === last; tries++) places = drawRun(level, random);
    last = places.join();
    const notes: PhraseNote[] = places.map((place) => ({
      midi: start + MAJOR_SCALE[place],
      ms: length(),
    }));
    const name = notes.map((note) => noteName(note.midi)).join(' ');
    steps.push({ ...phraseStep(name, notes), countdownMs: COUNTDOWN_MS, onCue: true });
  }
  return steps;
}
