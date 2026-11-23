/**
 * Progression: guided practice from the very first note.
 *
 * Level 1 finds the singer's home note: whatever note they sing when asked
 * for a comfortable one. Every later level is built from that note, so the
 * course fits a low voice and a high voice equally.
 *
 * Each level trains one thing and has a pass mark. Passing a level opens the
 * next. Achievements are worked out from the saved progress, never stored.
 *
 * Pure logic. No screen, microphone or storage code.
 */
import { HIGHEST_TONE, LOWEST_TONE, noteStep, type Step, type StepResult } from './exercise.ts';
import { MAJOR_SCALE } from './quick.ts';
import { grade, isPassing, summarize } from './report.ts';

export type Progress = {
  /** The singer's comfortable note, found in level 1. Null until then. */
  home: number | null;
  /** Ids of levels passed. */
  passed: string[];
  /** The longest any note has been held in tune, in any level. */
  longestHoldMs: number;
  /** The lowest and highest notes ever matched, in the octave really sung. */
  lowestSung: number | null;
  highestSung: number | null;
};

export const NEW_PROGRESS: Progress = {
  home: null,
  passed: [],
  longestHoldMs: 0,
  lowestSung: null,
  highestSung: null,
};

export type Level = {
  id: string;
  title: string;
  /** What to do, in one line. */
  task: string;
  /** What it trains, in one line. */
  trains: string;
  /** The steps, built around the home note. */
  steps: (home: number) => Step[];
  /** Matched steps needed to pass. */
  passMark: number;
};

const notes = (home: number, above: number[]) => above.map((by) => noteStep(home + by));
const longHold = (home: number, seconds: number): Step[] => [
  { midi: home, holdMs: seconds * 1000, listenMs: seconds * 1000 + 4000 },
];

export const LEVELS: Level[] = [
  {
    id: 'home',
    title: 'Find your home note',
    task: 'Sing "ah" on any note that feels easy, and keep it steady for 2 seconds.',
    trains: 'Nothing yet. It tells the app where your voice sits, and every level after is built on it.',
    steps: () => [{ midi: null, holdMs: 2000, listenMs: 8000 }],
    passMark: 1,
  },
  {
    id: 'match',
    title: 'Match your home note',
    task: 'Hear your home note, then sing it back.',
    trains: 'Pitch matching: hearing a note and landing on it.',
    steps: (home) => notes(home, [0]),
    passMark: 1,
  },
  {
    id: 'three-up',
    title: 'Three steps up',
    task: 'Three notes, each a step higher than the last.',
    trains: 'Moving between neighboring notes without drifting.',
    steps: (home) => notes(home, [0, 2, 4]),
    passMark: 2,
  },
  {
    id: 'five-up-back',
    title: 'Five up and back',
    task: 'Five notes up, then back down to where you started.',
    trains: 'Coming down in tune, which is harder than going up.',
    steps: (home) => notes(home, [0, 2, 4, 5, 7, 5, 4, 2, 0]),
    passMark: 7,
  },
  {
    id: 'hold-5',
    title: 'Hold for 5 seconds',
    task: 'Sing your home note and hold it in tune for 5 seconds.',
    trains: 'Breath control: a steady stream of air keeps the pitch from sagging.',
    steps: (home) => longHold(home, 5),
    passMark: 1,
  },
  {
    id: 'octave',
    title: 'A full octave',
    task: 'Eight notes up a major scale: do re mi fa sol la ti do.',
    trains: 'Range. The top note is twice the pitch of the bottom one.',
    steps: (home) => notes(home, MAJOR_SCALE),
    passMark: 6,
  },
  {
    id: 'jumps',
    title: 'Jumps',
    task: 'Leap from your home note to a higher one and back, further each time.',
    trains: 'Intervals: landing on a distant note without sliding up to it.',
    steps: (home) => notes(home, [0, 4, 0, 7, 0, 12]),
    passMark: 5,
  },
  {
    id: 'hold-10',
    title: 'Hold for 10 seconds',
    task: 'Sing your home note and hold it in tune for 10 seconds.',
    trains: 'Breath control over a whole phrase of a song.',
    steps: (home) => longHold(home, 10),
    passMark: 1,
  },
  {
    id: 'reach-down',
    title: 'Reach down',
    task: 'Five notes going down from your home note.',
    trains: 'The bottom of your range.',
    steps: (home) => notes(home, [0, -1, -3, -5, -7]),
    passMark: 4,
  },
  {
    id: 'reach-up',
    title: 'Reach up',
    task: 'Six notes climbing past the top of your octave.',
    trains: 'The top of your range, where most voices change gear.',
    steps: (home) => notes(home, [7, 9, 11, 12, 14, 16]),
    passMark: 4,
  },
];

/** Levels planned but not built, shown so the path ahead is visible. */
export const COMING_LEVELS = [
  'Slides across your bridge, the notes where your voice changes gear',
  'Loud and soft on one note',
  'Short phrases from real songs',
];

/**
 * A home note the app can build every level around. The levels reach 7
 * semitones below it and 16 above, and each of those needs a tone. A home
 * note too high or too low is moved by whole octaves, which is the same
 * note to the ear.
 */
export function usableHome(sungMidi: number): number {
  let home = Math.round(sungMidi);
  while (home - 7 < LOWEST_TONE) home += 12;
  while (home + 16 > HIGHEST_TONE) home -= 12;
  return home;
}

export function isPassed(progress: Progress, level: Level): boolean {
  return progress.passed.includes(level.id);
}

/** A level is open when it is the first, or the one before it is passed. */
export function isOpen(progress: Progress, level: Level): boolean {
  const at = LEVELS.indexOf(level);
  return at === 0 || isPassed(progress, LEVELS[at - 1]);
}

/** The first level not yet passed, or null when all are done. */
export function nextLevel(progress: Progress): Level | null {
  return LEVELS.find((level) => !isPassed(progress, level)) ?? null;
}

/** The steps of a level for this singer. Level 1 needs no home note. */
export function levelSteps(progress: Progress, level: Level): Step[] {
  return level.steps(progress.home ?? 0);
}

/**
 * A level is passed by matching its pass mark, or by a grade of C or better
 * (Matthew, 2026-11-23). Finding the home note still needs a matched note,
 * because every level after is built on the note it hears.
 */
export function didPass(level: Level, results: StepResult[]): boolean {
  if (results.filter((result) => result.matched).length >= level.passMark) return true;
  return level.id !== 'home' && isPassing(grade(summarize(results)));
}

/** Fold the results of one attempt at a level into the saved progress. */
export function applyResults(progress: Progress, level: Level, results: StepResult[]): Progress {
  let { home, lowestSung, highestSung, longestHoldMs } = progress;
  for (const result of results) {
    longestHoldMs = Math.max(longestHoldMs, result.heldMs);
    if (!result.matched || result.sungMidi === null) continue;
    lowestSung = lowestSung === null ? result.sungMidi : Math.min(lowestSung, result.sungMidi);
    highestSung = highestSung === null ? result.sungMidi : Math.max(highestSung, result.sungMidi);
  }
  const passedNow = didPass(level, results);
  if (level.id === 'home' && passedNow && results[0].sungMidi !== null) {
    home = usableHome(results[0].sungMidi);
  }
  const passed =
    passedNow && !progress.passed.includes(level.id) ? [...progress.passed, level.id] : progress.passed;
  return { home, passed, longestHoldMs, lowestSung, highestSung };
}

export type Achievement = { title: string; detail: string; earned: boolean };

export function achievements(progress: Progress): Achievement[] {
  const range =
    progress.lowestSung === null || progress.highestSung === null
      ? 0
      : progress.highestSung - progress.lowestSung + 1;
  const has = (id: string) => progress.passed.includes(id);
  return [
    { title: 'First note', detail: 'Found your home note', earned: has('home') },
    { title: 'On pitch', detail: 'Matched a note you were given', earned: has('match') },
    { title: 'Steady breath', detail: 'Held a note in tune for 5 seconds', earned: progress.longestHoldMs >= 5000 },
    { title: 'Full octave', detail: 'Sang a whole major scale', earned: has('octave') },
    { title: 'Long breath', detail: 'Held a note in tune for 10 seconds', earned: progress.longestHoldMs >= 10_000 },
    { title: 'Octave range', detail: 'Matched notes a full octave apart', earned: range >= 13 },
    { title: 'Octave and a half', detail: 'Matched notes 19 or more apart', earned: range >= 19 },
  ];
}

/** Read saved progress back, tolerating anything missing or malformed. */
export function parseProgress(text: string | null): Progress {
  if (text === null) return NEW_PROGRESS;
  try {
    const saved = JSON.parse(text) as Partial<Progress>;
    const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
    return {
      home: number(saved.home),
      passed: Array.isArray(saved.passed)
        ? saved.passed.filter((id): id is string => LEVELS.some((level) => level.id === id))
        : [],
      longestHoldMs: number(saved.longestHoldMs) ?? 0,
      lowestSung: number(saved.lowestSung),
      highestSung: number(saved.highestSung),
    };
  } catch {
    return NEW_PROGRESS;
  }
}
