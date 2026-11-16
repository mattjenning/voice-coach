/**
 * The state of one practice session, and every way it can change.
 *
 * Pure logic. The screen sends events in ("a pitch was heard", "the target
 * moved") and draws whatever state comes back. Nothing here knows about the
 * microphone or the screen, so it is tested without a phone.
 */
import { NOT_HOLDING, advanceHold, compareToTarget, type HoldState } from './hold.ts';

/** The notes that can be chosen as a target. C2 to C5 covers bass through alto. */
export const LOWEST_TARGET = 36; // C2
export const HIGHEST_TARGET = 72; // C5
export const FIRST_TARGET = 48; // C3

export type Practice = {
  /** Note number of the note to match. */
  target: number;
  /** The pitch being sung right now, or null for silence. */
  hz: number | null;
  hold: HoldState;
  /** Notes matched since the app opened. */
  matched: number;
};

export type PracticeEvent =
  | { type: 'pitch'; hz: number | null; atMs: number }
  | { type: 'target'; midi: number }
  | { type: 'again' }
  | { type: 'quiet' };

export const START: Practice = {
  target: FIRST_TARGET,
  hz: null,
  hold: NOT_HOLDING,
  matched: 0,
};

function clampTarget(midi: number): number {
  return Math.min(HIGHEST_TARGET, Math.max(LOWEST_TARGET, Math.round(midi)));
}

export function practiceReducer(state: Practice, event: PracticeEvent): Practice {
  switch (event.type) {
    case 'pitch': {
      const inTune = event.hz !== null && compareToTarget(event.hz, state.target).inTune;
      const hold = advanceHold(state.hold, inTune, event.atMs);
      const justMatched = hold.done && !state.hold.done;
      return { ...state, hz: event.hz, hold, matched: state.matched + (justMatched ? 1 : 0) };
    }
    case 'target':
      return { ...state, target: clampTarget(event.midi), hold: NOT_HOLDING };
    case 'again':
      return { ...state, hold: NOT_HOLDING };
    case 'quiet':
      // Listening stopped or the reference tone is playing. A finished hold
      // stays finished; an unfinished one starts over.
      return { ...state, hz: null, hold: state.hold.done ? state.hold : NOT_HOLDING };
  }
}
