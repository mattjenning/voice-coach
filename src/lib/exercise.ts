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
import { hzToMidi } from './notes.ts';

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
};

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

/** Close the step in play and move to the next one, or finish. */
function endStep(run: Run, matched: boolean): Run {
  const step = run.steps[run.index];
  const sungHz = run.closestHz;
  const result: StepResult = {
    step,
    matched,
    closestCents: run.closest === null ? null : run.closest.cents,
    sungMidi:
      step.midi === null ? run.settledMidi : sungHz === null ? null : Math.round(hzToMidi(sungHz)),
    heldMs: Math.min(run.longestHeldMs, step.holdMs),
  };
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
      const next =
        step.midi === null
          ? hearAnyNote(run, step, event.hz, event.atMs)
          : hearNote(run, step, step.midi, event.hz, event.atMs);
      if (next.hold.done) return endStep(next, true);
      if (event.atMs >= run.deadlineMs) return endStep(next, false);
      return next;
    }

    case 'tick':
      if (run.phase !== 'listening' || run.deadlineMs === null) return run;
      if (event.atMs >= run.deadlineMs) return endStep(run, false);
      return { ...run, clockMs: event.atMs };

    case 'stop':
      if (run.phase === 'ready') return run;
      return { ...NO_RUN, turn: run.turn };
  }
}
