/**
 * The first exercise: match a note and hold it.
 *
 * Pure logic. Given the pitch being sung and the target note, say how far
 * off it is, and keep count of how long it has been held in tune.
 */
import { centsBetween, midiToHz } from './notes.ts';

export const HOLD = {
  /** Within this many cents of the target counts as in tune. A semitone is 100. */
  toleranceCents: 25,
  /** Hold in tune this long to pass. */
  goalMs: 2000,
  /** A slip shorter than this does not reset the count. */
  graceMs: 250,
} as const;

export type TargetReading = {
  /** Distance from the target, or from its nearest octave. Positive is sharp. */
  cents: number;
  /** Whole octaves away from the target. 0 is the same octave, -1 is one below. */
  octaves: number;
  inTune: boolean;
};

/**
 * Compare a sung pitch with a target note.
 *
 * With `anyOctave` on, the same note in a higher or lower octave counts.
 * A low voice can then practise a note written for a high one, which is how
 * people sing along to songs outside their range.
 */
export function compareToTarget(hz: number, targetMidi: number, anyOctave = true): TargetReading {
  const raw = centsBetween(hz, midiToHz(targetMidi));
  const octaves = anyOctave ? Math.round(raw / 1200) : 0;
  const cents = raw - octaves * 1200;
  return { cents, octaves, inTune: Math.abs(cents) <= HOLD.toleranceCents };
}

export type HoldState = {
  /** When the current in-tune run began, or null if there is none. */
  startedAt: number | null;
  /** The last moment the note was in tune. */
  lastInTuneAt: number | null;
  heldMs: number;
  done: boolean;
};

export const NOT_HOLDING: HoldState = {
  startedAt: null,
  lastInTuneAt: null,
  heldMs: 0,
  done: false,
};

/**
 * Move the hold count forward by one reading.
 * `inTune` is false for an off note and for silence alike.
 */
export function advanceHold(state: HoldState, inTune: boolean, nowMs: number): HoldState {
  if (state.done) return state;
  if (inTune) {
    const startedAt = state.startedAt ?? nowMs;
    const heldMs = nowMs - startedAt;
    return { startedAt, lastInTuneAt: nowMs, heldMs, done: heldMs >= HOLD.goalMs };
  }
  const slipping =
    state.lastInTuneAt !== null && nowMs - state.lastInTuneAt <= HOLD.graceMs;
  return slipping ? state : NOT_HOLDING;
}

/** "one octave below", "two octaves above", or "" for the same octave. */
export function formatOctaves(octaves: number): string {
  if (octaves === 0) return '';
  const count = Math.abs(octaves);
  const words = ['', 'one octave', 'two octaves', 'three octaves'];
  const size = words[count] ?? `${count} octaves`;
  return `${size} ${octaves < 0 ? 'below' : 'above'}`;
}
