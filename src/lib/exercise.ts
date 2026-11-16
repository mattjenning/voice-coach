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
};

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

export function slideMs(slide: Slide): number {
  return slide.leadMs + slide.glideMs + slide.tailMs;
}

/** A slide from one note to another, in the usual shape. Give `viaMidi` to make it turn. */
export function slideStep(fromMidi: number, toMidi: number, viaMidi?: number): Step {
  const slide: Slide = { toMidi, ...SLIDE_SHAPE };
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
  /** For a slide: when the singer started, and how the readings since have gone. */
  slideStartedAt: number | null;
  slideHeard: number;
  slideOnLine: number;
  slideErrorSum: number;
  slideVoiced: number;
  /** The sung pitch over the slide, for drawing: time since the start, and note number. */
  trace: { tMs: number; midi: number }[];
  results: StepResult[];
};

export type RunEvent =
  | { type: 'start'; steps: Step[] }
  /** The tone has finished and the microphone is on. */
  | { type: 'listen'; atMs: number }
  | { type: 'pitch'; hz: number | null; atMs: number }
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
  trace: [] as { tMs: number; midi: number }[],
};

export const NO_RUN: Run = {
  steps: [],
  index: 0,
  phase: 'ready',
  turn: 0,
  results: [],
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
  if (step.slide !== undefined) return endSlide(run, step, step.slide);
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

/**
 * Close the slide in play. Its score is the share of readings on the line,
 * scaled down if the singer stopped before the slide was over.
 */
function endSlide(run: Run, step: Step, slide: Slide): Run {
  const total = slideMs(slide);
  const lastMs = run.trace.length === 0 ? 0 : run.trace[run.trace.length - 1].tMs;
  const sungThrough =
    run.slideStartedAt === null || run.clockMs === null
      ? 0
      : Math.min(1, Math.max(lastMs, run.clockMs - run.slideStartedAt) / total);
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
 * Score one reading against a slide. The slide's clock starts when the
 * singer does, so a slow start is not counted against them.
 */
function hearSlide(run: Run, fromMidi: number, slide: Slide, hz: number | null, atMs: number): Run {
  if (run.slideStartedAt === null && hz === null) return { ...run, hz, reading: null, clockMs: atMs };
  const startedAt = run.slideStartedAt ?? atMs;
  const tMs = atMs - startedAt;
  if (tMs > slideMs(slide)) return { ...run, slideStartedAt: startedAt, clockMs: atMs };

  const target = slideMidiAt(fromMidi, slide, tMs);
  let reading: TargetReading | null = null;
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
      if (step.slide !== undefined && step.midi !== null) {
        const heard = hearSlide(run, step.midi, step.slide, event.hz, event.atMs);
        const over =
          heard.slideStartedAt !== null &&
          event.atMs - heard.slideStartedAt >= slideMs(step.slide);
        return over || event.atMs >= run.deadlineMs ? endSlide(heard, step, step.slide) : heard;
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
      const slide = run.steps[run.index].slide;
      const slideOver =
        slide !== undefined &&
        run.slideStartedAt !== null &&
        event.atMs - run.slideStartedAt >= slideMs(slide);
      if (slideOver) return endStep({ ...run, clockMs: event.atMs }, false);
      if (event.atMs >= run.deadlineMs) return endStep(run, false);
      return { ...run, clockMs: event.atMs };
    }

    case 'stop':
      if (run.phase === 'ready') return run;
      return { ...NO_RUN, turn: run.turn };
  }
}
