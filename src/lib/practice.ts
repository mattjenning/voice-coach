/**
 * The state of one practice session, and every way it can change.
 *
 * Practice runs in rounds. One tap starts a round: the app plays the note,
 * then listens for a few seconds while you sing it back. The round ends when
 * you hold the note in tune, or when the time runs out.
 *
 * Pure logic. The screen sends events in ("the tone finished", "a pitch was
 * heard") and draws whatever state comes back. Nothing here knows about the
 * microphone or the screen, so it is tested without a phone.
 */
import {
  NOT_HOLDING,
  advanceHold,
  compareToTarget,
  type HoldState,
  type TargetReading,
} from './hold.ts';

/** The notes that can be chosen as a target. C2 to C5 covers bass through alto. */
export const LOWEST_TARGET = 36; // C2
export const HIGHEST_TARGET = 72; // C5
export const FIRST_TARGET = 48; // C3

/** How long the app listens after the tone. */
export const LISTEN_MS = 3500;

export type Phase =
  /** Nothing is happening. Waiting for a tap. */
  | 'idle'
  /** The reference tone is playing. The microphone is off. */
  | 'tone'
  /** The microphone is on and the clock is running. */
  | 'listening';

export type Practice = {
  /** Note number of the note to match. */
  target: number;
  phase: Phase;
  /** When listening stops, on the same clock as the pitch readings. */
  deadlineMs: number | null;
  /** The time of the latest reading, for showing how long is left. */
  clockMs: number | null;
  /** The pitch being sung right now, or null for silence. */
  hz: number | null;
  hold: HoldState;
  /** The best attempt of the round so far: the reading nearest the note. */
  closest: TargetReading | null;
  /** How the last round ended, or null if none has finished. */
  result: 'matched' | 'missed' | null;
  /** Notes matched since the app opened. */
  matched: number;
};

export type PracticeEvent =
  /** Start a round, on the current target or on another note. */
  | { type: 'begin'; midi?: number }
  /** The tone has finished and the microphone is on. */
  | { type: 'listen'; atMs: number }
  | { type: 'pitch'; hz: number | null; atMs: number }
  /** A clock tick, in case no sound arrives to move time along. */
  | { type: 'tick'; atMs: number }
  /** The round was stopped by hand, or could not start. */
  | { type: 'stop' }
  /** Choose another note between rounds. */
  | { type: 'target'; midi: number };

export const START: Practice = {
  target: FIRST_TARGET,
  phase: 'idle',
  deadlineMs: null,
  clockMs: null,
  hz: null,
  hold: NOT_HOLDING,
  closest: null,
  result: null,
  matched: 0,
};

function clampTarget(midi: number): number {
  return Math.min(HIGHEST_TARGET, Math.max(LOWEST_TARGET, Math.round(midi)));
}

function fresh(state: Practice, target: number): Practice {
  return { ...START, target, matched: state.matched };
}

/** Milliseconds of listening left, or 0 when not listening. */
export function timeLeftMs(state: Practice): number {
  if (state.phase !== 'listening' || state.deadlineMs === null || state.clockMs === null) return 0;
  return Math.max(0, state.deadlineMs - state.clockMs);
}

export function practiceReducer(state: Practice, event: PracticeEvent): Practice {
  switch (event.type) {
    case 'begin':
      return { ...fresh(state, clampTarget(event.midi ?? state.target)), phase: 'tone' };

    case 'listen':
      if (state.phase !== 'tone') return state;
      return {
        ...state,
        phase: 'listening',
        deadlineMs: event.atMs + LISTEN_MS,
        clockMs: event.atMs,
      };

    case 'pitch': {
      if (state.phase !== 'listening' || state.deadlineMs === null) return state;
      const reading = event.hz === null ? null : compareToTarget(event.hz, state.target);
      const hold = advanceHold(state.hold, reading !== null && reading.inTune, event.atMs);
      const closest =
        reading !== null &&
        (state.closest === null || Math.abs(reading.cents) < Math.abs(state.closest.cents))
          ? reading
          : state.closest;
      const next = { ...state, hz: event.hz, hold, closest, clockMs: event.atMs };
      if (hold.done) {
        return { ...next, phase: 'idle', result: 'matched', matched: state.matched + 1 };
      }
      if (event.atMs >= state.deadlineMs) {
        return { ...next, phase: 'idle', result: 'missed', hz: null, hold: NOT_HOLDING };
      }
      return next;
    }

    case 'tick':
      if (state.phase !== 'listening' || state.deadlineMs === null) return state;
      if (event.atMs < state.deadlineMs) return { ...state, clockMs: event.atMs };
      return {
        ...state,
        phase: 'idle',
        result: 'missed',
        hz: null,
        hold: NOT_HOLDING,
        clockMs: event.atMs,
      };

    case 'stop':
      if (state.phase === 'idle') return state;
      return fresh(state, state.target);

    case 'target':
      if (state.phase !== 'idle') return state;
      return fresh(state, clampTarget(event.midi));
  }
}
