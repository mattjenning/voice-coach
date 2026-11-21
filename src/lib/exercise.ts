/**
 * The engine every mode runs on: an exercise is a list of steps, and the app
 * works through them one at a time without being asked.
 *
 * Each step is one round. The app plays a note, then listens while you sing
 * it back. The step ends when you hold the note in tune for long enough, or
 * when the time runs out. Either way the next step starts by itself. When
 * the last step ends, the results are ready for a report.
 *
 * Pure logic. The screen sends events in ("the tone finished", "a pitch was
 * heard") and draws whatever state comes back. Nothing here knows about the
 * microphone or the screen, so it is tested without a phone.
 */
import {
  HOLD,
  NOT_HOLDING,
  advanceHold,
  compareToTarget,
  type HoldState,
  type TargetReading,
} from './hold.ts';
import { centsBetween, hzToMidi, midiToHz } from './notes.ts';

/** The lowest and highest notes the app has a reference tone for. */
export const LOWEST_TONE = 36; // C2
export const HIGHEST_TONE = 84; // C6

export type Step = {
  /**
   * The note to match. Null means "any steady note": no tone is played, and
   * whatever note the singer settles on is the answer. Used to find a
   * singer's own comfortable note.
   */
  midi: number | null;
  /** Hold in tune this long to match. */
  holdMs: number;
  /** How long the app listens before moving on. */
  listenMs: number;
  /**
   * Set for a slide: the pitch glides from `midi` to another note, and the
   * singer follows it. `holdMs` is not used for a slide.
   */
  slide?: Slide;
  /**
   * Set for a phrase of a song: several notes sung one after another in
   * time. `midi` is the first of them. `holdMs` is not used.
   */
  phrase?: PhraseNote[];
  /** What to call this step on screen and in a report, when its notes alone do not say. */
  name?: string;
  /** Set for a loudness step: the singer is judged on how loud they sing, not on the note. */
  volume?: Volume;
};

/**
 * A loudness step. "quiet" and "loud" listen to the singer's softest and
 * loudest singing, to learn their own range. "match" asks them to sing at a
 * point in that range and hold it: 0 is their softest, 1 their loudest.
 */
export type Volume = { kind: 'quiet' } | { kind: 'loud' } | { kind: 'match'; target: number };

/** Within this much of the target, as a share of the singer's range, counts as matched. */
export const VOLUME_TOLERANCE = 0.15;
/** A singer's loud and soft are treated as at least this many decibels apart. */
const SMALLEST_RANGE_DB = 10;
/** A range to use if the singer's own was never measured. */
const USUAL_QUIET_DB = -45;
const USUAL_LOUD_DB = -20;

/**
 * Volume match: learn the singer's soft and loud, then five targets between.
 * The reference tone plays once, before the first step.
 */
export function volumeSteps(midi: number): Step[] {
  const learn = (name: string, volume: Volume, tone: number | null): Step => ({
    midi: tone,
    holdMs: 0,
    listenMs: 3500,
    volume,
    name,
  });
  const match = (name: string, target: number): Step => ({
    midi: null,
    holdMs: 2000,
    listenMs: 5000,
    volume: { kind: 'match', target },
    name,
  });
  return [
    learn('As soft as you can', { kind: 'quiet' }, midi),
    learn('Loud, but comfortable', { kind: 'loud' }, null),
    match('Soft', 0.25),
    match('Loud', 0.75),
    match('Medium', 0.5),
    match('Very loud', 0.95),
    match('Very soft', 0.05),
  ];
}

/** Where a loudness in decibels sits in a singer's range: 0 is their softest, 1 their loudest. */
export function loudnessShare(db: number, quietDb: number | null, loudDb: number | null): number {
  const quiet = quietDb ?? USUAL_QUIET_DB;
  const loud = Math.max(loudDb ?? USUAL_LOUD_DB, quiet + SMALLEST_RANGE_DB);
  return (db - quiet) / (loud - quiet);
}

/** One note of a phrase: which note, and how long it lasts. */
export type PhraseNote = { midi: number; ms: number };

/**
 * A slide holds its first note, glides to its last, and holds that. With a
 * turning note set, it glides there first and then on to the last note, so
 * it can go up and come back down.
 */
export type Slide = {
  toMidi: number;
  /** Where the slide turns, half way through the glide. Unset for a straight slide. */
  viaMidi?: number;
  leadMs: number;
  glideMs: number;
  tailMs: number;
};

/** Half a second on the first note, three seconds gliding, half a second on the last. */
export const SLIDE_SHAPE = { leadMs: 500, glideMs: 3000, tailMs: 500 };
/** A slide is harder to track than a held note, so "on the line" is twice as wide. */
export const SLIDE_TOLERANCE_CENTS = 50;
/** On the line for this share of the slide counts as matched. */
export const SLIDE_PASS_SCORE = 70;
/** How long the app waits for the singer to start before giving up. */
const SLIDE_WAIT_MS = 3000;
/**
 * On a slide or a song line, how long the ball stays at the last pitch heard
 * when the voice drops out. Sung words break the voice at every consonant and
 * breath, and without this the ball blinks out at each one.
 */
export const VOICE_GAP_MS = 300;

export function slideMs(slide: Slide): number {
  return slide.leadMs + slide.glideMs + slide.tailMs;
}

/**
 * A slide from one note to another. Give `viaMidi` to make it turn, and
 * `extraMs` to make the glide slower.
 */
export function slideStep(fromMidi: number, toMidi: number, viaMidi?: number, extraMs = 0): Step {
  const slide: Slide = { toMidi, ...SLIDE_SHAPE, glideMs: SLIDE_SHAPE.glideMs + extraMs };
  if (viaMidi !== undefined) slide.viaMidi = viaMidi;
  return { midi: fromMidi, holdMs: 0, listenMs: slideMs(slide) + SLIDE_WAIT_MS, slide };
}

/**
 * Where the pitch of a slide is at a moment, as a fractional note number.
 * The glide is a straight line in notes, which is how a voice slides.
 */
export function slideMidiAt(fromMidi: number, slide: Slide, tMs: number): number {
  const along = Math.max(0, Math.min(1, (tMs - slide.leadMs) / slide.glideMs));
  if (slide.viaMidi === undefined) return fromMidi + (slide.toMidi - fromMidi) * along;
  // A turning slide spends half the glide reaching the turn and half leaving it.
  return along <= 0.5
    ? fromMidi + (slide.viaMidi - fromMidi) * along * 2
    : slide.viaMidi + (slide.toMidi - slide.viaMidi) * (along - 0.5) * 2;
}

/** The usual step: hold for 2 seconds, inside 3.5 seconds of listening. */
export function noteStep(midi: number): Step {
  return { midi, holdMs: HOLD.goalMs, listenMs: 3500 };
}

/** A phrase of a song, as one step. */
export function phraseStep(name: string, notes: PhraseNote[]): Step {
  const total = notes.reduce((sum, note) => sum + note.ms, 0);
  return { midi: notes[0].midi, holdMs: 0, listenMs: total + SLIDE_WAIT_MS, phrase: notes, name };
}

/**
 * A moving target: a pitch that changes over time, which the singer follows.
 * Slides and phrases are both paths, and are played, drawn and scored the
 * same way.
 */
export type Path = {
  totalMs: number;
  /** Where the pitch is at a moment, as a fractional note number. */
  midiAt: (tMs: number) => number;
  lowest: number;
  highest: number;
  /** The moments a new note begins, for a path made of separate notes. Empty for a glide. */
  starts: number[];
};

/** The path of a step, or null if it is a single held note. */
export function stepPath(step: Step): Path | null {
  if (step.midi === null) return null;
  const from = step.midi;
  if (step.slide !== undefined) {
    const slide = step.slide;
    const turn = slide.viaMidi ?? from;
    return {
      totalMs: slideMs(slide),
      midiAt: (tMs) => slideMidiAt(from, slide, tMs),
      lowest: Math.min(from, slide.toMidi, turn),
      highest: Math.max(from, slide.toMidi, turn),
      starts: [],
    };
  }
  if (step.phrase !== undefined) {
    const notes = step.phrase;
    const starts: number[] = [];
    let total = 0;
    for (const note of notes) {
      starts.push(total);
      total += note.ms;
    }
    return {
      totalMs: total,
      midiAt: (tMs) => {
        let at = notes.length - 1;
        for (let i = 0; i < notes.length; i++) {
          if (tMs < starts[i] + notes[i].ms) {
            at = i;
            break;
          }
        }
        return notes[at].midi;
      },
      lowest: Math.min(...notes.map((note) => note.midi)),
      highest: Math.max(...notes.map((note) => note.midi)),
      starts,
    };
  }
  return null;
}

export type StepResult = {
  step: Step;
  matched: boolean;
  /** The best attempt's distance from the note, in cents. Null if nothing was heard. */
  closestCents: number | null;
  /** The note actually sung at the best moment, in its real octave. */
  sungMidi: number | null;
  /** The longest run in tune. */
  heldMs: number;
  /** For a slide: the share of it sung on the line, 0 to 100. Notes work theirs out from the fields above. */
  score?: number;
};

export type Phase =
  /** Not started, or stopped by hand. */
  | 'ready'
  /** The reference tone is playing, or the microphone is starting. */
  | 'tone'
  /** The microphone is on and the clock is running. */
  | 'listening'
  /** Every step is finished. */
  | 'done';

export type Run = {
  steps: Step[];
  /** Which step is in play. */
  index: number;
  phase: Phase;
  /** Goes up by one each time a new tone is due. The screen plays a tone when it changes. */
  turn: number;
  deadlineMs: number | null;
  clockMs: number | null;
  /** The pitch being sung right now, or null for silence. */
  hz: number | null;
  /** How the current pitch compares with the note. */
  reading: TargetReading | null;
  hold: HoldState;
  longestHeldMs: number;
  /** The best attempt of this step so far, and the pitch it was sung at. */
  closest: TargetReading | null;
  closestHz: number | null;
  /** For an "any steady note" step: the note the singer is settling on. */
  settledMidi: number | null;
  /** For a loudness step: how loud the singer is now, as a share of their range, and the readings so far. */
  loudness: number | null;
  levels: number[];
  /** The nearest the singer has come to the loudness target this step. */
  volumeGap: number | null;
  /** The singer's softest and loudest singing, in decibels, once measured. Kept for the whole run. */
  quietDb: number | null;
  loudDb: number | null;
  /** For a slide: when the singer started, and how the readings since have gone. */
  slideStartedAt: number | null;
  slideHeard: number;
  slideOnLine: number;
  slideErrorSum: number;
  slideVoiced: number;
  /** When the singer's voice was last heard on this slide or line. */
  voicedAt: number | null;
  /** The sung pitch over the slide, for drawing: time since the start, and note number. */
  trace: { tMs: number; midi: number }[];
  results: StepResult[];
};

export type RunEvent =
  | { type: 'start'; steps: Step[] }
  /** The tone has finished and the microphone is on. */
  | { type: 'listen'; atMs: number }
  | { type: 'pitch'; hz: number | null; atMs: number; db?: number }
  /** A clock tick, in case no sound arrives to move time along. */
  | { type: 'tick'; atMs: number }
  | { type: 'stop' };

const STEP_START = {
  deadlineMs: null,
  clockMs: null,
  hz: null,
  reading: null,
  hold: NOT_HOLDING,
  longestHeldMs: 0,
  closest: null,
  closestHz: null,
  settledMidi: null,
  slideStartedAt: null,
  slideHeard: 0,
  slideOnLine: 0,
  slideErrorSum: 0,
  slideVoiced: 0,
  voicedAt: null,
  trace: [] as { tMs: number; midi: number }[],
  loudness: null,
  levels: [] as number[],
  volumeGap: null,
};

export const NO_RUN: Run = {
  steps: [],
  index: 0,
  phase: 'ready',
  turn: 0,
  results: [],
  quietDb: null,
  loudDb: null,
  ...STEP_START,
};

/** The step in play, or null before the start and after the end. */
export function currentStep(run: Run): Step | null {
  return run.phase === 'tone' || run.phase === 'listening' ? (run.steps[run.index] ?? null) : null;
}

/** Milliseconds of listening left, or 0 when not listening. */
export function timeLeftMs(run: Run): number {
  if (run.phase !== 'listening' || run.deadlineMs === null || run.clockMs === null) return 0;
  return Math.max(0, run.deadlineMs - run.clockMs);
}

/** Record a result, then move to the next step or finish. */
function advance(run: Run, result: StepResult): Run {
  const results = [...run.results, result];
  const last = run.index + 1 >= run.steps.length;
  return {
    ...run,
    ...STEP_START,
    results,
    index: last ? run.index : run.index + 1,
    phase: last ? 'done' : 'tone',
    turn: last ? run.turn : run.turn + 1,
  };
}

/** Close the note in play. */
function endStep(run: Run, matched: boolean): Run {
  const step = run.steps[run.index];
  if (step.volume !== undefined) return endVolume(run, step, step.volume);
  const path = stepPath(step);
  if (path !== null) return endPath(run, step, path);
  const sungHz = run.closestHz;
  return advance(run, {
    step,
    matched,
    closestCents: run.closest === null ? null : run.closest.cents,
    sungMidi:
      step.midi === null ? run.settledMidi : sungHz === null ? null : Math.round(hzToMidi(sungHz)),
    heldMs: Math.min(run.longestHeldMs, step.holdMs),
  });
}

/** Close the loudness step in play. */
function endVolume(run: Run, step: Step, volume: Volume): Run {
  if (volume.kind !== 'match') {
    // Learning the singer's range: take the middle reading, and remember it for the run.
    const sorted = [...run.levels].sort((a, b) => a - b);
    const heard = sorted.length >= 5;
    const middle = heard ? sorted[Math.floor(sorted.length / 2)] : null;
    const next = advance(run, {
      step,
      matched: heard,
      closestCents: null,
      sungMidi: null,
      heldMs: 0,
      score: heard ? 100 : 0,
    });
    return volume.kind === 'quiet'
      ? { ...next, quietDb: middle ?? run.quietDb }
      : { ...next, loudDb: middle ?? run.loudDb };
  }
  const matched = run.hold.done;
  const closeness = run.volumeGap === null ? 0 : Math.max(0, 1 - run.volumeGap / 0.5);
  const held = Math.min(1, run.longestHeldMs / step.holdMs);
  return advance(run, {
    step,
    matched,
    closestCents: null,
    sungMidi: null,
    heldMs: Math.min(run.longestHeldMs, step.holdMs),
    score: matched ? 100 : Math.min(99, Math.round(50 * closeness + 50 * held)),
  });
}

/** Score one reading against a loudness step. Silence is neither soft nor loud: it does not count. */
function hearVolume(
  run: Run,
  step: Step,
  volume: Volume,
  hz: number | null,
  db: number | undefined,
  atMs: number,
): Run {
  const voiced = hz !== null && db !== undefined;
  if (volume.kind !== 'match') {
    return {
      ...run,
      hz,
      levels: voiced ? [...run.levels, db] : run.levels,
      loudness: voiced ? loudnessShare(db, run.quietDb, run.loudDb) : null,
      clockMs: atMs,
    };
  }
  const loudness = voiced ? loudnessShare(db, run.quietDb, run.loudDb) : null;
  const gap = loudness === null ? null : Math.abs(loudness - volume.target);
  const inRange = gap !== null && gap <= VOLUME_TOLERANCE;
  const hold = advanceHold(run.hold, inRange, atMs, step.holdMs);
  return {
    ...run,
    hz,
    loudness,
    hold,
    longestHeldMs: Math.max(run.longestHeldMs, hold.heldMs),
    volumeGap: gap !== null && (run.volumeGap === null || gap < run.volumeGap) ? gap : run.volumeGap,
    clockMs: atMs,
  };
}

/**
 * Close the slide or phrase in play. Its score is the share of readings on
 * the line, scaled down if the singer stopped before the end.
 */
function endPath(run: Run, step: Step, path: Path): Run {
  const lastMs = run.trace.length === 0 ? 0 : run.trace[run.trace.length - 1].tMs;
  const sungThrough =
    run.slideStartedAt === null || run.clockMs === null
      ? 0
      : Math.min(1, Math.max(lastMs, run.clockMs - run.slideStartedAt) / path.totalMs);
  const onLine = run.slideHeard === 0 ? 0 : run.slideOnLine / run.slideHeard;
  const score = Math.round(100 * onLine * sungThrough);
  return advance(run, {
    step,
    matched: score >= SLIDE_PASS_SCORE,
    closestCents: run.slideVoiced === 0 ? null : run.slideErrorSum / run.slideVoiced,
    // The first note really sung, in its own octave, even if that is not the tone's.
    sungMidi: run.closestHz === null ? null : Math.round(hzToMidi(run.closestHz)),
    heldMs: 0,
    score,
  });
}

/**
 * Score one reading against a slide or phrase. Its clock starts when the
 * singer does, so a slow start is not counted against them.
 */
function hearPath(run: Run, path: Path, hz: number | null, atMs: number): Run {
  if (run.slideStartedAt === null && hz === null) return { ...run, hz, reading: null, clockMs: atMs };
  const startedAt = run.slideStartedAt ?? atMs;
  const tMs = atMs - startedAt;
  if (tMs > path.totalMs) return { ...run, slideStartedAt: startedAt, clockMs: atMs };

  const target = path.midiAt(tMs);
  // A short break in the voice keeps the last reading on screen. Only real readings are scored.
  const briefGap = run.voicedAt !== null && atMs - run.voicedAt <= VOICE_GAP_MS;
  let reading: TargetReading | null = briefGap ? run.reading : null;
  let { slideOnLine, slideErrorSum, slideVoiced, trace } = run;
  if (hz !== null) {
    const raw = centsBetween(hz, midiToHz(target));
    const octaves = Math.round(raw / 1200);
    const cents = raw - octaves * 1200;
    const inTune = Math.abs(cents) <= SLIDE_TOLERANCE_CENTS;
    reading = { cents, octaves, inTune };
    if (inTune) slideOnLine++;
    slideErrorSum += Math.abs(cents);
    slideVoiced++;
    trace = [...trace, { tMs, midi: target + cents / 100 }];
  }
  return {
    ...run,
    hz,
    reading,
    voicedAt: hz === null ? run.voicedAt : atMs,
    slideStartedAt: startedAt,
    slideHeard: run.slideHeard + 1,
    slideOnLine,
    slideErrorSum,
    slideVoiced,
    trace,
    closestHz: run.closestHz ?? hz,
    clockMs: atMs,
  };
}

/** Score one reading against a step that has a note to match. */
function hearNote(run: Run, step: Step, midi: number, hz: number | null, atMs: number): Run {
  const reading = hz === null ? null : compareToTarget(hz, midi);
  const hold = advanceHold(run.hold, reading !== null && reading.inTune, atMs, step.holdMs);
  const better =
    reading !== null &&
    (run.closest === null || Math.abs(reading.cents) < Math.abs(run.closest.cents));
  return {
    ...run,
    hz,
    reading,
    hold,
    longestHeldMs: Math.max(run.longestHeldMs, hold.heldMs),
    closest: better ? reading : run.closest,
    closestHz: better ? hz : run.closestHz,
    clockMs: atMs,
  };
}

/** Score one reading against an "any steady note" step. */
function hearAnyNote(run: Run, step: Step, hz: number | null, atMs: number): Run {
  if (hz === null) {
    const hold = advanceHold(run.hold, false, atMs, step.holdMs);
    return { ...run, hz, reading: null, hold, clockMs: atMs };
  }
  const exact = hzToMidi(hz);
  const moved = run.settledMidi === null || Math.abs(exact - run.settledMidi) > 0.5;
  const settledMidi = moved ? Math.round(exact) : run.settledMidi;
  // Moving to a different note starts the count again.
  const hold = advanceHold(moved ? NOT_HOLDING : run.hold, true, atMs, step.holdMs);
  const reading = { cents: (exact - (settledMidi ?? exact)) * 100, octaves: 0, inTune: true };
  return {
    ...run,
    hz,
    reading,
    hold,
    settledMidi,
    longestHeldMs: Math.max(run.longestHeldMs, hold.heldMs),
    closest: reading,
    closestHz: hz,
    clockMs: atMs,
  };
}

export function runReducer(run: Run, event: RunEvent): Run {
  switch (event.type) {
    case 'start':
      if (event.steps.length === 0) return NO_RUN;
      return { ...NO_RUN, steps: event.steps, phase: 'tone', turn: run.turn + 1 };

    case 'listen': {
      if (run.phase !== 'tone') return run;
      const step = run.steps[run.index];
      return {
        ...run,
        phase: 'listening',
        deadlineMs: event.atMs + step.listenMs,
        clockMs: event.atMs,
      };
    }

    case 'pitch': {
      if (run.phase !== 'listening' || run.deadlineMs === null) return run;
      const step = run.steps[run.index];
      if (step.volume !== undefined) {
        const heard = hearVolume(run, step, step.volume, event.hz, event.db, event.atMs);
        const finished = step.volume.kind === 'match' && heard.hold.done;
        return finished || event.atMs >= run.deadlineMs ? endVolume(heard, step, step.volume) : heard;
      }
      const path = stepPath(step);
      if (path !== null) {
        const heard = hearPath(run, path, event.hz, event.atMs);
        const over =
          heard.slideStartedAt !== null && event.atMs - heard.slideStartedAt >= path.totalMs;
        return over || event.atMs >= run.deadlineMs ? endPath(heard, step, path) : heard;
      }
      const next =
        step.midi === null
          ? hearAnyNote(run, step, event.hz, event.atMs)
          : hearNote(run, step, step.midi, event.hz, event.atMs);
      if (next.hold.done) return endStep(next, true);
      if (event.atMs >= run.deadlineMs) return endStep(next, false);
      return next;
    }

    case 'tick': {
      if (run.phase !== 'listening' || run.deadlineMs === null) return run;
      const path = stepPath(run.steps[run.index]);
      const slideOver =
        path !== null &&
        run.slideStartedAt !== null &&
        event.atMs - run.slideStartedAt >= path.totalMs;
      if (slideOver) return endStep({ ...run, clockMs: event.atMs }, false);
      if (event.atMs >= run.deadlineMs) return endStep(run, false);
      return { ...run, clockMs: event.atMs };
    }

    case 'stop':
      if (run.phase === 'ready') return run;
      return { ...NO_RUN, turn: run.turn };
  }
}
