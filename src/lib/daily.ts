/**
 * Today's practice: one short guided session a day, and the record of it.
 *
 * The session is about three minutes: a warm-up on easy notes, a few runs
 * of notes, a few slides, and one long note. The middle two are different
 * every day and adjust themselves: do well and tomorrow is harder, struggle
 * and it eases off. The aim is to keep the singer succeeding most of the
 * time but not all of it, because a set that is always passed teaches
 * little and one that is always failed teaches nothing and is no fun.
 *
 * It also keeps a streak: how many days in a row a session was finished.
 *
 * Pure logic. The clock and the saved copy are passed in.
 */
import { noteStep, type Step } from './exercise.ts';
import { hitSteps } from './hits.ts';
import { voiceStart } from './quick.ts';
import { slideSteps, type Difficulty } from './slide.ts';

export type Daily = {
  /** The last day a session was finished, as "2026-11-24" in the phone's own time. Null if never. */
  lastDay: string | null;
  /** Days in a row ending on `lastDay`. */
  streak: number;
  /** The longest streak ever. */
  longest: number;
  /** Sessions finished in all. */
  sessions: number;
  /** The best whole-session score so far, 0 to 100. Null if never. */
  best: number | null;
  /** How hard each self-adjusting part is now. */
  levels: { hits: Difficulty; slide: Difficulty };
};

export const NEW_DAILY: Daily = {
  lastDay: null,
  streak: 0,
  longest: 0,
  sessions: 0,
  best: null,
  levels: { hits: 'easy', slide: 'easy' },
};

const ORDER: Difficulty[] = ['easy', 'medium', 'hard'];

/** At or above this score a part gets harder next time. */
export const STEP_UP_SCORE = 90;
/** Below this score (a C is 70) it gets easier. */
export const EASE_OFF_SCORE = 70;

/**
 * The difficulty to use next, given a score at this one. 90 or better moves
 * up, below 70 moves down, and anything between stays: that band, passing
 * but not perfect, is where practice does the most good.
 */
export function nextDifficulty(level: Difficulty, score: number | null): Difficulty {
  if (score === null) return level;
  const at = ORDER.indexOf(level);
  if (score >= STEP_UP_SCORE) return ORDER[Math.min(ORDER.length - 1, at + 1)];
  if (score < EASE_OFF_SCORE) return ORDER[Math.max(0, at - 1)];
  return level;
}

/** A day as "2026-11-24", in the phone's own time zone. */
export function dayKey(date: Date): string {
  const two = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** Whole days from one day key to a later one. Noon is used so a clock change cannot shift the count. */
function daysApart(from: string, to: string): number {
  const noon = (key: string) => new Date(`${key}T12:00:00`).getTime();
  return Math.round((noon(to) - noon(from)) / 86_400_000);
}

/** True if today's session is already done. */
export function doneToday(daily: Daily, today: string): boolean {
  return daily.lastDay === today;
}

/**
 * The streak as it stands today: it holds through today if yesterday was
 * done, and is gone once a whole day has been missed.
 */
export function streakNow(daily: Daily, today: string): number {
  if (daily.lastDay === null) return 0;
  return daysApart(daily.lastDay, today) <= 1 ? daily.streak : 0;
}

/** The kinds of set in a session. */
export type Part = 'warm' | 'hits' | 'slide' | 'hold';

export type DailySet = {
  part: Part;
  title: string;
  /** What to do, in one line. */
  line: string;
  steps: Step[];
};

/** How many runs and slides a session has. Fewer than a full practice set, to keep it short. */
export const DAILY_RUNS = 3;
export const DAILY_SLIDES = 4;
/** The long note at the end, in seconds. It grows with the best streak, up to 10. */
export function holdSeconds(daily: Daily): number {
  return Math.min(10, 5 + Math.floor(daily.longest / 3));
}

const NAMES: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
export const difficultyName = (level: Difficulty) => NAMES[level];

/**
 * Today's sets for a singer whose home note is known. The runs and slides
 * are drawn fresh each time, so no two days are the same.
 */
export function dailySets(home: number, daily: Daily, random: () => number): DailySet[] {
  const start = voiceStart(home);
  const seconds = holdSeconds(daily);
  return [
    {
      part: 'warm',
      title: 'Warm up',
      line: 'Five easy notes around your home note. Hear each one, then hold it.',
      steps: [0, 2, 4, 2, 0].map((above) => noteStep(home + above)),
    },
    {
      part: 'hits',
      title: `Hit the notes, ${NAMES[daily.levels.hits].toLowerCase()}`,
      line: 'Three short runs. The app sings each one, then you land on every note.',
      steps: hitSteps(start, daily.levels.hits, random).slice(0, DAILY_RUNS),
    },
    {
      part: 'slide',
      title: `Slides, ${NAMES[daily.levels.slide].toLowerCase()}`,
      line: 'Four glides, up or down. Keep the ball inside the ring.',
      steps: slideSteps(start, 'random', daily.levels.slide, random).slice(0, DAILY_SLIDES),
    },
    {
      part: 'hold',
      title: 'One long note',
      line: `Your home note, held in tune for ${seconds} seconds. Breathe in first.`,
      steps: [{ midi: home, holdMs: seconds * 1000, listenMs: seconds * 1000 + 4000 }],
    },
  ];
}

/** What changed when a session was finished, for the screen to celebrate. */
export type DayResult = {
  daily: Daily;
  /** True the first time today. A second session the same day does not add to the streak. */
  firstToday: boolean;
  /** True if this session beat the best score so far. */
  newBest: boolean;
  /** Parts whose difficulty moved, and where to. */
  moved: { part: 'hits' | 'slide'; to: Difficulty; up: boolean }[];
};

/**
 * Fold a finished session into the record. `scores` holds the score of each
 * self-adjusting part, and `score` the whole session's.
 */
export function finishDay(
  daily: Daily,
  today: string,
  scores: { hits: number | null; slide: number | null },
  score: number | null,
): DayResult {
  const firstToday = daily.lastDay !== today;
  const streak = firstToday ? streakNow(daily, today) + 1 : daily.streak;
  const levels = {
    hits: nextDifficulty(daily.levels.hits, scores.hits),
    slide: nextDifficulty(daily.levels.slide, scores.slide),
  };
  const moved: DayResult['moved'] = [];
  for (const part of ['hits', 'slide'] as const) {
    if (levels[part] !== daily.levels[part]) {
      moved.push({
        part,
        to: levels[part],
        up: ORDER.indexOf(levels[part]) > ORDER.indexOf(daily.levels[part]),
      });
    }
  }
  const newBest = score !== null && daily.best !== null && score > daily.best;
  return {
    daily: {
      lastDay: today,
      streak,
      longest: Math.max(daily.longest, streak),
      sessions: daily.sessions + 1,
      best: score === null ? daily.best : Math.max(daily.best ?? 0, score),
      levels,
    },
    firstToday,
    newBest,
    moved,
  };
}

/** Read the saved record back, tolerating anything missing or malformed. */
export function parseDaily(text: string | null): Daily {
  if (text === null) return NEW_DAILY;
  try {
    const saved = JSON.parse(text) as Partial<Daily> | null;
    if (saved === null || typeof saved !== 'object') return NEW_DAILY;
    const count = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    const level = (value: unknown): Difficulty =>
      ORDER.includes(value as Difficulty) ? (value as Difficulty) : 'easy';
    const lastDay =
      typeof saved.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved.lastDay) ? saved.lastDay : null;
    const streak = lastDay === null ? 0 : count(saved.streak);
    return {
      lastDay,
      streak,
      longest: Math.max(count(saved.longest), streak),
      sessions: count(saved.sessions),
      best: typeof saved.best === 'number' && Number.isFinite(saved.best) ? Math.min(100, count(saved.best)) : null,
      levels: { hits: level(saved.levels?.hits), slide: level(saved.levels?.slide) },
    };
  } catch {
    return NEW_DAILY;
  }
}
